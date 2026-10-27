#!/usr/bin/env python3
"""Small rotating resource history. No argv, environment, request logs or DBs."""
import argparse
import datetime
import http.client
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import time


def read(path, limit=8192):
    try:
        with open(path) as stream:
            return stream.read(limit)
    except (OSError, ValueError):
        return ''


def numeric(path):
    result = {}
    for line in read(path).splitlines():
        match = re.fullmatch(r'([A-Za-z0-9_()]+):?\s+(\d+)(?:\s+kB)?', line)
        if match:
            result[match[1]] = int(match[2])
    return result


def processes():
    result = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        stat = read(entry / 'stat', 4096)
        try:
            name = stat[stat.index('(') + 1:stat.rindex(')')]
            fields = stat[stat.rindex(')') + 2:].split()
            io = numeric(entry / 'io')
            status = numeric(entry / 'status')
            result[int(entry.name)] = {
                'name': name if re.fullmatch(r'[A-Za-z0-9_.:/ -]{1,64}', name) else '[other]',
                'state': fields[0], 'start': int(fields[19]),
                'cpu_ticks': int(fields[11]) + int(fields[12]),
                'read_bytes': io.get('read_bytes', 0), 'write_bytes': io.get('write_bytes', 0),
                'rss_kib': status.get('VmRSS', 0), 'swap_kib': status.get('VmSwap', 0),
            }
        except (ValueError, IndexError):
            continue
    return result


def snapshot():
    disks = {}
    for line in read('/proc/diskstats', 65536).splitlines():
        parts = line.split()
        if len(parts) >= 14 and re.fullmatch(r'(?:xvd|sd|vd)[a-z]+|nvme\d+n\d+', parts[2]):
            disks[parts[2]] = list(map(int, parts[3:14]))
    vm = numeric('/proc/vmstat')
    return {
        'monotonic': time.monotonic(), 'cpu': list(map(int, read('/proc/stat').splitlines()[0].split()[1:9])),
        'memory_kib': {k: v for k, v in numeric('/proc/meminfo').items() if k in ('MemTotal', 'MemAvailable', 'AnonPages', 'Cached', 'Dirty', 'Writeback', 'SwapTotal', 'SwapFree')},
        'vmstat': {k: v for k, v in vm.items() if k in ('pswpin', 'pswpout', 'pgmajfault', 'pgscan_kswapd', 'pgscan_direct', 'oom_kill', 'allocstall_normal', 'allocstall_movable', 'workingset_refault_file', 'workingset_refault_anon')},
        'pressure': {k: read('/proc/pressure/' + k, 1024).strip() for k in ('cpu', 'memory', 'io')},
        'disks': disks, 'processes': processes(),
    }


def delta(before, after):
    seconds = max(0.001, after['monotonic'] - before['monotonic'])
    ticks = [max(0, a - b) for a, b in zip(after['cpu'], before['cpu'])]
    total = max(1, sum(ticks))
    rows = []
    for pid, row in after['processes'].items():
        old = before['processes'].get(pid)
        if old is None or old['start'] != row['start']:
            old = row
        rows.append({
            'pid': pid, 'name': row['name'], 'state': row['state'], 'rss_kib': row['rss_kib'], 'swap_kib': row['swap_kib'],
            'cpu_one_core_pct': round(max(0, row['cpu_ticks'] - old['cpu_ticks']) / os.sysconf('SC_CLK_TCK') / seconds * 100, 2),
            'read_bytes_sec': round(max(0, row['read_bytes'] - old['read_bytes']) / seconds),
            'write_bytes_sec': round(max(0, row['write_bytes'] - old['write_bytes']) / seconds),
        })
    selected = {}
    for key in ('read_bytes_sec', 'write_bytes_sec', 'cpu_one_core_pct', 'rss_kib'):
        for row in sorted(rows, key=lambda r: r[key], reverse=True)[:5]:
            selected[row['pid']] = row
    for row in (r for r in rows if r['state'] == 'D'):
        if len(selected) < 24:
            selected[row['pid']] = row
    disks = {}
    for name, values in after['disks'].items():
        old = before['disks'].get(name, values)
        disks[name] = {'read_iops': round((values[0] - old[0]) / seconds, 2), 'write_iops': round((values[4] - old[4]) / seconds, 2),
                       'read_bytes_sec': round((values[2] - old[2]) * 512 / seconds), 'write_bytes_sec': round((values[6] - old[6]) * 512 / seconds),
                       'busy_pct': round((values[9] - old[9]) / seconds / 10, 2), 'inflight': values[8]}
    return {'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'seconds': round(seconds, 2),
            'cpu_busy_pct': round((total - ticks[3] - ticks[4]) / total * 100, 2), 'iowait_pct': round(ticks[4] / total * 100, 2),
            'memory_kib': after['memory_kib'], 'pressure': after['pressure'], 'disks': disks,
            'vmstat_delta': {k: v - before['vmstat'].get(k, v) for k, v in after['vmstat'].items()}, 'processes': list(selected.values())}


def health():
    result = []
    for port, path in ((3000, '/api/status'), (3001, '/healthz'), (3010, '/healthz'), (3011, '/healthz')):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
        start = time.monotonic()
        try:
            connection.request('GET', path)
            response = connection.getresponse()
            response.read(65536)
            result.append({'port': port, 'status': response.status, 'seconds': round(time.monotonic() - start, 3)})
        except Exception as error:
            result.append({'port': port, 'error_class': type(error).__name__})
        finally:
            connection.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='one read-only sample to stdout')
    args = parser.parse_args()
    before = snapshot()
    if args.once:
        time.sleep(1)
        print(json.dumps(delta(before, snapshot())))
        return
    os.umask(0o077)
    logger = logging.getLogger('resources')
    logger.setLevel(logging.INFO)
    logger.addHandler(RotatingFileHandler('/var/log/keyo-stability/resources.jsonl', maxBytes=5 * 1024 * 1024, backupCount=2))
    round_number = 0
    while True:
        time.sleep(15)
        after = snapshot()
        record = delta(before, after)
        if round_number % 4 == 0:
            record['health'] = health()
        logger.info(json.dumps(record, separators=(',', ':')))
        before = after
        round_number += 1


if __name__ == '__main__':
    main()
