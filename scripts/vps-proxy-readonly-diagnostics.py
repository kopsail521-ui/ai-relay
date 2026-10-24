#!/usr/bin/env python3
"""Read-only deployment evidence. No credentials, request logs, or model calls."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path('/opt/ai-relay')
SOURCE = ROOT / 'services/creem-moderation-proxy'
FILES = ('server.mjs', 'public-model-metadata.mjs', 'model-contracts.json', 'model-icon-inject.js')
ENV_KEYS = ('PORT', 'LISTEN_HOST', 'UPSTREAM_URL', 'UPLOAD_DIR')
MODELS = ('InfiniteTalk', 'seedance-2.5', 'nemotron-3-ultra-550b-a55b:free', 'gpt-6-luna')


def command(args, timeout=15):
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, timeout=timeout, check=False)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return -1, ''


def sha(path):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def public_url(value):
    """Never print embedded credentials, query strings, or fragments."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return '[invalid URL]'
        host = parsed.hostname
        if ':' in host:
            host = '[' + host + ']'
        if parsed.port:
            host += ':' + str(parsed.port)
        return urlunsplit((parsed.scheme, host, parsed.path, '', ''))
    except ValueError:
        return '[invalid URL]'


def container_summary(info):
    config, state = info.get('Config') or {}, info.get('State') or {}
    env = dict(entry.split('=', 1) for entry in config.get('Env') or [] if '=' in entry)
    selected = {key: env[key] for key in ENV_KEYS if key in env}
    if 'UPSTREAM_URL' in selected:
        selected['UPSTREAM_URL'] = public_url(selected['UPSTREAM_URL'])
    return {
        'name': str(info.get('Name', '')).lstrip('/'),
        'image_name': config.get('Image'), 'image_id': info.get('Image'),
        'state': {key: state.get(key) for key in ('Status', 'Running', 'Restarting', 'Pid', 'StartedAt')},
        'network': (info.get('HostConfig') or {}).get('NetworkMode'),
        'port_bindings': (info.get('NetworkSettings') or {}).get('Ports'),
        'selected_env': selected,
        'mounts': [{key: mount.get(key) for key in ('Type', 'Name', 'Source', 'Destination', 'RW')}
                   for mount in info.get('Mounts') or []],
        'image_revision': (config.get('Labels') or {}).get('org.opencontainers.image.revision'),
    }, env


def pricing_summary(payload):
    data = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return {'valid_pricing': False}
    by_name = {row.get('model_name', row.get('model')): row for row in data if isinstance(row, dict)}
    keys = ('model_name', 'capability', 'billing_unit', 'contract_status', 'supported_endpoint_types')
    return {
        'valid_pricing': True, 'model_count': len(data),
        'models_with_capability': sum('capability' in row for row in data if isinstance(row, dict)),
        'models_with_billing_unit': sum('billing_unit' in row for row in data if isinstance(row, dict)),
        'openai_endpoint': {key: value for key, value in
                            ((payload.get('supported_endpoint') or {}).get('openai') or {}).items()
                            if key in ('path', 'method', 'content_type', 'poll_path')},
        'selected_models': {name: {key: by_name[name].get(key) for key in keys}
                            for name in MODELS if name in by_name},
    }


def http_summary(base, path):
    # This list intentionally excludes generation, task submission, and login APIs.
    assert path in ('/api/pricing', '/pricing', '/sign-in', '/sign-up')
    result = {'endpoint': public_url(base) + path}
    try:
        request = Request(base + path, headers={'Cache-Control': 'no-cache',
                                               'User-Agent': 'Keyo-ReadOnly-Deployment-Diagnostic'})
        with urlopen(request, timeout=12) as response:
            body = response.read(3 * 1024 * 1024)
            result.update(status=response.status, final_url=public_url(response.geturl()))
        if path == '/api/pricing':
            result.update(pricing_summary(json.loads(body)))
        else:
            text = body.decode('utf-8', errors='replace')
            result.update(
                html_sha256=hashlib.sha256(body).hexdigest(),
                js_entries=sorted(set(urlsplit(entry).path for entry in re.findall(
                    r'''(?:src|href)=["']([^"']*(?:index|main)[^"']*\.js(?:\?[^"']*)?)["']''', text))),
                markers={marker: marker in text for marker in
                         ('iconsv6', 'keyo-model-icons-v6', 'keyo-oauth-enable',
                          'keyo-pricing-sort-v21', 'keyo-billing-unit')})
    except Exception as error:
        # URLs/response bodies/exception messages may contain sensitive data.
        result['error_class'] = type(error).__name__
    return result


def caddy_summary():
    result = {'config_sha256': sha('/etc/caddy/Caddyfile'), 'routes': []}
    code, raw = command(['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], 15)
    if code:
        result['status'] = 'adapt_unavailable_or_failed'
        return result
    try:
        config = json.loads(raw)
    except ValueError:
        result['status'] = 'invalid_adapt_output'
        return result

    def walk(node, paths=(), hosts=()):
        if isinstance(node, list):
            for item in node:
                walk(item, paths, hosts)
        elif isinstance(node, dict):
            matches = node.get('match') or []
            next_paths = tuple(path for match in matches for path in match.get('path', [])) or paths
            next_hosts = tuple(host for match in matches for host in match.get('host', [])) or hosts
            if next_hosts and not any(host in ('keyoapi.xyz', 'www.keyoapi.xyz', '*.keyoapi.xyz') for host in next_hosts):
                return
            if node.get('handler') == 'reverse_proxy':
                dials = [str(upstream.get('dial', '')) for upstream in node.get('upstreams') or []]
                dials = [dial if re.fullmatch(r'(?:127\.0\.0\.1|localhost|\[::1\]):\d+', dial)
                         else '[nonlocal upstream]' for dial in dials]
                if not next_paths or any(path in ('/pricing', '/sign-in', '/sign-up', '/login', '/api/pricing', '/api/*', '/*')
                                         or path.startswith('/pricing/') for path in next_paths):
                    result['routes'].append({'paths': list(next_paths) or ['*'], 'loopback_upstreams': dials})
            for key, value in node.items():
                if key not in ('match', 'upstreams'):
                    walk(value, next_paths, next_hosts)
    walk(config)
    result['status'] = 'adapted_config_only; running daemon config not queried'
    return result


def main():
    report = {'mode': 'read-only; no env files or request logs; public GETs only',
              'host_source_sha256': {name: sha(SOURCE / name) for name in FILES},
              'containers': [], 'http': []}
    code, head = command(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
    report['host_checkout_sha'] = head.strip() if code == 0 and re.fullmatch(r'[0-9a-f]{40}\s*', head) else None
    code, names_raw = command(['docker', 'ps', '-a', '--format', '{{.Names}}'])
    if code:
        report['docker_status'] = 'unavailable'
    names = [name for name in names_raw.splitlines() if re.search(r'creem|moderation|new[-_]?api|one[-_]?api', name, re.I)]
    ports = {3000, 3001}
    for name in names:
        code, raw = command(['docker', 'inspect', name])
        try:
            info = json.loads(raw)[0] if code == 0 else None
            if not isinstance(info, dict):
                raise ValueError()
        except (ValueError, IndexError):
            report['containers'].append({'name': name, 'inspect_status': 'unavailable'})
            continue
        summary, env = container_summary(info)
        if str(env.get('PORT', '')).isdigit() and 0 < int(env['PORT']) < 65536:
            ports.add(int(env['PORT']))
        if info.get('State', {}).get('Running') and re.search(r'creem|moderation', name, re.I):
            code, hashes = command(['docker', 'exec', name, 'sha256sum', *('/app/' + file for file in FILES)])
            summary['container_source_sha256'] = {
                line.split()[-1]: line.split()[0] for line in hashes.splitlines()
                if re.fullmatch(r'[0-9a-f]{64}\s+/app/[A-Za-z0-9_.-]+', line)}
        report['containers'].append(summary)
    code, listeners_raw = command(['ss', '-lntp'])
    report['listeners'] = []
    if code == 0:
        for line in listeners_raw.splitlines():
            fields = line.split()
            if len(fields) < 5 or not fields[3].rsplit(':', 1)[-1].isdigit():
                continue
            port = int(fields[3].rsplit(':', 1)[-1])
            if port not in ports:
                continue
            pids = [int(pid) for pid in re.findall(r'pid=(\d+)', line)]
            report['listeners'].append({'port': port, 'pids': pids,
                'containers_with_matching_main_pid': [container.get('name') for container in report['containers']
                    if container.get('state', {}).get('Pid') in pids]})
    report['caddy'] = caddy_summary()
    for base in [f'http://127.0.0.1:{port}' for port in sorted(ports)] + ['https://www.keyoapi.xyz']:
        for path in ('/api/pricing', '/pricing', '/sign-in', '/sign-up'):
            report['http'].append(http_summary(base, path))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
