#!/usr/bin/env python3
"""Release regression fixtures: local Git only; mock Docker/curl/sudo, no network.

Run: python3 scripts/test-vps-release-offline.py
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
BASH = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
NAME = 'ai-relay-creem-moderation'

DRIVER = r'''
import json, os, re, sys
from pathlib import Path
state_path = Path(os.environ['MOCK_STATE'])
s = json.loads(state_path.read_text())
args = sys.argv[2:]
tool = sys.argv[1]
s['events'].append([tool] + args)
code = 0
output = ''
containers = s['containers']
mode = os.environ.get('MOCK_FAILURE', '')
if tool == 'curl':
    code = 22 if mode == 'health' else 0
elif tool == 'ss':
    target_port = int(re.search(r':(\d+)', ' '.join(args)).group(1))
    current = containers.get('ai-relay-creem-moderation', {})
    new = current.get('image') == 'new-image'
    port = s.get('new_port', 3001) if new else s.get('old_port', 3001)
    if target_port == port:
        pid = 333 if mode == 'preflight_foreign' or (new and mode in ('foreign', 'restarting')) else (222 if new else 111)
        if new and mode == 'unstable' and s.get('health_checks', 0) > 1:
            pid = 223
        output = f'LISTEN 0 511 127.0.0.1:{port} 0.0.0.0:* users:(("node",pid={pid},fd=20))'
elif tool == 'docker':
    cmd = args[0]
    if cmd == 'inspect':
        name = args[1]
        if name not in containers:
            code = 1
        elif '--format' in args:
            fmt = args[args.index('--format') + 1]
            if 'RestartPolicy' in fmt:
                output = containers[name]['restart']
            elif 'Running' in fmt and 'Restarting' in fmt and 'Pid' in fmt:
                new = containers[name]['image'] == 'new-image'
                restarting = new and mode == 'restarting'
                if new:
                    s['health_checks'] = s.get('health_checks', 0) + 1
                pid = 223 if new and mode == 'unstable' and s['health_checks'] > 1 else (222 if new else 111)
                output = ('true' if containers[name]['running'] else 'false') + ' ' + ('true' if restarting else 'false') + ' ' + str(0 if restarting else pid)
            elif 'Running' in fmt:
                output = 'true' if containers[name]['running'] else 'false'
            elif '.State.Pid' in fmt:
                output = str(222 if containers[name]['image'] == 'new-image' else 111)
            elif '.Config.Env' in fmt:
                output = '\n'.join(s.get('current_env', []))
            elif '.HostConfig.Binds' in fmt:
                output = '\n'.join(s.get('binds', []))
            elif '.Mounts' in fmt:
                output = '\n'.join('|'.join(m) for m in s.get('mounts', []))
            else:
                code = 2
        else:
            output = json.dumps([{'HostConfig': s.get('runtime', {'LogConfig': {'Type': 'json-file', 'Config': {}}})}])
    elif cmd == 'build':
        code = 1 if mode == 'build' else 0
    elif cmd == 'exec':
        assert args[2] == 'sha256sum', args
        output = '\n'.join(('0' * 64 if mode == 'source_version' else s['source_hashes'][Path(path).name]) + '  ' + path for path in args[3:])
    elif cmd == 'update':
        name = args[-1]
        if name not in containers:
            code = 1
        else:
            containers[name]['restart'] = next(v.split('=', 1)[1] for v in args if v.startswith('--restart='))
    elif cmd == 'stop':
        name = args[-1]
        if mode == 'stop':
            code = 1
        else:
            containers[name]['running'] = False
    elif cmd == 'rename':
        old, new = args[1:]
        if mode == 'rename' and '-previous-' in new and not s.get('rename_failed'):
            s['rename_failed'] = True
            code = 1
        elif old not in containers or new in containers:
            code = 1
        else:
            containers[new] = containers.pop(old)
    elif cmd == 'run':
        name = args[args.index('--name') + 1]
        containers[name] = {'image': 'new-image', 'running': mode != 'crash',
                            'restart': args[args.index('--restart') + 1]}
        effective = {}
        for line in Path(s['env_file']).read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.strip().split('=', 1)
                effective[key] = value
        for i, arg in enumerate(args[:-1]):
            if arg == '-e':
                key, value = args[i + 1].split('=', 1)
                effective[key] = value
        s['new_port'] = int(effective.get('PORT', 3001))
        if mode == 'run':
            containers[name]['running'] = False
            code = 1
    elif cmd == 'rm':
        name = args[-1]
        if name in containers:
            del containers[name]
        else:
            code = 1
    elif cmd == 'start':
        containers[args[-1]]['running'] = True
    else:
        raise AssertionError('Unexpected mock Docker operation: ' + repr(args))
else:
    raise AssertionError('Unexpected tool ' + tool)
state_path.write_text(json.dumps(s))
if output:
    sys.stdout.buffer.write((output + '\n').encode())
sys.exit(code)
'''


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


def shell_path(path):
    value = str(path).replace('\\', '/')
    if os.name == 'nt' and len(value) > 1 and value[1] == ':':
        return '/' + value[0].lower() + value[2:]
    return value


class Fixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='keyo release offline ')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.bin = self.base / 'mock-bin'
        self.bin.mkdir()
        self.env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never',
                        MSYS_NO_PATHCONV='1', HEALTH_ATTEMPTS='2')
        self.env['PATH'] = str(self.bin) + os.pathsep + self.env['PATH']
        self.env['MOCK_BIN'] = shell_path(self.bin)
        self.env['MOCK_PYTHON'] = str(Path(sys.executable)).replace('\\', '/')
        self.driver = self.base / 'mock_driver.py'
        write(self.driver, DRIVER)
        self.env['MOCK_DRIVER'] = str(self.driver).replace('\\', '/')
        self.env['TMPDIR'] = shell_path(self.base)
        self.add_script('sudo', '''#!/bin/bash
if [[ "$1" == "chown" || "$1" == "chgrp" ]]; then exit 0; fi
exec env "$@"
''')
        self.add_script('php', '#!/bin/bash\nexit "${MOCK_PHP_EXIT:-0}"\n')
        self.add_script('sleep', '#!/bin/bash\nexit 0\n')
        for name in ('docker', 'curl', 'ss'):
            self.add_script(name, '#!/bin/bash\nexec "$MOCK_PYTHON" "$MOCK_DRIVER" ' + name + ' "$@"\n')

    def add_script(self, name, content):
        path = self.bin / name
        write(path, content)
        path.chmod(0o755)

    def git(self, cwd, *args):
        result = subprocess.run(['git', *args], cwd=cwd, env=self.env,
                                text=True, capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def run_script(self, name, root):
        # Match Linux checkouts when this test runs on Windows with autocrlf.
        script = self.base / name
        write(script, (REPO / 'scripts' / name).read_text(encoding='utf-8'))
        env = dict(self.env, ROOT=shell_path(root))
        # Git for Windows prepends its own curl directory at startup; set PATH
        # inside the shell so even localhost health checks use the fixture.
        return subprocess.run([BASH, '--noprofile', '--norc', '-c',
                               'export PATH="$MOCK_BIN:$PATH"; source "$1"',
                               'offline-fixture', shell_path(script)], cwd=self.base, env=env,
                              text=True, capture_output=True, encoding='utf-8', timeout=60)

    def git_fixture(self):
        origin, source, live = (self.base / p for p in ('origin.git', 'source', 'live'))
        self.git(self.base, 'init', '--bare', str(origin))
        source.mkdir()
        self.git(source, 'init', '-b', 'main')
        self.git(source, 'config', 'user.email', 'offline@example.invalid')
        self.git(source, 'config', 'user.name', 'Offline release fixture')
        write(source / '.gitignore', 'static/brand/blog/article/*\n')
        write(source / 'static/brand/blog/article/known/index.html', 'tracked-old')
        write(source / 'static/brand/blog/article/deleted/index.html', 'remove-in-next-release')
        write(source / 'static/brand/blog/index.html', 'old-index')
        write(source / 'static/brand/blog/sitemap.txt', 'old-sitemap')
        write(source / 'scripts/geoflow-rebuild-blog.php', '<?php // mocked offline\n')
        self.git(source, 'add', '-f', '.')
        self.git(source, 'commit', '-m', 'initial fixture')
        self.git(source, 'remote', 'add', 'origin', str(origin))
        self.git(source, 'push', 'origin', 'main')
        self.git(self.base, 'clone', '--branch', 'main', str(origin), str(live))
        self.git(live, 'config', 'user.email', 'offline@example.invalid')
        self.git(live, 'config', 'user.name', 'Offline release fixture')
        # Retain an older stash; only the stash from this release may be dropped.
        write(live / 'static/brand/blog/index.html', 'existing-stash')
        self.git(live, 'stash', 'push', '-m', 'keep-existing-stash')
        write(live / 'static/brand/blog/article/known/index.html', 'dirty-live-old')
        write(live / 'static/brand/blog/article/cms new/index.html', 'unmanaged-CMS-body')
        write(live / 'static/brand/blog/article/adopted/index.html', 'unmanaged-before-adoption')
        write(live / 'static/brand/blog/index.html', 'dirty-live-old-index')
        write(source / 'static/brand/blog/article/known/index.html', 'tracked-fixed')
        self.git(source, 'rm', 'static/brand/blog/article/deleted/index.html')
        write(source / 'static/brand/blog/article/adopted/index.html', 'new-tracked-fixed')
        write(source / 'static/brand/blog/index.html', 'new-tracked-template')
        write(source / 'static/brand/blog/sitemap.txt', 'new-tracked-sitemap')
        self.git(source, 'add', '-f', '.')
        self.git(source, 'commit', '-m', 'fixed release')
        self.git(source, 'push', 'origin', 'main')
        return source, live

    def test_tracked_fixes_win_and_ignored_cms_survives(self):
        source, live = self.git_fixture()
        result = self.run_script('vps-safe-pull-preserve-blog.sh', live)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        blog = live / 'static/brand/blog'
        self.assertEqual((blog / 'article/known/index.html').read_text(), 'tracked-fixed')
        self.assertEqual((blog / 'article/adopted/index.html').read_text(), 'new-tracked-fixed')
        self.assertFalse((blog / 'article/deleted/index.html').exists())
        self.assertEqual((blog / 'article/cms new/index.html').read_text(), 'unmanaged-CMS-body')
        self.assertEqual((blog / 'index.html').read_text(), 'new-tracked-template')
        self.assertEqual((blog / 'sitemap.txt').read_text(), 'new-tracked-sitemap')
        self.assertEqual(self.git(live, 'rev-parse', 'HEAD'), self.git(source, 'rev-parse', 'HEAD'))
        self.assertEqual(len(self.git(live, 'stash', 'list').splitlines()), 1)
        self.assertIn('DONE_SAFE_PULL_PRESERVE_BLOG', result.stdout)

    def test_failed_fetch_retains_recovery_stash(self):
        _, live = self.git_fixture()
        old_head = self.git(live, 'rev-parse', 'HEAD')
        self.git(live, 'remote', 'set-url', 'origin', str(self.base / 'nonexistent-local-origin'))
        result = self.run_script('vps-safe-pull-preserve-blog.sh', live)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git(live, 'rev-parse', 'HEAD'), old_head)
        self.assertEqual(len(self.git(live, 'stash', 'list').splitlines()), 2)
        self.assertTrue((live / 'static/brand/blog/article/cms new/index.html').exists())

    def test_failed_index_rebuild_does_not_report_success_or_drop_stash(self):
        _, live = self.git_fixture()
        self.env['MOCK_PHP_EXIT'] = '1'
        result = self.run_script('vps-safe-pull-preserve-blog.sh', live)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('DONE_SAFE_PULL_PRESERVE_BLOG', result.stdout)
        self.assertEqual(len(self.git(live, 'stash', 'list').splitlines()), 2)

    def proxy_fixture(self, failure='', with_backup=False, create_upload=True):
        root = self.base / 'proxy live'
        write(root / 'scripts/vps-safe-pull-preserve-blog.sh', '#!/bin/bash\nexit 0\n')
        write(root / 'scripts/vps-runtime-args.py', (REPO / 'scripts/vps-runtime-args.py').read_text())
        self.add_script('python3', '#!/bin/bash\nif command -v cygpath >/dev/null; then exec "$MOCK_PYTHON" "$(cygpath -w "$1")"; else exec "$MOCK_PYTHON" "$@"; fi\n')
        write(root / '.env.moderation', 'OFFLINE_FIXTURE=not-a-secret\n')
        if create_upload:
            (root / 'static/uploads').mkdir(parents=True)
        state = {'containers': {NAME: {'image': 'old-image', 'running': True,
                                      'restart': 'unless-stopped'}}, 'events': []}
        state['env_file'] = str(root / '.env.moderation')
        state['source_hashes'] = {}
        for file in ('server.mjs', 'request-budget.mjs', 'public-model-metadata.mjs', 'model-contracts.json', 'model-icon-inject.js'):
            content = 'offline-source-' + file
            write(root / 'services/creem-moderation-proxy' / file, content)
            state['source_hashes'][file] = hashlib.sha256(content.encode()).hexdigest()
        if with_backup:
            state['containers'][NAME + '-rollback'] = {'image': 'older-image', 'running': False,
                                                       'restart': 'no'}
        state_path = self.base / 'docker-state.json'
        write(state_path, json.dumps(state))
        self.env['MOCK_STATE'] = str(state_path)
        self.env['MOCK_FAILURE'] = failure
        return root, state_path

    def assert_proxy_rollback(self, failure):
        root, state_path = self.proxy_fixture(failure, with_backup=True)
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        state = json.loads(state_path.read_text())
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(state['containers'][NAME],
                         {'image': 'old-image', 'running': True, 'restart': 'unless-stopped'})
        self.assertEqual(state['containers'][NAME + '-rollback']['image'], 'older-image')
        self.assertFalse(any('-previous-' in name for name in state['containers']))
        self.assertNotIn('DONE_REDEPLOY_CREEM_MODERATION', result.stdout)
        return state

    def test_build_failure_never_stops_old_container(self):
        state = self.assert_proxy_rollback('build')
        self.assertFalse(any(event[:2] == ['docker', 'stop'] for event in state['events']))

    def test_run_failure_restores_original_configuration(self):
        self.assert_proxy_rollback('run')

    def test_health_failure_restores_old_container(self):
        self.assert_proxy_rollback('health')

    def test_crashed_new_container_cannot_pass_foreign_health_endpoint(self):
        self.assert_proxy_rollback('crash')

    def test_restarting_container_with_running_true_cannot_pass_foreign_health(self):
        self.assert_proxy_rollback('restarting')

    def test_running_new_container_cannot_pass_another_process_listener(self):
        self.assert_proxy_rollback('foreign')

    def test_new_container_source_must_match_built_checkout(self):
        self.assert_proxy_rollback('source_version')

    def test_new_process_must_remain_stable_between_health_rounds(self):
        self.assert_proxy_rollback('unstable')

    def test_foreign_listener_aborts_before_stopping_any_container(self):
        state = self.assert_proxy_rollback('preflight_foreign')
        self.assertFalse(any(event[:2] == ['docker', 'stop'] for event in state['events']))

    def test_rename_failure_restarts_still_named_original(self):
        self.assert_proxy_rollback('rename')

    def test_stop_failure_preserves_original(self):
        self.assert_proxy_rollback('stop')

    def assert_proxy_success(self, with_backup):
        root, state_path = self.proxy_fixture(with_backup=with_backup)
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        state = json.loads(state_path.read_text())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(state['containers'][NAME],
                         {'image': 'new-image', 'running': True, 'restart': 'unless-stopped'})
        self.assertEqual(state['containers'][NAME + '-rollback'],
                         {'image': 'old-image', 'running': False, 'restart': 'no'})
        self.assertEqual(len(state['containers']), 2)
        events = state['events']
        self.assertLess(next(i for i, e in enumerate(events) if e[:2] == ['docker', 'build']),
                        next(i for i, e in enumerate(events) if e[:2] == ['docker', 'stop']))
        run = next(e for e in events if e[:2] == ['docker', 'run'])
        self.assertIn('--env-file', run)
        self.assertEqual(run[run.index('--network') + 1], 'host')
        self.assertEqual(len([e for e in events if e[0] == 'curl']), 2)
        self.assertEqual(len([e for e in events if e[:2] == ['docker', 'exec']]), 2)
        self.assertIn('VERIFIED_PROXY_PID=222 SOURCE_FILES=5 STABLE_CHECKS=2', result.stdout)
        self.assertIn('DONE_REDEPLOY_CREEM_MODERATION', result.stdout)

    def test_success_keeps_first_rollback_container(self):
        self.assert_proxy_success(False)

    def test_success_replaces_only_older_rollback_slot(self):
        self.assert_proxy_success(True)

    def test_running_backup_slot_is_retained_without_stopping_or_removing(self):
        root, state_path = self.proxy_fixture(with_backup=True)
        state = json.loads(state_path.read_text())
        state['containers'][NAME + '-rollback']['running'] = True
        write(state_path, json.dumps(state))
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        state = json.loads(state_path.read_text())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(state['containers'][NAME + '-rollback'],
                         {'image': 'older-image', 'running': True, 'restart': 'no'})
        self.assertFalse(any(e[:2] in (['docker', 'stop'], ['docker', 'rm']) and
                             e[-1] == NAME + '-rollback' for e in state['events']))
        self.assertTrue(any('-previous-' in name for name in state['containers']))

    def test_missing_upload_directory_is_initialized_before_stopping(self):
        root, state_path = self.proxy_fixture(create_upload=False)
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        state = json.loads(state_path.read_text())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((root / 'static/uploads').is_dir())
        self.assertEqual((root / '.env.moderation').read_text(), 'OFFLINE_FIXTURE=not-a-secret\n')
        self.assertEqual(state['containers'][NAME]['image'], 'new-image')

    def test_existing_upload_contents_are_not_changed(self):
        root, state_path = self.proxy_fixture()
        existing = root / 'static/uploads/user-media.bin'
        write(existing, 'existing-user-upload')
        permissions = existing.parent.stat().st_mode
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(existing.read_text(), 'existing-user-upload')
        self.assertEqual(existing.parent.stat().st_mode, permissions)

    def test_custom_upload_bind_and_runtime_environment_are_preserved(self):
        root, state_path = self.proxy_fixture(create_upload=False)
        media = self.base / 'existing media'
        write(media / 'keep.bin', 'existing-user-upload')
        source = shell_path(media)
        binding = source + ':/srv/data:rw'
        state = json.loads(state_path.read_text())
        state.update(current_env=['UPLOAD_DIR=/srv/data/uploads',
                                  'UPLOAD_MAX_BYTES=777',
                                  'UPLOAD_PUBLIC_BASE=https://media.example.invalid/files',
                                  'CREEM_API_KEY=offline-fixture-value'],
                     binds=[binding], mounts=[['bind', source, '/srv/data', 'true', '']])
        write(state_path, json.dumps(state))
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((media / 'uploads').is_dir())
        self.assertEqual((media / 'keep.bin').read_text(), 'existing-user-upload')
        self.assertFalse((root / 'static/uploads').exists())
        state = json.loads(state_path.read_text())
        run = next(e for e in state['events'] if e[:2] == ['docker', 'run'])
        env_values = [run[i + 1] for i, arg in enumerate(run[:-1]) if arg == '-e']
        effective_env = dict(value.split('=', 1) for value in env_values)
        self.assertEqual(effective_env['UPLOAD_DIR'], '/srv/data/uploads')
        self.assertEqual(effective_env['UPLOAD_MAX_BYTES'], '777')
        self.assertEqual(effective_env['UPLOAD_PUBLIC_BASE'], 'https://media.example.invalid/files')
        self.assertEqual(effective_env['CREEM_API_KEY'], 'offline-fixture-value')
        self.assertEqual([run[i + 1] for i, arg in enumerate(run[:-1]) if arg == '-v'], [binding])
        self.assertNotIn('offline-fixture-value', result.stdout + result.stderr)

    def test_named_upload_volume_is_not_replaced_by_default_bind(self):
        root, state_path = self.proxy_fixture(create_upload=False)
        state = json.loads(state_path.read_text())
        state.update(current_env=['UPLOAD_DIR=/srv/uploads'], binds=[],
                     mounts=[['volume', '/var/lib/docker/volumes/existing/_data',
                              '/srv/uploads', 'true', 'existing-upload-volume']])
        write(state_path, json.dumps(state))
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((root / 'static/uploads').exists())
        state = json.loads(state_path.read_text())
        run = next(e for e in state['events'] if e[:2] == ['docker', 'run'])
        self.assertEqual([run[i + 1] for i, arg in enumerate(run[:-1]) if arg == '-v'],
                         ['existing-upload-volume:/srv/uploads'])

    def test_env_file_updates_override_old_environment_and_select_upload_mount(self):
        root, state_path = self.proxy_fixture(create_upload=False)
        media = self.base / 'configured media'
        write(media / 'uploads/keep.bin', 'existing-user-upload')
        source = shell_path(media)
        write(root / '.env.moderation',
              '# Updated production settings\nUPLOAD_DIR=/srv/data/newuploads\n'
              'UPLOAD_MAX_BYTES=999\nCREEM_API_KEY=updated-offline-value\nPORT=3102\n')
        state = json.loads(state_path.read_text())
        state.update(current_env=['UPLOAD_DIR=/srv/data/uploads', 'UPLOAD_MAX_BYTES=777',
                                  'CREEM_API_KEY=old-offline-value', 'PORT=3001',
                                  'EXTRA_RUNTIME_SETTING=preserve-me'],
                     binds=[source + ':/srv/data:rw'],
                     mounts=[['bind', source, '/srv/data', 'true', '']])
        write(state_path, json.dumps(state))
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((media / 'newuploads').is_dir())
        self.assertEqual((media / 'uploads/keep.bin').read_text(), 'existing-user-upload')
        self.assertFalse((root / 'static/uploads').exists())
        state = json.loads(state_path.read_text())
        run = next(e for e in state['events'] if e[:2] == ['docker', 'run'])
        env_values = [run[i + 1] for i, arg in enumerate(run[:-1]) if arg == '-e']
        env_keys = {v.split('=', 1)[0] for v in env_values}
        self.assertTrue({'UPLOAD_DIR', 'UPLOAD_MAX_BYTES', 'CREEM_API_KEY', 'PORT'}.isdisjoint(env_keys))
        self.assertIn('EXTRA_RUNTIME_SETTING=preserve-me', env_values)
        self.assertTrue(any(e[0] == 'curl' and e[-1] == 'http://127.0.0.1:3102/healthz'
                            for e in state['events']))
        self.assertNotIn('updated-offline-value', result.stdout + result.stderr)

    def test_upload_path_file_aborts_without_stopping_or_overwriting(self):
        root, state_path = self.proxy_fixture(create_upload=False)
        write(root / 'static/uploads', 'existing-not-a-directory')
        result = self.run_script('vps-redeploy-creem-moderation.sh', root)
        state = json.loads(state_path.read_text())
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((root / 'static/uploads').read_text(), 'existing-not-a-directory')
        self.assertEqual(state['containers'][NAME]['image'], 'old-image')
        self.assertTrue(state['containers'][NAME]['running'])
        self.assertFalse(any(e[:2] == ['docker', 'stop'] for e in state['events']))

    def test_real_model_workflows_require_explicit_opt_in(self):
        speech = (REPO / '.github/workflows/keyo-gift-speech-smoke.yml').read_text(encoding='utf-8')
        probe = (REPO / '.github/workflows/keyo-probe-kimi.yml').read_text(encoding='utf-8')
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.run_real_models", speech)
        self.assertIn('Offline speech contract tests', speech)
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.run_real_model", probe)
        self.assertNotIn('\n  push:', probe)


if __name__ == '__main__':
    unittest.main(verbosity=2)
