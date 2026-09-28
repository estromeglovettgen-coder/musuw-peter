#!/usr/bin/env python3
"""Limit the reviewed login/performance release to its exact recorded evidence.

The workflow separately verifies green CI, main ancestry, the live production
baseline, matching staged image digests and the server-production reviewer.
This guard does not assert full Paddle Sandbox lifecycle acceptance.
"""
import sys


# Fill candidate and staging run only after the targeted acceptance recorded in
# docs/LOGIN_PERFORMANCE_RELEASE_REVIEW_20260928.md has passed. None cannot match
# a command-line argument, so the pending record rejects every promotion.
REVIEWED_RELEASE: tuple[str | None, str, str | None] = (
    None,
    "19faaa073c1018ab8ebf699b841585feed38f728",
    None,
)


def main(args: list[str]) -> int:
    if tuple(args) != REVIEWED_RELEASE:
        print(
            "curated release rejected: candidate, production baseline or "
            "staging run is not the reviewed tuple",
            file=sys.stderr,
        )
        return 1
    print(
        "reviewed-curated-release scope matched; "
        "acceptance=limited; full_sandbox_e2e=false; owner_review=required"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
