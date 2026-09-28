#!/usr/bin/env python3
"""One reviewed model release, not a general bypass for Sandbox acceptance.

The workflow additionally proves current production provenance, green CI,
canonical main ancestry, the recorded/live staging image pair, and requires
server-production owner review. See docs/MODEL_RELEASE_20260919.md.
"""
import sys


def main(args):
    reviewed = (
        "d0074e336d743cbc626d9a02050d58f0e2a19ea7",
        "ced1b95fb70f545a41f02ac2af6b01834afdcae9",
        "35432690027",
    )
    if tuple(args) != reviewed:
        print("model release rejected: candidate, production baseline or staging run is not reviewed", file=sys.stderr)
        return 1
    print("reviewed-model-release accepted; full_sandbox_e2e=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
