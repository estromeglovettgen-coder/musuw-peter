#!/usr/bin/env python3
"""Exercise the reviewed integration release guard at its CLI seam."""
from pathlib import Path
import subprocess
import sys
import unittest


SCRIPT = Path(__file__).with_name("verify-reviewed-integration-release.py")
CANDIDATE = "3eb20a3b104dc6d162c637cbdcb66e3adde9ca96"
BASELINE = "9e479beb198d8af71c321d527a8bfee9c0ae7c4d"
RUN = "35641418640"


class ReviewedIntegrationRelease(unittest.TestCase):
    def invoke(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_accepts_only_the_reviewed_release_tuple(self) -> None:
        result = self.invoke(CANDIDATE, BASELINE, RUN)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("full_sandbox_e2e=false", result.stdout)
        self.assertIn("integration_acceptance=targeted", result.stdout)

    def test_rejects_another_revision_baseline_or_run(self) -> None:
        for args in (
            ("main", BASELINE, RUN),
            ("a" * 40, BASELINE, RUN),
            (CANDIDATE, "b" * 40, RUN),
            (CANDIDATE, BASELINE, "35641418641"),
            (CANDIDATE, BASELINE),
            (CANDIDATE, BASELINE, RUN, "extra"),
        ):
            with self.subTest(args=args):
                result = self.invoke(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
