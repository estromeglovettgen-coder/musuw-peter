#!/usr/bin/env python3
"""Exact reviewed-model-release scopes, not a general Sandbox bypass.

The workflow additionally proves current production provenance, green CI,
canonical main ancestry, the recorded/live staging image pair, and requires
server-production owner review. Matching a scope does not attest that staging
or owner approval has passed. See docs/MODEL_RELEASE_20260919.md and the pending
proposal in docs/AGENT_RELEASE_REVIEW_20260920.md.
"""
import sys


def main(args):
    reviewed = {
        (
            "d0074e336d743cbc626d9a02050d58f0e2a19ea7",
            "ced1b95fb70f545a41f02ac2af6b01834afdcae9",
            "35432690027",
        ),
        (
            "1a2cba494b7f9b21ad4fa41185d4b20340d2bb9a",
            "13ed3446bb992792b33684fb65da78d57309c6e7",
            "35519086160",
        ),
    }
    if tuple(args) not in reviewed:
        print("model release rejected: candidate, production baseline or staging run is not reviewed", file=sys.stderr)
        return 1
    print("reviewed-model-release scope matched; full_sandbox_e2e=false; owner_review=required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
