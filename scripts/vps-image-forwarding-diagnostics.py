#!/usr/bin/env python3
"""Read-only image transport evidence; never print raw logs or credentials.

Run on the VPS with Python 3. No requests, deployments, installs, database
access, environment-file reads or configuration changes are performed.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path('/opt/ai-relay')
REQUEST_IDS = (
    '99dc73c0-2d5f-4689-b8b1-856958102c24',
    '7483a038-b182-48ef-aec5-05e417d04356',
    'cb74ff66-f816-4449-8f43-fa5b51b37510',
)
CONTAINER_NAME = re.compile(
    r'ai-relay-(?:creem-moderation|apimart-passthrough)'
    r'(?:-(?:rollback|images-rollback|previous-\d+-\d+))?\Z')
NUMERIC_ENV_KEYS = (
    'PORT', 'PROXY_MAX_BODY_BYTES', 'UPLOAD_MAX_BYTES',
    'IMAGE_FORWARD_TIMEOUT_MS', 'IMAGE_TRANSPORT_TIMEOUT_MS', 'IMAGE_POLL_MAX_MS',
)
ERROR_NAMES = frozenset((
    'Error', 'TypeError', 'RangeError', 'AbortError', 'TimeoutError',
    'DOMException', 'FetchError', 'NotSupportedError', 'transport_error',
))
ERROR_CODES = frozenset((
    'none', 'UND_ERR_NOT_SUPPORTED', 'UND_ERR_INVALID_ARG',
    'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET', 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
    'UND_ERR_RES_CONTENT_LENGTH_MISMATCH', 'UND_ERR_RESPONSE_STATUS_CODE',
    'UND_ERR_RESPONSE_EXCEEDED_MAX_SIZE', 'ECONNRESET', 'ECONNREFUSED',
    'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN',
    'ENOTFOUND', 'ABORT_ERR',
)) | ERROR_NAMES
TIMESTAMP = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z'
LOG_RECORD = re.compile(
    r'^(?:(?P<timestamp>' + TIMESTAMP + r') )?'
    r'\[native-image\] forwarding failed id=(?P<id>[0-9a-f-]{36})'
    r' reason=(?P<name>[A-Za-z_][A-Za-z0-9_]{0,79})'
    r' cause=(?P<cause>[A-Za-z_][A-Za-z0-9_]{0,79})'
    r'(?: code=(?P<code>[A-Za-z_][A-Za-z0-9_]{0,79}))?$')


def command(args, timeout=20):
    try:
        result = subprocess.run(args, capture_output=True, text=True,
                                errors='replace', timeout=timeout, check=False)
        return result.returncode, result.stdout, result.stderr
    except (OSError, subprocess.TimeoutExpired):
        # Exception messages and process stderr can contain confidential data.
        return -1, '', ''


def safe_failure_records(raw):
    """Only exact, known request IDs and enumerated error tokens may escape."""
    records = []
    for line in raw.splitlines():
        match = LOG_RECORD.fullmatch(line)
        if not match or match['id'] not in REQUEST_IDS:
            continue
        record = {
            'request_id': match['id'],
            'error_name': match['name'] if match['name'] in ERROR_NAMES else 'unrecognized',
            'cause': match['cause'] if match['cause'] in ERROR_CODES else 'unrecognized',
        }
        if match['code']:
            record['code'] = match['code'] if match['code'] in ERROR_CODES else 'unrecognized'
        if match['timestamp']:
            record['timestamp'] = match['timestamp']
        records.append(record)
        if len(records) >= 30:
            break
    return records


def numeric_limits(env_entries):
    env = dict(entry.split('=', 1) for entry in env_entries if isinstance(entry, str) and '=' in entry)
    return {key: (int(env[key]) if re.fullmatch(r'[0-9]{1,12}', env.get(key, ''))
                  else ('not_set' if key not in env else 'invalid_numeric_value'))
            for key in NUMERIC_ENV_KEYS}


def failure_totals(raw):
    totals = {}
    latest = None
    for line in raw.splitlines():
        match = LOG_RECORD.fullmatch(line)
        if match:
            name = match['name'] if match['name'] in ERROR_NAMES else 'unrecognized'
            cause = match['cause'] if match['cause'] in ERROR_CODES else 'unrecognized'
            key = name + '/' + cause
            totals[key] = totals.get(key, 0) + 1
            if match['timestamp']:
                latest = max(latest or '', match['timestamp'])
    # No customer identifiers or raw exception text are included in aggregates.
    return {'counts': totals, 'latest_timestamp': latest}


def safe_container_record(name, info):
    config, state = info.get('Config') or {}, info.get('State') or {}
    image = str(info.get('Image', ''))
    started = str(state.get('StartedAt', ''))
    pid = state.get('Pid')
    return {
        'name': name,
        'image_id': image if re.fullmatch(r'sha256:[0-9a-f]{64}', image) else None,
        'running': state.get('Running') is True,
        'restarting': state.get('Restarting') is True,
        'pid': pid if isinstance(pid, int) and not isinstance(pid, bool) and pid >= 0 else None,
        'started_at': started if re.fullmatch(TIMESTAMP, started) else None,
        'numeric_env_limits': numeric_limits(config.get('Env') or []),
        'resource_state': {
            'oom_killed': state.get('OOMKilled') is True,
            'exit_code': state.get('ExitCode') if type(state.get('ExitCode')) is int else None,
            'restart_count': info.get('RestartCount') if type(info.get('RestartCount')) is int else None,
            **{key: value for key, value in (info.get('HostConfig') or {}).items()
               if key in ('Memory', 'MemorySwap') and type(value) is int},
        },
    }


def container_evidence(name):
    code, raw, _ = command(['docker', 'inspect', name])
    try:
        info = json.loads(raw)[0] if code == 0 else None
        if not isinstance(info, dict):
            raise ValueError()
    except (ValueError, IndexError, TypeError):
        return {'name': name, 'inspect_status': 'unavailable'}
    record = safe_container_record(name, info)
    if record['running'] and not record['restarting']:
        source = 'console.log(JSON.stringify({node:process.versions.node,undici:process.versions.undici||null}))'
        code, raw, _ = command(['docker', 'exec', name, 'node', '--input-type=module', '-e', source])
        try:
            versions = json.loads(raw) if code == 0 else {}
            record['runtime_versions'] = {
                key: value for key, value in versions.items()
                if key in ('node', 'undici') and isinstance(value, str)
                and re.fullmatch(r'\d+\.\d+\.\d+', value)
            }
        except (ValueError, AttributeError):
            record['runtime_versions'] = {}
        code, raw, _ = command(['docker', 'exec', name, 'sha256sum', '/app/server.mjs'])
        match = re.fullmatch(r'([0-9a-f]{64})\s+/app/server\.mjs\s*', raw) if code == 0 else None
        record['server_sha256'] = match[1] if match else None
    # Docker writes application stdout and stderr to different client streams.
    # Capture both in memory, then export only the whitelist above, never raw text.
    code, stdout, stderr = command(['docker', 'logs', '--timestamps', '--since', '48h', '--tail', '20000', name])
    record['log_status'] = 'read' if code == 0 else 'unavailable'
    record['matched_failures'] = safe_failure_records(stdout + '\n' + stderr) if code == 0 else []
    record['forwarding_failure_totals'] = failure_totals(stdout + '\n' + stderr) if code == 0 else None
    return record


def source_hash(path):
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def main():
    report = {
        'mode': 'read-only; no HTTP requests, model calls, env files, database access or deployment',
        'log_scope': 'last 48 hours; last 20000 entries per container; absence may mean rotated logs',
        'request_ids': list(REQUEST_IDS),
        'host_source_sha256': {
            service: source_hash(ROOT / 'services' / service / 'server.mjs')
            for service in ('creem-moderation-proxy', 'apimart-passthrough')
        },
        'containers': [],
    }
    code, raw, _ = command(['docker', 'ps', '-a', '--format', '{{.Names}}'])
    report['docker_status'] = 'available' if code == 0 else 'unavailable'
    names = sorted(set(name for name in raw.splitlines() if CONTAINER_NAME.fullmatch(name)))[:12] if code == 0 else []
    report['containers'] = [container_evidence(name) for name in names]
    print(json.dumps(report, ensure_ascii=True))


if __name__ == '__main__':
    main()
