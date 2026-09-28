#!/usr/bin/env python3
"""The limited-evidence release guard accepts only its reviewed tuple."""
from pathlib import Path
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import runpy
import subprocess
import sys
import unittest


SCRIPT = Path(__file__).with_name("verify-reviewed-curated-release.py")
# Synthetic values exercise the exact-match contract without granting a release.
CANDIDATE = "a" * 40
BASELINE = "b" * 40
STAGING_RUN = "123456789"


class ReviewedCuratedRelease(unittest.TestCase):
    def invoke(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def invoke_registered(self, *args: str) -> tuple[int, str, str]:
        namespace = runpy.run_path(str(SCRIPT))
        main = namespace["main"]
        main.__globals__["REVIEWED_RELEASE"] = (CANDIDATE, BASELINE, STAGING_RUN)
        stdout, stderr = StringIO(), StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            status = main(list(args))
        return status, stdout.getvalue(), stderr.getvalue()

    def test_accepts_only_the_reviewed_tuple_without_full_e2e_claim(self) -> None:
        status, stdout, stderr = self.invoke_registered(CANDIDATE, BASELINE, STAGING_RUN)
        self.assertEqual(status, 0, stderr)
        self.assertIn("full_sandbox_e2e=false", stdout)
        self.assertIn("acceptance=limited", stdout)

    def test_unreviewed_placeholders_never_authorize_a_release(self) -> None:
        for args in (
            ("None", "19faaa073c1018ab8ebf699b841585feed38f728", "None"),
            (CANDIDATE, "19faaa073c1018ab8ebf699b841585feed38f728", STAGING_RUN),
            # Historical permission is not reusable for the next release.
            ("19faaa073c1018ab8ebf699b841585feed38f728", "16d503fb9fc1c6ca4653e90406117eab457650b4", "36318675629"),
        ):
            with self.subTest(args=args):
                result = self.invoke(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")

    def test_rejects_different_candidate_baseline_or_staging_run(self) -> None:
        for args in (
            ("main", BASELINE, STAGING_RUN),
            ("c" * 40, BASELINE, STAGING_RUN),
            (CANDIDATE, "d" * 40, STAGING_RUN),
            (CANDIDATE, BASELINE, "36318675630"),
            (CANDIDATE, BASELINE),
            (CANDIDATE, BASELINE, STAGING_RUN, "extra"),
        ):
            with self.subTest(args=args):
                status, stdout, _ = self.invoke_registered(*args)
                self.assertNotEqual(status, 0)
                self.assertEqual(stdout, "")


if __name__ == "__main__":
    unittest.main()
