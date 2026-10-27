#!/usr/bin/env python3
"""Bounded host resource evidence; no deploy, DB reads, request logs or model calls."""
import datetime
import http.client
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time


def command(args, timeout=12):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return result.returncode, result.stdout[:4 * 1024 * 1024]
    except (OSError, subprocess.TimeoutExpired):
        return -1, ''


def read(path, limit=65536):
    try:
        with open(path, encoding='utf-8', errors='replace') as stream:
            return stream.read(limit)
    except OSError:
        return ''


def numeric_lines(path, keys=None):
    result = {}
    for line in read(path).splitlines():
        match = re.fullmatch(r'([A-Za-z0-9_()]+):?\s+(\d+)(?:\s+kB)?', line)
        if match and (keys is None or match[1] in keys):
            result[match[1]] = int(match[2])
    return result


def snapshot():
    return {
        'monotonic': time.monotonic(),
        'memory_kib': numeric_lines('/proc/meminfo', {
            'MemTotal', 'MemAvailable', 'MemFree', 'SwapTotal', 'SwapFree',
            'Dirty', 'Writeback', 'Slab', 'SReclaimable', 'Cached', 'AnonPages'}),
        'vmstat': numeric_lines('/proc/vmstat', {
            'pswpin', 'pswpout', 'pgmajfault', 'oom_kill', 'allocstall_normal',
            'allocstall_movable', 'pgscan_kswapd', 'pgscan_direct'}),
        'pressure': {kind: read('/proc/pressure/' + kind, 2048).strip()
                     for kind in ('cpu', 'memory', 'io')},
        'cpu': read('/proc/stat').splitlines()[0],
        'loadavg': read('/proc/loadavg', 128).strip(),
    }


def processes():
    result = []
    for item in Path('/proc').iterdir():
        if not item.name.isdigit():
            continue
        status = read(item / 'status')
        values = {}
        for key in ('VmRSS', 'RssAnon', 'VmSwap', 'Threads'):
            match = re.search(r'^' + key + r':\s+(\d+)', status, re.M)
            if match:
                values[key] = int(match[1])
        name = read(item / 'comm', 256).strip()
        if not re.fullmatch(r'[A-Za-z0-9_.:/ -]{1,128}', name):
            name = '[other process]'
        state = re.search(r'^State:\s+([A-Za-z])', status, re.M)
        result.append(dict(pid=int(item.name), name=name,
                           state=state[1] if state else None, **values))
    return sorted(result, key=lambda item: item.get('VmRSS', 0), reverse=True)[:18]


def disks():
    result = []
    for path in ('/', '/var/lib/docker', '/opt/ai-relay/data/new-api'):
        try:
            stat = os.statvfs(path)
            result.append({'path': path, 'total_bytes': stat.f_blocks * stat.f_frsize,
                           'available_bytes': stat.f_bavail * stat.f_frsize,
                           'free_inodes': stat.f_favail, 'total_inodes': stat.f_files})
        except OSError:
            result.append({'path': path, 'unavailable': True})
    return result


def containers():
    code, names = command(['docker', 'ps', '-a', '--format', '{{.Names}}'])
    result = []
    if code:
        return {'unavailable': True}
    for name in names.splitlines()[:100]:
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,200}', name):
            continue
        code, raw = command(['docker', 'inspect', name])
        try:
            info = json.loads(raw)[0] if code == 0 else {}
            state, host = info.get('State') or {}, info.get('HostConfig') or {}
            cgroup_usage = {}
            if state.get('Running') and isinstance(state.get('Pid'), int):
                value = read('/proc/' + str(state['Pid']) + '/cgroup', 4096).strip()
                if value.startswith('0::/') and re.fullmatch(r'0::/[A-Za-z0-9_.@:/-]+', value) and '..' not in value:
                    base = Path('/sys/fs/cgroup') / value[4:]
                    cgroup_usage = {key: read(base / key, 64).strip() for key in ('memory.current', 'memory.max', 'memory.swap.current')}
                    cgroup_usage['memory.stat'] = {key: val for key, val in numeric_lines(base / 'memory.stat').items() if key in ('anon', 'file', 'kernel')}
            log = host.get('LogConfig') or {}
            log_options = {k: v for k, v in (log.get('Config') or {}).items()
                           if k in ('max-size', 'max-file', 'compress')}
            log_path = Path(info.get('LogPath') or '/nonexistent')
            log_size = log_path.stat().st_size if log_path.is_file() else None
            result.append({'name': name, 'image_id': info.get('Image'),
                           'state': {key: state.get(key) for key in (
                               'Status', 'Running', 'Restarting', 'Pid', 'OOMKilled', 'ExitCode', 'StartedAt', 'FinishedAt')},
                           'restarts': info.get('RestartCount'), 'created': info.get('Created'),
                           'memory_limit': host.get('Memory'), 'memory_swap_limit': host.get('MemorySwap'),
                           'nano_cpus': host.get('NanoCpus'), 'pids_limit': host.get('PidsLimit'),
                           'cgroup_parent': host.get('CgroupParent'),
                           'cgroup_memory': cgroup_usage,
                           'log_driver': log.get('Type'), 'log_options': log_options,
                           'log_size_bytes': log_size,
                           'health': (state.get('Health') or {}).get('Status')})
        except (ValueError, IndexError, OSError):
            result.append({'name': name, 'inspect_unavailable': True})
    return result


def kernel_events():
    pattern = 'Out of memory|oom-kill|Killed process|I/O error|EXT4-fs error|No space left|blocked for more than|watchdog|soft lockup|hard LOCKUP|panic|Memory cgroup out of memory'
    code, raw = command(['journalctl', '--since', '7 days ago', '--no-pager',
                         '-o', 'json', '_TRANSPORT=kernel', '--grep', pattern, '-n', '120'], 15)
    events = []
    for line in raw.splitlines():
        try:
            row = json.loads(line)
            message = str(row.get('MESSAGE', ''))
            kinds = [kind for kind, expression in (
                ('oom', r'out of memory|oom-kill|Killed process'),
                ('disk_io_error', r'I/O error|EXT4-fs error'),
                ('disk_full', r'No space left'), ('blocked_task', r'blocked for more than'),
                ('lockup_or_panic', r'soft lockup|hard LOCKUP|Kernel panic|watchdog: BUG'),
                ('boot_watchdog_setup', r'NMI watchdog.*(?:enabled|permanently disabled)|watchdog.*initialized')) if re.search(expression, message, re.I)]
            victim = re.search(r'Killed process (\d+) \(([A-Za-z0-9_. -]{1,50})\)', message)
            events.append({'timestamp_usec': row.get('__REALTIME_TIMESTAMP'), 'kinds': kinds,
                           'victim_pid': int(victim[1]) if victim else None,
                           'victim_name': victim[2] if victim else None})
        except (ValueError, TypeError):
            pass
    return {'query_status': code, 'events': events, 'raw_messages_omitted': True}


def previous_boot_ends():
    result = []
    for boot in ('-1', '-2'):
        code, raw = command(['journalctl', '-b', boot, '-r', '-n', '35', '--no-pager', '-o', 'json'])
        rows = []
        for line in raw.splitlines():
            try:
                row = json.loads(line)
                message = str(row.get('MESSAGE', ''))
                kinds = [kind for kind, pattern in (
                    ('clean_shutdown', r'Reached target (?:Shutdown|Power-Off|Reboot)|Shutting down|Stopping.*(?:Docker|Caddy)|systemd-shutdown'),
                    ('oom', r'Out of memory|oom-kill|Killed process'),
                    ('blocked_or_io_error', r'I/O error|blocked for more than|No space left'),
                    ('service_failure', r'Failed to start|Main process exited|Failed with result')) if re.search(pattern, message, re.I)]
                unit = str(row.get('_SYSTEMD_UNIT', ''))
                rows.append({'timestamp_usec': row.get('__REALTIME_TIMESTAMP'), 'kinds': kinds,
                             'unit': unit if re.fullmatch(r'[A-Za-z0-9_.@:-]{1,200}', unit) else '[other]'})
            except (ValueError, TypeError):
                pass
        result.append({'boot': boot, 'query_status': code, 'last_records_metadata': rows})
    return result


def task_aggregate():
    # Fixed aggregate SELECT only. No IDs, prompts, image URLs, balances or keys.
    path = Path('/opt/ai-relay/data/new-api/one-api.db')
    if not path.is_file():
        return {'unavailable': True}
    db = None
    try:
        db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=0.2)
        db.execute('PRAGMA query_only=ON')
        db.execute('PRAGMA busy_timeout=200')
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='keyo_image_tasks'").fetchone()
        if not exists:
            return {'table_present': False}
        rows = db.execute('SELECT state,COUNT(*),MIN(created_at),MAX(created_at) FROM keyo_image_tasks GROUP BY state').fetchall()
        return {'table_present': True, 'states': [dict(state=row[0], count=row[1],
                oldest_created=row[2], newest_created=row[3]) for row in rows]}
    except Exception as error:
        return {'error_class': type(error).__name__}
    finally:
        if db is not None:
            db.close()


def bounded_directory_usage():
    paths = ['/opt/ai-relay/data/logs', '/opt/ai-relay/static/uploads', '/opt/ai-relay/data', '/tmp']
    code, raw = command(['du', '-sk', *paths], timeout=10)
    rows = []
    for line in raw.splitlines():
        value, _, path = line.partition('\t')
        if value.isdigit() and path in paths:
            rows.append({'path': path, 'kib': int(value)})
    return {'status': code, 'usage': rows,
            'preserved_blog_temp_count': sum(1 for _ in Path('/tmp').glob('keyo-geo-blog-preserve.*'))}


def local_health(port, path):
    start = time.monotonic()
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=4)
    try:
        connection.request('GET', path)
        response = connection.getresponse()
        response.read(512 * 1024)
        return {'port': port, 'status': response.status, 'seconds': round(time.monotonic() - start, 3)}
    except Exception as error:
        return {'port': port, 'error_class': type(error).__name__}
    finally:
        connection.close()


def stability_history():
    result = {}
    control = Path('/sys/fs/cgroup/keyo.slice/keyo-services.slice')
    result['aggregate_limits'] = {key: read(control / key, 4096).strip() for key in ('memory.current', 'memory.max', 'memory.swap.current', 'memory.swap.max', 'memory.events', 'io.max')}
    for unit in ('keyo-services.slice', 'keyo-stability-recorder.service', 'keyo-stability-retention.timer'):
        _, state = command(['systemctl', 'show', unit, '--property=ActiveState,SubState,MemoryCurrent,MemoryMax,MemorySwapMax,ControlGroup', '--no-pager'])
        result[unit] = state.splitlines()
    path = Path('/var/log/keyo-stability/resources.jsonl')
    try:
        with path.open('rb') as stream:
            stream.seek(max(0, path.stat().st_size - 65536))
            tail = stream.read(65536).decode('utf8', 'replace').splitlines()
        rows = []
        for line in tail:
            try:
                rows.append(json.loads(line))
            except (ValueError, TypeError):
                pass
        result['recent_samples'] = rows[-3:]
        result['history_file_bytes'] = path.stat().st_size
    except OSError:
        result['history_available'] = False
    return result


def scheduled_task_metadata():
    # Only schedules and broad categories, never shell command text, inline
    # credentials or usernames from root/user crontabs.
    files = [Path('/etc/crontab'), *Path('/etc/cron.d').glob('*'), *Path('/var/spool/cron/crontabs').glob('*')]
    crons = []
    for path in files[:80]:
        for line in read(path).splitlines():
            match = re.match(r'^\s*((?:[0-9*/,-]+\s+){4}[0-9*/,-]+|@(?:reboot|hourly|daily|weekly|monthly|yearly))\s+(.+)$', line)
            if not match:
                continue
            categories = [name for name in ('php', 'python', 'node', 'docker', 'backup', 'apt', 'updatedb', 'logrotate', 'fstrim', 'fwupd') if re.search(r'\b' + name + r'\b', match[2], re.I)]
            crons.append({'schedule': match[1].strip(), 'categories': categories})
    _, raw = command(['systemctl', 'list-timers', '--all', '--output=json', '--no-pager'])
    timers = []
    try:
        for row in json.loads(raw):
            unit = row.get('unit', '')
            if re.fullmatch(r'[A-Za-z0-9_.@:-]{1,200}', unit):
                timers.append({key: row.get(key) for key in ('unit', 'activates', 'last', 'next')})
    except (ValueError, TypeError):
        pass
    _, raw = command(['journalctl', '--since', '2026-10-27 22:15:00', '--until', '2026-10-27 22:25:00', '_COMM=systemd', '--no-pager', '-o', 'json', '-n', '200'])
    events = []
    for line in raw.splitlines():
        try:
            row = json.loads(line)
            unit = row.get('UNIT') or row.get('OBJECT_SYSTEMD_UNIT') or ''
            if re.fullmatch(r'[A-Za-z0-9_.@:-]{1,200}', unit):
                events.append({'timestamp_usec': row.get('__REALTIME_TIMESTAMP'), 'unit': unit})
        except (ValueError, TypeError):
            pass
    return {'cron_schedules': crons, 'timers': timers, 'outage_systemd_unit_events': events, 'command_text_omitted': True}


def main():
    before = snapshot()
    time.sleep(3)
    after = snapshot()
    duration = after['monotonic'] - before['monotonic']
    deltas = {key: value - before['vmstat'].get(key, value) for key, value in after['vmstat'].items()}
    _, stats = command(['docker', 'stats', '--no-stream', '--format',
                       '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}|{{.PIDs}}|{{.BlockIO}}'], 12)
    _, disk = command(['docker', 'system', 'df'], 12)
    _, boots = command(['journalctl', '--list-boots', '--no-pager', '-n', '6'])
    _, journal_size = command(['journalctl', '--disk-usage'])
    _, cgroup_info = command(['docker', 'info', '--format', '{{.CgroupDriver}}|{{.CgroupVersion}}'])
    daemon = {}
    try:
        config = json.loads(read('/etc/docker/daemon.json'))
        daemon = {'log_driver': config.get('log-driver'),
                  'log_options': {key: value for key, value in (config.get('log-opts') or {}).items()
                                  if key in ('max-size', 'max-file', 'compress')}}
    except (ValueError, TypeError):
        pass
    database_sizes = {path.name: path.stat().st_size for path in
                      Path('/opt/ai-relay/data/new-api').glob('one-api.db*') if path.is_file()}
    report = {'result': 'RESOURCE_READONLY_OK', 'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'mode': 'read-only; no env files, request logs, DB contents, deploys or model calls',
              'uptime_seconds': float(read('/proc/uptime').split()[0]), 'cpu_count': os.cpu_count(),
              'before': before, 'after': after, 'sample_seconds': round(duration, 3),
              'vmstat_delta': deltas, 'disks': disks(), 'top_processes': processes(),
              'containers': containers(), 'docker_stats': stats.splitlines(),
              'docker_disk_summary': disk.splitlines(), 'docker_default_logs': daemon,
              'boot_history': boots.splitlines(), 'journal_disk_usage': journal_size.strip(),
              'journal_caps': [line.strip() for line in read('/etc/systemd/journald.conf').splitlines()
                               if re.fullmatch(r'(?:SystemMaxUse|RuntimeMaxUse|SystemKeepFree|MaxRetentionSec)=[A-Za-z0-9 .]+', line)],
              'database_file_sizes': database_sizes, 'kernel_events': kernel_events(),
              'previous_boot_ends': previous_boot_ends(), 'image_task_aggregate': task_aggregate(),
              'selected_directory_usage': bounded_directory_usage(),
              'stability_history': stability_history(),
              'docker_cgroup_driver_version': cgroup_info,
              'scheduled_tasks': scheduled_task_metadata(),
              'local_health': [local_health(port, path) for port, path in (
                  (3000, '/api/status'), (3001, '/healthz'), (3010, '/healthz'), (3011, '/healthz'))]}
    print(json.dumps(report, sort_keys=True), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'result': 'RESOURCE_READONLY_FAILED', 'error_class': type(error).__name__}), flush=True)
        raise SystemExit(1)
