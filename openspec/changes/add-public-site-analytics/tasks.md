# Tasks and verification

- [x] Confirm existing public site, GSC tags, Cloudflare analytics notice and no existing GA4/consent component.
- [x] Add runtime behavior tests before implementation (unconfigured/unknown, accepted, rejected, restored, withdrawal, private URL, cross-tab and blocked storage).
- [x] Reuse footer/button/theme styles and bilingual consent choices.
- [x] Connect public measurement input to the existing production build.
- [x] Run focused tests and complete storefront build/tests.
- [x] Complete one consolidated adversarial review.
- [ ] Account owner finishes GA4 setup, disables enhanced measurement/advertising and supplies the actual public ID.
- [ ] Parent deploys and verifies no pre-consent requests, explicit consent, withdrawal and actual provider receipt.

Sources: Google [privacy controls](https://developers.google.com/tag-platform/security/guides/privacy), [configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [consent](https://developers.google.com/tag-platform/security/guides/consent). No real measurement ID was invented. Local tests use a clearly fictional ID and do not send provider traffic.

Local verification on 2026-09-24: targeted consent/UI/deployment-input tests 9/9; legal content tests 11/11; complete storefront build and tests 152/152 with `VITE_GA_MEASUREMENT_ID=G-TEST123456`; the resulting JS contains that fictional ID. An empty-input production build also succeeds. `git diff --check` passes. Desktop and 440×956 mobile checks confirm the consent layout, saved rejection after refresh and footer reopening. The temporary UI preview blocked Google's script. These checks do not prove provider receipt; production activation and verification remain separate steps.
