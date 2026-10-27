#!/usr/bin/env python3
"""Convert inspected resource/log limits into docker run argv, one per line.

Input stays in memory. Never print full inspect or environment. CLI values
containing line breaks are rejected rather than changing argument boundaries.
"""
import json
import sys


def arguments(host):
    result = []
    fields = {
        'Memory': '--memory', 'MemorySwap': '--memory-swap',
        'MemoryReservation': '--memory-reservation', 'CpuShares': '--cpu-shares',
        'CpuPeriod': '--cpu-period', 'CpuQuota': '--cpu-quota',
        'CpusetCpus': '--cpuset-cpus', 'CpusetMems': '--cpuset-mems',
        'PidsLimit': '--pids-limit', 'BlkioWeight': '--blkio-weight',
        'CgroupParent': '--cgroup-parent',
    }
    for key, flag in fields.items():
        value = host.get(key)
        if value not in (None, '', 0):
            result.extend([flag, str(value)])
    if host.get('NanoCpus'):
        result.extend(['--cpus', format(host['NanoCpus'] / 1_000_000_000, '.9f')])
    log = host.get('LogConfig') or {}
    driver = log.get('Type') or 'json-file'
    options = dict(log.get('Config') or {})
    if driver == 'json-file':
        options.setdefault('max-size', '10m')
        options.setdefault('max-file', '3')
    result.extend(['--log-driver', driver])
    for key, value in options.items():
        result.extend(['--log-opt', key + '=' + str(value)])
    if any('\n' in value or '\r' in value or '\0' in value for value in result):
        raise ValueError('Invalid runtime argument')
    return result


if __name__ == '__main__':
    try:
        source = json.load(sys.stdin)
        print('\n'.join(arguments(source[0]['HostConfig'])))
    except Exception:
        raise SystemExit('Cannot preserve runtime resource/log configuration') from None
