# Verification — 2026-09-24

## Before release

- `npm test --prefix storefront`: Vite build, prerender, and all 164 tests passed.
- `python3 scripts/ci/verify-ui-release-scope.test.py`: 17 passed.
- `ruby scripts/ci/validate-workflows.rb`: workflow contract green.
- `openspec validate storefront-seo-foundations --strict` and `git diff --check`: passed.
- Independent review covered routing, SSR/hydration, canonical/hreflang/schema, existing content, privacy, and exact deployment workflow. The ordinary legal-page language consumer was corrected and its full-page SSR regression was observed failing before the fix and passing afterward. The reviewed workflow blob is `fc32fcc8365813f191049dca8e7c59c386ed78e9`.
- Actual Worker preview in Chrome: desktop 1512 px and mobile 440 × 956 px; English and Chinese home/article paths, resource cards, comparison navigation, legal-language switching and refresh passed. No horizontal document overflow was observed. Viewport reset after verification.
- Browser console contained only the pre-existing Three.js Clock deprecation warning, no errors.
- Browser CI exposed a hash-navigation regression: updating the URL in preference persistence before navigation could leave the legal-page body in the old language. Preference persistence now leaves navigation to the existing App handler. Two regression assertions failed before the correction; all 164 tests passed afterward. Real Chrome preview verified `/privacy?lang=en&source=footer#details` switching, immediate translated content, and refresh.
- Redirect fixtures were corrected after trace evidence showed Chromium escaping a simulated 301 into old production HTML. Worker redirect contracts and browser language interaction are now tested separately, with local-response assertions preventing accidental production access. The three-file corrective delta passed independent review.

## Search indexing and performance evidence

- Search Console report updated September 20: 3 indexed and 11 discovered but not indexed; the listed URLs had no last crawl date. The comparison URL inspection was unknown to Google, which is not evidence of a robots or network failure.
- Search Console Security Issues and Manual Actions: no issues detected.
- Core Web Vitals report updated September 22: insufficient usage data for both mobile and desktop. No pass/fail claim can be made.
- Public PageSpeed API returned quota exhaustion (HTTP 429); no Lighthouse score is claimed. Visual mobile verification is not a substitute for field performance data.

## Release

Required CI, production deployment, live checks, and sitemap submission remain pending at this commit. Evidence will be recorded after deployment; index inclusion and ranking are controlled by search engines.
