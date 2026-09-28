#!/usr/bin/env python3
"""Fail-closed scope for one reviewed IM/web-embed production release.

The production workflow separately proves green CI, canonical main ancestry,
the current production baseline, the recorded/live staging image pair and the
server-production reviewer gate. This guard records only the targeted
integration acceptance documented in docs/INTEGRATION_RELEASE_REVIEW_20260921.md;
it does not attest to full Paddle Sandbox lifecycle acceptance.
"""
import sys


REVIEWED_RELEASE = (
    "3eb20a3b104dc6d162c637cbdcb66e3adde9ca96",
    "9e479beb198d8af71c321d527a8bfee9c0ae7c4d",
    "35641418640",
)


def main(args: list[str]) -> int:
    if tuple(args) != REVIEWED_RELEASE:
        print(
            "integration release rejected: candidate, production baseline or "
            "staging run is not the reviewed tuple",
            file=sys.stderr,
        )
        return 1
    print(
        "reviewed-integration-release scope matched; "
        "integration_acceptance=targeted; full_sandbox_e2e=false; "
        "owner_review=required"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
