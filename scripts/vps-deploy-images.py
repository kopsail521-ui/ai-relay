#!/usr/bin/env python3
"""Inspect-preserving local Docker deployment. No upstream/API-key probes.
Usage: sudo python3 scripts/vps-deploy-images.py [deploy|native|moderation|diagnostics|rollback]
Run on the VPS after syncing reviewed source. Existing containers are required.
"""
import argparse
import copy
import fcntl
import http.client
import json
import os
import posixpath
import socket
import subprocess
import time
from pathlib import Path

ROOT = Path('/opt/ai-relay')
SERVICES = {
    'native': ('ai-relay-apimart-passthrough', 'services/apimart-passthrough', 'keyo-apimart-passthrough:images-reviewed', 3011),
    'moderation': ('ai-relay-creem-moderation', 'services/creem-moderation-proxy', 'keyo-creem-moderation:images-reviewed', 3001),
}

class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(30)
        self.sock.connect('/var/run/docker.sock')


def api(method, route, body=None):
    connection = UnixHTTP('localhost', timeout=30)
    try:
        connection.request(method, '/v1.41' + route, json.dumps(body) if body is not None else None,
                           {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read()
        if response.status >= 400:
            # Docker errors can include configuration; never print arbitrary responses.
            raise RuntimeError('Docker operation failed: ' + method + ' ' + route.split('?')[0] + ' status=' + str(response.status))
        return json.loads(data) if data else None
    finally:
        connection.close()


def inspect(name):
    return api('GET', '/containers/' + name + '/json')


def environments(config):
    return dict(item.split('=', 1) for item in config.get('Env', []) if '=' in item)


def set_env(config, key, default):
    env = environments(config)
    if key not in env:
        config.setdefault('Env', []).append(key + '=' + default)
        env[key] = default
    return env[key]


def mounts(container):
    return container.get('Mounts', [])


def covering_mount(container, destination):
    destination = posixpath.normpath(destination)
    return next((m for m in sorted(mounts(container), key=lambda m: len(m['Destination']), reverse=True)
                 if destination == m['Destination'] or destination.startswith(m['Destination'].rstrip('/') + '/')), None)


def persistent_mount(mount):
    return bool(mount and mount.get('Type') in ('bind', 'volume') and mount.get('RW'))


def append_bind(body, bind):
    # Docker inspect commonly returns null for Binds on containers using --mount.
    host = body['HostConfig']
    if host.get('Binds') is None:
        host['Binds'] = []
    host['Binds'].append(bind)


def absolute_target(value, key):
    if not value.startswith('/') or value == '/':
        raise RuntimeError(key + ' must be an absolute storage path')
    return posixpath.normpath(value)


def add_bind(container, body, source, destination, writable):
    current = covering_mount(container, destination)
    if current:
        if writable and not persistent_mount(current):
            raise RuntimeError('Required storage needs a writable persistent bind/volume mount')
        return
    if writable and not Path(source).is_dir():
        # Directory creation is explicit and never chmods or deletes existing data.
        Path(source).mkdir(parents=True, exist_ok=True)
    elif not writable and not Path(source).is_file():
        raise RuntimeError('Required catalog missing: ' + source)
    append_bind(body, source + ':' + destination + (':rw' if writable else ':ro'))


def replacement(container, service, image):
    # The Docker API accepts Config fields plus HostConfig: retain runtime limits,
    # users, commands, ports, restart policy, bind/volume mounts and networking.
    body = copy.deepcopy(container['Config'])
    body.pop('Healthcheck', None) if body.get('Healthcheck') is None else None
    body['Image'] = image
    body['HostConfig'] = copy.deepcopy(container['HostConfig'])
    # Preserve named AND anonymous volumes too: Config.Volumes alone would create
    # new anonymous volumes. Binds/structured Mounts take precedence.
    configured = set()
    for bind in body['HostConfig'].get('Binds') or []:
        configured.add(bind.split(':')[1])
    for mount in body['HostConfig'].get('Mounts') or []:
        configured.add(mount['Target'])
    configured.update(body['HostConfig'].get('Tmpfs') or {})
    for mount in mounts(container):
        if mount['Destination'] not in configured and mount['Type'] in ('volume', 'bind'):
            source = mount.get('Name') if mount['Type'] == 'volume' else mount['Source']
            append_bind(body, source + ':' + mount['Destination'] + (':rw' if mount.get('RW') else ':ro'))
    endpoint_configs = {}
    for name, network in container.get('NetworkSettings', {}).get('Networks', {}).items():
        endpoint_configs[name] = {k: copy.deepcopy(network[k]) for k in ('IPAMConfig', 'Links', 'Aliases', 'DriverOpts') if network.get(k) is not None}
    if body['HostConfig'].get('NetworkMode') not in ('host', 'none'):
        body['NetworkingConfig'] = {'EndpointsConfig': endpoint_configs}
    if service == 'moderation':
        upload = set_env(body, 'UPLOAD_DIR', '/opt/ai-relay/static/uploads')
        upload = absolute_target(upload, 'UPLOAD_DIR')
        add_bind(container, body, str(ROOT / 'static/uploads'), upload, True)
        catalog = set_env(body, 'VIDEO_CATALOG', '/app/video-catalog.json')
        add_bind(container, body, str(ROOT / 'services/apimart-passthrough/catalog.json'), catalog, False)
        set_env(body, 'VIDEO_GEN_URL', 'http://127.0.0.1:3011')
        set_env(body, 'UPLOAD_AUTH_TIMEOUT_MS', '5000')
        set_env(body, 'IMAGE_FORWARD_TIMEOUT_MS', '360000')
        current = covering_mount(container, upload)
        if current and (current.get('Type') != 'bind' or current.get('Source') != str(ROOT / 'static/uploads')):
            print('NOTICE: upload mount retained; verify Caddy serves its source. Public upload readback is not verified.')
    else:
        env = environments(body)
        if not env.get('IMAGE_TRUSTED_PROXIES'):
            if body['HostConfig'].get('NetworkMode') == 'host' and env.get('LISTEN_HOST', '127.0.0.1') in ('127.0.0.1', '::1'):
                body['Env'] = [item for item in body.get('Env', []) if not item.startswith('IMAGE_TRUSTED_PROXIES=')]
                body['Env'].append('IMAGE_TRUSTED_PROXIES=127.0.0.1/32,::1/128')
            else:
                raise RuntimeError('Explicit IMAGE_TRUSTED_PROXIES is required outside loopback host networking')
        db = absolute_target(set_env(body, 'NEW_API_DB', '/data/one-api.db'), 'NEW_API_DB')
        existing = covering_mount(container, db)
        if existing:
            if not persistent_mount(existing):
                raise RuntimeError('NEW_API_DB needs a writable persistent bind/volume mount')
        elif db.startswith('/data/'):
            source_db = ROOT / 'data/new-api' / db.removeprefix('/data/')
            if not source_db.is_file():
                raise RuntimeError('Existing New API database is required; refusing an empty database')
            add_bind(container, body, str(ROOT / 'data/new-api'), '/data', True)
        else:
            raise RuntimeError('NEW_API_DB is not covered by a persistent writable mount')
        # WAL/SHM are sibling files; reject overlays hiding that shared directory.
        parent = covering_mount(container, posixpath.dirname(db))
        if existing and (existing['Destination'] == db or parent != existing):
            raise RuntimeError('Mount the database DIRECTORY so SQLite WAL/SHM remain persistent')
        ack = absolute_target(set_env(body, 'IMAGE_DELIVERY_ACK_DIR', db + '.image-delivery'), 'IMAGE_DELIVERY_ACK_DIR')
        ack_mount = covering_mount(container, ack)
        if ack_mount:
            if not persistent_mount(ack_mount):
                raise RuntimeError('IMAGE_DELIVERY_ACK_DIR needs a writable persistent directory mount')
            if ack_mount['Type'] == 'bind' and not Path(ack_mount['Source']).is_dir():
                raise RuntimeError('IMAGE_DELIVERY_ACK_DIR bind source must be an existing directory')
        elif not (not existing and ack.startswith('/data/')):
            raise RuntimeError('Custom IMAGE_DELIVERY_ACK_DIR must already be mounted persistently')
    return body


def storage_identity(container, target):
    mount = covering_mount(container, target)
    if not persistent_mount(mount) or mount['Destination'] == target:
        raise RuntimeError('Wallet database requires a writable persistent directory mount')
    relative = posixpath.relpath(target, mount['Destination'])
    if mount['Type'] == 'bind':
        return ('bind', posixpath.normpath(posixpath.join(mount['Source'], relative)))
    return ('volume', mount['Name'], relative)


def validate_wallet(native, plan, wallet):
    # Ledger writes SQLite balances and logs directly; cache/batch/remote DBs are
    # unsupported. Inspect only, do not print values or change wallet settings.
    env = environments(wallet['Config'])
    if env.get('REDIS_CONN_STRING'):
        raise RuntimeError('Native image billing is incompatible with New API REDIS_CONN_STRING')
    if env.get('BATCH_UPDATE_ENABLED') == 'true':
        raise RuntimeError('Native image billing is incompatible with New API BATCH_UPDATE_ENABLED')
    if env.get('SQL_DSN') and not env['SQL_DSN'].startswith('local'):
        raise RuntimeError('Native image billing requires New API SQLite SQL_DSN')
    if env.get('LOG_SQL_DSN') and not env['LOG_SQL_DSN'].startswith('local'):
        raise RuntimeError('Native image billing requires logs in the same New API SQLite database')
    sqlite = env.get('SQLITE_PATH') or 'one-api.db?_busy_timeout=30000'
    sqlite = sqlite.split('?', 1)[0]
    if not sqlite.startswith('/'):
        working_dir = wallet['Config'].get('WorkingDir')
        if not working_dir or not working_dir.startswith('/'):
            raise RuntimeError('New API SQLite working directory is not explicit')
        sqlite = posixpath.join(working_dir, sqlite)
    sqlite = absolute_target(sqlite, 'SQLITE_PATH')
    db = absolute_target(environments(plan)['NEW_API_DB'], 'NEW_API_DB')
    effective = copy.deepcopy(native)
    if not covering_mount(effective, db):
        effective.setdefault('Mounts', []).append({'Type': 'bind', 'Source': str(ROOT / 'data/new-api'),
                                                  'Destination': '/data', 'RW': True})
    if storage_identity(effective, db) != storage_identity(wallet, sqlite):
        raise RuntimeError('Native image billing and New API must share the same persistent SQLite file')


def run_checked(args, timeout=600):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1] + ' (output withheld to protect configuration)')


def health(name, port, config=None, service=None):
    env = environments(config or {})
    try:
        port = int(env.get('PORT', port))
    except (TypeError, ValueError):
        raise RuntimeError('Invalid health check port') from None
    host = env.get('LISTEN_HOST', '127.0.0.1')
    if host in ('0.0.0.0', '::'): host = '127.0.0.1'
    if ':' in host: host = '[' + host + ']'
    if not 1 <= port <= 65535: raise RuntimeError('Invalid health check port')
    url = 'http://' + host + ':' + str(port) + '/healthz'
    assertion = "j.ok===true&&j.storage==='ready'" if service == 'moderation' else "j.image_ledger?.ok===true&&j.image_ledger?.storage==='new_api_sqlite'&&j.image_ledger?.delivery_ack_writable===true"
    source = "const r=await fetch(%s,{signal:AbortSignal.timeout(3000)});const j=await r.json();if(!r.ok||!(%s))process.exit(1);" % (json.dumps(url), assertion)
    for _ in range(20):
        result = subprocess.run(['docker', 'exec', name, 'node', '--input-type=module', '-e', source],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Local container health check failed: ' + name)


def diagnostics():
    # READ ONLY: no write probes, auth calls, logs, full inspect or env output.
    for service, (name, _, _, _) in SERVICES.items():
        container = inspect(name)
        env = environments(container['Config'])
        target = env.get('UPLOAD_DIR', '/opt/ai-relay/static/uploads') if service == 'moderation' else env.get('NEW_API_DB', '/data/one-api.db')
        mount = covering_mount(container, target)
        record = {'service': service, 'running': container['State']['Running'], 'image_id': container['Image'],
                  'storage_target': target, 'persistent_mount': bool(mount), 'writable_mount': bool(mount and mount.get('RW'))}
        if mount and mount.get('Type') == 'bind':
            source = Path(mount['Source'])
            try:
                stat = source.stat()
                record.update({'source': str(source), 'uid': stat.st_uid, 'gid': stat.st_gid, 'mode': oct(stat.st_mode & 0o777)})
                vfs = os.statvfs(source)
                record.update({'available_bytes': vfs.f_bavail * vfs.f_frsize, 'available_inodes': vfs.f_favail})
            except OSError as error:
                record['storage_errno'] = error.errno
        print(json.dumps(record))


def deploy(selected):
    snapshots = {service: inspect(SERVICES[service][0]) for service in selected}
    plans = {}
    # Build and validate everything before stopping either current container.
    for service in selected:
        name, directory, image, _ = SERVICES[service]
        try:
            inspect(name + '-images-rollback')
        except RuntimeError as error:
            if 'status=404' not in str(error): raise
        else:
            raise RuntimeError('Rollback container already exists; retain/archive it explicitly before another deployment')
        plans[service] = replacement(snapshots[service], service, image)
    if 'native' in selected:
        validate_wallet(snapshots['native'], plans['native'], inspect('ai-relay-new-api'))
    for service in selected:
        _, directory, image, _ = SERVICES[service]
        run_checked(['docker', 'build', '-t', image, str(ROOT / directory)])
    changed = []
    stopped = []
    try:
        for service in selected:
            name, _, _, port = SERVICES[service]
            api('POST', '/containers/' + name + '/stop?t=30')
            stopped.append(service)
            api('POST', '/containers/' + name + '/rename?name=' + name + '-images-rollback')
            changed.append(service)
            api('POST', '/containers/create?name=' + name, plans[service])
            api('POST', '/containers/' + name + '/start')
            health(name, port, plans[service], service)
    except Exception as original:
        failures = []
        for service in reversed(stopped):
            try:
                if service in changed:
                    restore(service)
                elif snapshots[service]['State']['Running']:
                    api('POST', '/containers/' + SERVICES[service][0] + '/start')
            except Exception: failures.append(service)
        if failures: raise RuntimeError('Deployment failed; rollback incomplete for: ' + ', '.join(failures)) from original
        raise
    print('Deployment passed local health checks. Old containers retained. Rollback: sudo python3 scripts/vps-deploy-images.py rollback')


def restore(service):
    name = SERVICES[service][0]
    try: api('DELETE', '/containers/' + name + '?force=true')
    except RuntimeError as error:
        if 'status=404' not in str(error): raise
    api('POST', '/containers/' + name + '-images-rollback/rename?name=' + name)
    api('POST', '/containers/' + name + '/start')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['deploy', 'all', 'native', 'moderation', 'diagnostics', 'diagnose', 'rollback'], nargs='?', default='diagnostics')
    args = parser.parse_args()
    if args.action in ('diagnostics', 'diagnose'):
        diagnostics()
        return
    # Serialize all deploy/rollback entrypoints to avoid racing container renames.
    with open('/run/lock/keyo-image-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'rollback':
            available = []
            for service, (name, _, _, _) in SERVICES.items():
                try: inspect(name + '-images-rollback')
                except RuntimeError as error:
                    if 'status=404' not in str(error): raise
                else: available.append(service)
            if not available: raise RuntimeError('No rollback containers available')
            failures = []
            for service in reversed(available):
                try: restore(service)
                except Exception: failures.append(service)
            if failures: raise RuntimeError('Rollback incomplete for: ' + ', '.join(failures))
            print('Previous containers restored; database/task state retained')
        else:
            deploy([args.action] if args.action in ('native', 'moderation') else ['native', 'moderation'])

if __name__ == '__main__':
    try: main()
    except Exception as error:
        raise SystemExit('Deployment stopped: ' + str(error))
