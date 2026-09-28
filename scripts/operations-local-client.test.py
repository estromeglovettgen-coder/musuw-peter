#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import shlex
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('client', Path(__file__).with_name('operations-local-client.py'))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class PrivateClientTests(unittest.TestCase):
    def test_current_system_socks_is_used_without_an_idle_timeout(self):
        settings = '<dictionary> {\n SOCKSEnable : 1\n SOCKSProxy : 127.0.0.1\n SOCKSPort : 7897\n}'
        self.assertEqual(client.connection_arguments(settings, '43.133.221.194', '22'),
                         ['/usr/bin/nc', '-G', '10', '-X', '5', '-x', '127.0.0.1:7897', '43.133.221.194', '22'])

    def test_disabled_or_absent_socks_uses_direct_connection(self):
        for settings in ('', '<dictionary> {\n SOCKSEnable : 0\n SOCKSProxy : ignored\n}'):
            self.assertEqual(client.connection_arguments(settings, 'example.com', '22'),
                             ['/usr/bin/nc', '-G', '10', 'example.com', '22'])

    def test_enabled_proxy_fails_closed_for_invalid_host_port_or_duplicate_settings(self):
        for settings in (
            'SOCKSEnable : 1\nSOCKSProxy : bad;command\nSOCKSPort : 7897',
            'SOCKSEnable : 1\nSOCKSProxy : 127.0.0.1\nSOCKSPort : 99999',
            'SOCKSEnable : 1\nSOCKSProxy : -evil\nSOCKSPort : 7897',
            'SOCKSEnable : 1\nSOCKSEnable : 0',
            'SOCKSEnable : 1',
            'SOCKSEnable : invalid',
        ):
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                client.connection_arguments(settings, 'example.com', '22')
        for host, port in [('example.com;id', '22'), ('-x', '22'), ('example.com', '22;id')]:
            with self.assertRaises(ValueError):
                client.connection_arguments('', host, port)

    def test_every_proxy_connection_reads_current_settings_and_execs_argv(self):
        responses = [types.SimpleNamespace(stdout='SOCKSEnable : 1\nSOCKSProxy : 127.0.0.1\nSOCKSPort : 7897'),
                     types.SimpleNamespace(stdout='SOCKSEnable : 0')]
        with patch.object(client.subprocess, 'run', side_effect=responses) as run, patch.object(client.os, 'execv') as execute:
            client.proxy('example.com', '22')
            client.proxy('example.com', '22')
        self.assertEqual(run.call_count, 2)
        self.assertIn('127.0.0.1:7897', execute.call_args_list[0].args[1])
        self.assertEqual(execute.call_args_list[1].args[1], ['/usr/bin/nc', '-G', '10', 'example.com', '22'])

    def test_stable_helper_path_with_spaces_is_shell_quoted(self):
        path = Path('/Users/operator/Library/Application Support/MusuwOperations/operations-local-client.py')
        value = client.proxy_option(path).removeprefix('-oProxyCommand=')
        self.assertEqual(shlex.split(value), ['/usr/bin/python3', str(path), 'proxy', '%h', '%p'])

    def test_failure_while_disabling_old_tunnel_also_restores_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            support = base / 'Application Support'
            agents = base / 'LaunchAgents'
            agents.mkdir()
            with patch.multiple(client, SUPPORT=support, LOGS=base / 'Logs', AGENTS=agents,
                                RECORD=support / 'http-client-backup'), \
                 patch.object(client.subprocess, 'run', return_value=types.SimpleNamespace(stdout='{"status":"ok"}')), \
                 patch.object(client, 'stop'), \
                 patch.object(client, 'launchctl', side_effect=RuntimeError('disable failed')), \
                 patch.object(client, 'rollback') as rollback:
                with self.assertRaisesRegex(RuntimeError, 'disable failed'):
                    client.install()
                rollback.assert_called_once()


if __name__ == '__main__':
    unittest.main()
