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


class ReviewedModelRelease(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)

    def test_reviewed_release(self):
        result = self.invoke(CANDIDATE, BASELINE, RUN)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("full_sandbox_e2e=false", result.stdout)

    def test_rejects_another_revision_baseline_or_run(self):
        for args in [("main", BASELINE, RUN), ("a" * 40, BASELINE, RUN),
                     (CANDIDATE, "b" * 40, RUN), (CANDIDATE, BASELINE, "35428477248"),
                     (CANDIDATE, BASELINE), (CANDIDATE, BASELINE, RUN, "extra")]:
            with self.subTest(args=args):
                self.assertNotEqual(self.invoke(*args).returncode, 0)


if __name__ == "__main__":
    unittest.main()
