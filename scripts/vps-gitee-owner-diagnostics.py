#!/usr/bin/env python3
"""Read-only owner evidence for port 3010. Never stops a service or reads env files."""
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import posixpath
import re
import subprocess

ROOT = Path('/opt/ai-relay')
NAME = 'ai-relay-gitee-passthrough'
SCRIPT = '/opt/ai-relay/services/gitee-passthrough/server.mjs'
SOURCES = ('server.mjs', 'decisions.mjs', 'fix-marketplace-meta.mjs', 'catalog.json')
PORT = 3010
NODE_FLAGS = {'--experimental-sqlite', '--no-warnings', '--trace-warnings',
              '--no-deprecation', '--trace-deprecation', '--enable-source-maps'}


def integer(value, minimum=0):
    return value if type(value) is int and value >= minimum else None


def safe_path(value):
    if (isinstance(value, str) and re.fullmatch(r'/[A-Za-z0-9_./-]{0,500}', value)
            and '..' not in value.split('/')):
        return value
    return None


def digest(value):
    return hashlib.sha256(str(value).encode()).hexdigest()


def load_helper():
    spec = importlib.util.spec_from_file_location('keyo_owner_native_readonly',
                                                ROOT / 'scripts/vps-deploy-native-images-safe.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = ROOT
    helper = module.load_helper()
    original_api = helper.api

    def readonly_api(method, route, body=None):
        if method != 'GET' or route != '/containers/' + NAME + '/json' or body is not None:
            raise RuntimeError('Read-only diagnostic refuses this Docker operation')
        return original_api(method, route)

    helper.api = readonly_api
    return helper


def selected_env(config):
    values = {}
    for item in config.get('Env') or []:
        if not isinstance(item, str) or '=' not in item:
            continue
        key, value = item.split('=', 1)
        if key == 'PORT':
            values[key] = value if value.isdecimal() and 0 < int(value) < 65536 else None
        elif key == 'LISTEN_HOST':
            values[key] = value if value in ('127.0.0.1', '::1', '0.0.0.0', '::') else None
        elif key == 'NEW_API_DB':
            values[key] = safe_path(value)
    return values


def container_summary(info):
    state, config, host = info.get('State') or {}, info.get('Config') or {}, info.get('HostConfig') or {}
    result = {
        'name': NAME,
        'container_id': info.get('Id') if re.fullmatch(r'[0-9a-f]{64}', str(info.get('Id'))) else None,
        'image_id': info.get('Image') if re.fullmatch(r'sha256:[0-9a-f]{64}', str(info.get('Image'))) else None,
        'state': {key: state.get(key) is True for key in ('Running', 'Restarting', 'Dead', 'OOMKilled')},
        'selected_env': selected_env(config), 'mounts': [],
        'network_mode': host.get('NetworkMode') if host.get('NetworkMode') in ('host', 'none', 'bridge') else 'custom',
        'restart_policy': (host.get('RestartPolicy') or {}).get('Name')
                          if (host.get('RestartPolicy') or {}).get('Name') in ('no', 'always', 'unless-stopped', 'on-failure') else None,
        'command_matches_standard_node_server': config.get('Cmd') in (['node', 'server.mjs'], ['node', '--experimental-sqlite', 'server.mjs']),
        'working_dir_is_app': config.get('WorkingDir') == '/app',
    }
    result['state']['Status'] = state.get('Status') if state.get('Status') in (
        'created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead') else None
    result['state']['Pid'] = integer(state.get('Pid'))
    result['state']['ExitCode'] = integer(state.get('ExitCode'))
    result['restart_count'] = integer(info.get('RestartCount'))
    for mount in info.get('Mounts') or []:
        result['mounts'].append({
            'type': mount.get('Type') if mount.get('Type') in ('bind', 'volume', 'tmpfs') else None,
            'source': safe_path(mount.get('Source')), 'source_identity_sha256': digest(mount.get('Source')),
            'destination': safe_path(mount.get('Destination')), 'writable': mount.get('RW') is True,
            'volume_name': mount.get('Name') if re.fullmatch(r'[A-Za-z0-9_.-]{1,160}', str(mount.get('Name'))) else None,
        })
    return result


def listeners():
    try:
        completed = subprocess.run(['ss', '-H', '-lntp', '( sport = :3010 )'],
                                   capture_output=True, text=True, timeout=10, check=False)
        if completed.returncode:
            return {'status': 'unavailable', 'pids': []}
        lines = completed.stdout.splitlines()
        return {'status': 'ok', 'listening': bool(lines),
                'pids': sorted({int(pid) for line in lines for pid in re.findall(r'pid=(\d+)', line)}),
                'complete': bool(lines) and all(re.search(r'pid=\d+', line) for line in lines)}
    except (OSError, subprocess.TimeoutExpired):
        return {'status': 'unavailable', 'pids': []}


def limited_bytes(path, maximum):
    with path.open('rb') as stream:
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Diagnostic field exceeds bound')
    return data


def process_stat(directory):
    # /proc/stat's command can include spaces and parentheses; it is never output.
    tail = limited_bytes(directory / 'stat', 16384).decode(errors='replace').rpartition(') ')[2].split()
    return {'parent_pid': int(tail[1]), 'start_ticks': int(tail[19])}


def script_argument(args, cwd):
    for arg in args[1:]:
        if arg == '--':
            continue
        if arg.startswith('-'):
            if arg not in NODE_FLAGS:
                return None
            continue
        candidate = posixpath.normpath(arg if arg.startswith('/') else posixpath.join(cwd, arg))
        return candidate if candidate in (SCRIPT, '/app/server.mjs') else None
    return None


def namespace(directory):
    try:
        return os.readlink(directory / 'ns/mnt')
    except OSError:
        return None


def process_summary(pid, canonical, proc=Path('/proc')):
    directory = proc / str(pid)
    result = {'pid': pid, 'available': False, 'process_environment_read': False}
    try:
        before = process_stat(directory)
        exe = os.readlink(directory / 'exe')
        cwd = os.readlink(directory / 'cwd')
        args = [part.decode(errors='replace') for part in limited_bytes(directory / 'cmdline', 16384).split(b'\0') if part]
        cgroup = limited_bytes(directory / 'cgroup', 16384).decode(errors='replace')
        node = posixpath.basename(exe) in ('node', 'nodejs')
        candidate = script_argument(args, cwd) if node else None
        own_ns, host_ns = namespace(directory), namespace(proc / '1')
        canonical_pid = integer((canonical.get('State') or {}).get('Pid'), 1)
        canonical_ns = namespace(proc / str(canonical_pid)) if canonical_pid else None
        identity = canonical.get('Id') or ''
        units = set()
        for entry in cgroup.splitlines():
            for part in entry.split('/'):
                if (re.fullmatch(r'[A-Za-z0-9_.@-]{1,160}\.service', part)
                        and re.search(r'keyo|gitee', part, re.I)):
                    units.add(part)
        after = process_stat(directory)
        result.update(available=True, **before, identity_stable=before == after,
                      executable_is_node=node,
                      executable_known_path=exe if exe in ('/usr/bin/node', '/usr/local/bin/node', '/bin/node', '/usr/bin/nodejs') else None,
                      cwd_known_path=cwd if cwd in (str(ROOT), posixpath.dirname(SCRIPT), '/app') else None,
                      cwd_is_project_root=cwd == str(ROOT), cwd_is_service_dir=cwd == posixpath.dirname(SCRIPT),
                      recognized_entry_script=candidate,
                      exact_host_gitee_script=node and candidate == SCRIPT,
                      docker_entry_script=node and candidate == '/app/server.mjs',
                      argument_count=len(args), recognized_service_units=sorted(units),
                      docker_cgroup=bool(re.search(r'(?:docker[-/])[0-9a-f]{64}', cgroup)),
                      cgroup_matches_canonical=bool(re.fullmatch(r'[0-9a-f]{64}', identity) and identity in cgroup),
                      mount_namespace_is_host=own_ns == host_ns if own_ns and host_ns else None,
                      mount_namespace_is_canonical=own_ns == canonical_ns if own_ns and canonical_ns else None)
    except (OSError, ValueError, IndexError, TypeError):
        result['status'] = 'unavailable_or_changed'
    return result


def local_health():
    connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=3)
    try:
        connection.request('GET', '/healthz')
        response = connection.getresponse()
        raw = response.read(65537)
        result = {'http_status': response.status}
        if len(raw) > 65536:
            return dict(result, status='oversized')
        body = json.loads(raw)
        result.update({key: body.get(key) is True for key in ('ok', 'db', 'key')})
        result['build'] = body.get('build') if re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', str(body.get('build'))) else None
        result['models'] = integer(body.get('models'))
        return result
    except Exception:
        return {'status': 'unavailable_or_invalid'}
    finally:
        connection.close()


def source_manifest():
    result = {}
    for name in SOURCES:
        path = ROOT / 'services/gitee-passthrough' / name
        try:
            result[name] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() and not path.is_symlink() else None
        except OSError:
            result[name] = None
    return result


def collect(helper):
    info = helper.inspect(NAME)
    first = listeners()
    report = {'result': 'GITEE_OWNER_READONLY_OK', 'read_only': True,
              'canonical': container_summary(info), 'listener': first,
              'processes': [process_summary(pid, info) for pid in first['pids']],
              'health': local_health(), 'host_files_sha256': source_manifest(),
              'limits': ['Process environ, env files, database contents and request logs are not read. Command lines are parsed internally; only allowlisted identity fields are output.',
                         'Host file hashes describe files currently on disk, not modules loaded by an older Node process.',
                         'The real process configuration may differ from the stopped container; do not restart, kill or migrate on this evidence alone.']}
    second = listeners()
    report['listener_stable_across_probe'] = first == second
    return report


def main():
    try:
        print(json.dumps(collect(load_helper()), sort_keys=True))
    except Exception:
        # Do not print exception text, Docker responses, /proc bytes or credentials.
        print(json.dumps({'result': 'GITEE_OWNER_READONLY_UNAVAILABLE', 'read_only': True}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
