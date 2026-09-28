#!/usr/bin/env python3
"""Exercise the release guard through its actual command-line boundary."""
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).with_name("verify-reviewed-model-release.py")
CANDIDATE = "d0074e336d743cbc626d9a02050d58f0e2a19ea7"
BASELINE = "ced1b95fb70f545a41f02ac2af6b01834afdcae9"
RUN = "35432690027"
AGENT_CANDIDATE = "1a2cba494b7f9b21ad4fa41185d4b20340d2bb9a"
AGENT_BASELINE = "13ed3446bb992792b33684fb65da78d57309c6e7"
AGENT_RUN = "35519086160"


class ReviewedModelRelease(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)

    def test_reviewed_release(self):
        result = self.invoke(CANDIDATE, BASELINE, RUN)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("full_sandbox_e2e=false", result.stdout)

    def test_exact_agent_release_scope(self):
        # Approval and staging evidence belong to the protected workflow. The
        # guard accepts only this proposed scope, never another build/run.
        result = self.invoke(AGENT_CANDIDATE, AGENT_BASELINE, AGENT_RUN)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("full_sandbox_e2e=false", result.stdout)

    def test_rejects_another_revision_baseline_or_run(self):
        for candidate, baseline, run in (
            (CANDIDATE, BASELINE, RUN), (AGENT_CANDIDATE, AGENT_BASELINE, AGENT_RUN),
        ):
            for args in [("main", baseline, run), ("a" * 40, baseline, run),
                         (candidate, "b" * 40, run), (candidate, baseline, "35428477248"),
                         (candidate, baseline), (candidate, baseline, run, "extra")]:
                with self.subTest(args=args):
                    result = self.invoke(*args)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, "")

    def test_rejects_mixed_release_tuples(self):
        exact_scopes = {
            (CANDIDATE, BASELINE, RUN), (AGENT_CANDIDATE, AGENT_BASELINE, AGENT_RUN),
        }
        for candidate in (CANDIDATE, AGENT_CANDIDATE):
            for baseline in (BASELINE, AGENT_BASELINE):
                for run in (RUN, AGENT_RUN):
                    args = (candidate, baseline, run)
                    if args in exact_scopes:
                        continue
                    with self.subTest(args=args):
                        self.assertNotEqual(self.invoke(*args).returncode, 0)

    def test_rejects_abandoned_branch_candidate_and_staging_run(self):
        abandoned_candidate = "1b2137125a06aeb9eb9a07c6dacd5488d308a33b"
        abandoned_run = "35518490241"
        for args in (
            (abandoned_candidate, AGENT_BASELINE, abandoned_run),
            (abandoned_candidate, AGENT_BASELINE, AGENT_RUN),
            (AGENT_CANDIDATE, AGENT_BASELINE, abandoned_run),
        ):
            with self.subTest(args=args):
                result = self.invoke(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
