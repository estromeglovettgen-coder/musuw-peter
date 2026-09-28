#!/usr/bin/env python3
"""Run the active WeKnora DocReader unittest suite with deterministic network policy.

The repository also contains historical/conformance-only test runners.  CI must
exercise the active fork under ``weknora/`` directly, so this small runner keeps
the only two pieces of test policy that are required for a network-independent
build: known optional upstream fixtures are skipped and the public-DNS SSRF
case is supplied a fixed address.
"""

from __future__ import annotations

import socket
import sys
import unittest
from pathlib import Path
from typing import Callable, Iterator
from unittest.mock import patch


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
WEKNORA_ROOT = REPOSITORY_ROOT / "weknora"
TEST_ROOT = WEKNORA_ROOT / "docreader" / "tests"

MISSING_FIXTURE_POLICY: dict[str, tuple[Path, ...]] = {
    "test_ppt_convert.TestPptConvert.test_legacy_ppt_magic": (
        WEKNORA_ROOT / "testdata" / "rag_test" / "ppt_old" / "en_38256.ppt",
    ),
    "test_ppt_convert.TestPptConvert.test_legacy_ppt_requires_soffice": (
        WEKNORA_ROOT / "testdata" / "rag_test" / "ppt_old" / "en_38256.ppt",
    ),
    "test_ppt_convert.TestPptConvert.test_normalize_pptx_passthrough": (
        WEKNORA_ROOT / "testdata" / "rag_test" / "pptx" / "en_marker.pptx",
    ),
    "test_ppt_convert.TestPptConvert.test_pptx_does_not_need_conversion": (
        WEKNORA_ROOT / "testdata" / "rag_test" / "pptx" / "en_marker.pptx",
    ),
}

DETERMINISTIC_DNS_TEST = "test_ssrf.TestSSRFValidation.test_allows_public_https"
DETERMINISTIC_PUBLIC_ADDRESS = "8.8.8.8"


def iter_cases(suite: unittest.TestSuite) -> Iterator[unittest.TestCase]:
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from iter_cases(item)
        elif isinstance(item, unittest.TestCase):
            yield item
        else:
            raise TypeError(f"unexpected unittest item: {type(item)!r}")


def mark_missing_fixture_skip(case: unittest.TestCase, fixtures: tuple[Path, ...]) -> None:
    method_name = case._testMethodName
    method = getattr(case, method_name)
    relative = ", ".join(str(path.relative_to(REPOSITORY_ROOT)) for path in fixtures)
    setattr(
        case,
        method_name,
        unittest.skip(f"pinned upstream snapshot omits required fixture: {relative}")(method),
    )


def inject_deterministic_public_dns(case: unittest.TestCase) -> None:
    method_name = case._testMethodName
    method: Callable[[], None] = getattr(case, method_name)

    def deterministic_method() -> None:
        answer = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                (DETERMINISTIC_PUBLIC_ADDRESS, 0),
            )
        ]
        with patch("docreader.utils.ssrf.socket.getaddrinfo", return_value=answer):
            method()

    setattr(case, method_name, deterministic_method)


def main() -> int:
    sys.path.insert(0, str(WEKNORA_ROOT))
    suite = unittest.defaultTestLoader.discover(str(TEST_ROOT), pattern="test_*.py")
    cases = list(iter_cases(suite))
    ids = {case.id() for case in cases}

    missing_policy = set(MISSING_FIXTURE_POLICY).difference(ids)
    if missing_policy:
        raise RuntimeError(
            "DocReader missing-fixture policy references absent tests: "
            + ", ".join(sorted(missing_policy))
        )
    if DETERMINISTIC_DNS_TEST not in ids:
        raise RuntimeError("DocReader deterministic DNS test target is absent")

    policy_skips = 0
    for case in cases:
        fixtures = MISSING_FIXTURE_POLICY.get(case.id())
        if fixtures is not None and not any(path.is_file() for path in fixtures):
            mark_missing_fixture_skip(case, fixtures)
            policy_skips += 1
        if case.id() == DETERMINISTIC_DNS_TEST:
            inject_deterministic_public_dns(case)

    print(
        "docreader_test_policy "
        f"discovered={len(cases)} missing_fixture_skips={policy_skips} "
        "deterministic_dns_injections=1",
        file=sys.stderr,
    )
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
