#!/usr/bin/env python3
"""Keep the existing private browser URL while the gateway runs on the server."""
import datetime
import ipaddress
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

LABEL = 'com.musuw.operations.production'
OLD_TUNNEL = 'com.musuw.operations.tunnel'
HOME_DIR = Path.home()
AGENTS = HOME_DIR / 'Library/LaunchAgents'
SUPPORT = HOME_DIR / 'Library/Application Support/MusuwOperations'
LOGS = HOME_DIR / 'Library/Logs/MusuwOperations'
DOMAIN = f'gui/{os.getuid()}'
RECORD = SUPPORT / 'http-client-backup'


def network_host(value):
    if not isinstance(value, str) or not value or len(value) > 253:
        raise ValueError('Invalid network host')
    try:
        ipaddress.ip_address(value)
    except ValueError:
        labels = value.rstrip('.').split('.')
        if not all(re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in labels):
            raise ValueError('Invalid network host')
    return value


def network_port(value):
    if not re.fullmatch(r'[0-9]{1,5}', str(value)) or not 1 <= int(value) <= 65535:
        raise ValueError('Invalid network port')
    return str(int(value))


def connection_arguments(proxy_settings, host, port):
    host, port = network_host(host), network_port(port)
    settings = {}
    for line in proxy_settings.splitlines():
        match = re.fullmatch(r'\s*(SOCKSEnable|SOCKSProxy|SOCKSPort)\s*:\s*(.*?)\s*', line)
        if match:
            key, value = match.groups()
            if key in settings:
                raise ValueError('Duplicate system SOCKS setting')
            settings[key] = value
    enabled = settings.get('SOCKSEnable', '0')
    if enabled not in ('0', '1'):
        raise ValueError('Invalid system SOCKS setting')
    arguments = ['/usr/bin/nc', '-G', '10']
    if enabled == '1':
        proxy_host = network_host(settings.get('SOCKSProxy'))
        proxy_port = network_port(settings.get('SOCKSPort', ''))
        authority = f'[{proxy_host}]' if ':' in proxy_host else proxy_host
        arguments += ['-X', '5', '-x', f'{authority}:{proxy_port}']
    # -G bounds connection establishment only. An idle tunnel must remain open.
    return arguments + [host, port]


def proxy(host, port):
    settings = subprocess.run(['/usr/sbin/scutil', '--proxy'], check=True,
                              capture_output=True, text=True).stdout
    arguments = connection_arguments(settings, host, port)
    os.execv(arguments[0], arguments)


def proxy_option(script_path):
    command = shlex.join(['/usr/bin/python3', str(script_path), 'proxy', '%h', '%p'])
    return '-oProxyCommand=' + command


def launchctl(*args, required=True):
    return subprocess.run(['/bin/launchctl', *args], check=required,
                          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def stop(label):
    launchctl('bootout', f'{DOMAIN}/{label}', required=False)


def start(label):
    launchctl('enable', f'{DOMAIN}/{label}')
    launchctl('bootstrap', DOMAIN, str(AGENTS / f'{label}.plist'))


def install():
    SUPPORT.mkdir(parents=True, exist_ok=True)
    stable_script = SUPPORT / 'operations-local-client.py'
    if Path(__file__).resolve() != stable_script.resolve():
        temporary_script = SUPPORT / '.operations-local-client.py.tmp'
        shutil.copyfile(__file__, temporary_script)
        temporary_script.chmod(0o600)
        temporary_script.replace(stable_script)
    selected_proxy = proxy_option(stable_script)
    # Check the real server data path before replacing the working local setup.
    result = subprocess.run([
        '/usr/bin/ssh', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes',
        '-oConnectTimeout=10', selected_proxy, 'musuw-tokyo',
        'curl --fail --silent --max-time 5 http://127.0.0.1:4187/readyz',
    ], check=True, capture_output=True, text=True)
    if json.loads(result.stdout).get('status') != 'ok':
        raise RuntimeError('Server operations database is not ready')
    LOGS.mkdir(parents=True, exist_ok=True)
    AGENTS.mkdir(parents=True, exist_ok=True)
    if not RECORD.exists():
        backup = SUPPORT / 'backups' / datetime.datetime.now().strftime('http-client-%Y%m%d-%H%M%S')
        backup.mkdir(parents=True, mode=0o700)
        for label in (LABEL, OLD_TUNNEL):
            source = AGENTS / f'{label}.plist'
            if source.exists():
                shutil.copy2(source, backup / source.name)
        RECORD.write_text(str(backup))
        RECORD.chmod(0o600)
    plist = {
        'Label': LABEL,
        'ProgramArguments': [
            '/usr/bin/ssh', '-N', '-T', '-oBatchMode=yes',
            '-oStrictHostKeyChecking=yes', '-oExitOnForwardFailure=yes',
            '-oServerAliveInterval=15', '-oServerAliveCountMax=2',
            '-oConnectTimeout=10', '-oConnectionAttempts=1',
            '-oControlMaster=no', '-oControlPath=none',
            selected_proxy,
            '-L', '127.0.0.1:4187:127.0.0.1:4187', 'musuw-tokyo',
        ],
        'EnvironmentVariables': {'HOME': str(HOME_DIR), 'PATH': '/usr/bin:/bin:/usr/sbin:/sbin'},
        'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 5,
        'StandardOutPath': str(LOGS / 'http-client.log'),
        'StandardErrorPath': str(LOGS / 'http-client.error.log'),
    }
    try:
        stop(LABEL)
        stop(OLD_TUNNEL)
        launchctl('disable', f'{DOMAIN}/{OLD_TUNNEL}')
        path = AGENTS / f'{LABEL}.plist'
        path.write_bytes(plistlib.dumps(plist))
        path.chmod(0o600)
        start(LABEL)
        deadline = time.monotonic() + 30
        while True:
            try:
                with urllib.request.urlopen('http://127.0.0.1:4187/readyz', timeout=3) as response:
                    if json.load(response).get('status') == 'ok':
                        break
            except (OSError, ValueError, urllib.error.URLError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('HTTP forwarding did not become ready; restoring local services')
            time.sleep(1)
    except Exception:
        rollback()
        raise
    print('HTTP forwarding installed. Browser URL: http://127.0.0.1:4187/#/users')
    print('Prior local service configuration retained for rollback.')


def rollback():
    backup = Path(RECORD.read_text().strip())
    if not backup.is_relative_to(SUPPORT / 'backups') or not backup.is_dir():
        raise RuntimeError('Invalid local configuration backup')
    stop(LABEL)
    stop(OLD_TUNNEL)
    for label in (OLD_TUNNEL, LABEL):
        source = backup / f'{label}.plist'
        if source.exists():
            shutil.copy2(source, AGENTS / source.name)
            start(label)
    print('Previous local operations services restored.')


def status():
    result = launchctl('print', f'{DOMAIN}/{LABEL}', required=False)
    print('LaunchAgent loaded:', result.returncode == 0)
    with urllib.request.urlopen('http://127.0.0.1:4187/readyz', timeout=5) as response:
        print('Server readiness:', json.load(response).get('status'))


if __name__ == '__main__':
    if sys.platform != 'darwin':
        raise SystemExit('This client installer is for macOS only')
    if len(sys.argv) == 4 and sys.argv[1] == 'proxy':
        proxy(sys.argv[2], sys.argv[3])
    else:
        actions = {'install': install, 'rollback': rollback, 'status': status}
        if len(sys.argv) != 2 or sys.argv[1] not in actions:
            raise SystemExit('Usage: operations-local-client.py install|rollback|status|proxy HOST PORT')
        actions[sys.argv[1]]()
