# Upstream provenance

The active application source under `weknora/` is a local adaptation of
[Tencent WeKnora v0.7.2](https://github.com/Tencent/WeKnora/tree/v0.7.2).
The exact upstream tag, commit, source tree digest, and adaptation policy are
kept in:

- [`third_party/weknora/active-upstream-source.json`](third_party/weknora/active-upstream-source.json)
- [`third_party/weknora/v0.7.2-provenance.json`](third_party/weknora/v0.7.2-provenance.json)
- [`weknora/LICENSE`](weknora/LICENSE)

This repository keeps `cmd/server` and the application source needed to build
the backend while excluding only the upstream-generated root `server` and
`desktop` binaries. Local Musuw changes cover branding, the Supabase
Google/email-OTP entry shell, server-side model configuration, locale handling,
and the consumer workspace UI. The baseline source remains the authority for
future reviewed releases.

## Dependency and asset provenance

- The storefront embeds Switzer webfont files from Fontshare. The official
  [Fontshare ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl)
  and the [Switzer family page](https://www.fontshare.com/fonts/switzer) are
  the governing sources; do not replace or redistribute the files outside the
  license terms.
- The frontend's approved `xlsx-0.20.2.tgz` package is SheetJS Community
  Edition. The official [SheetJS source repository](https://git.sheetjs.com/sheetjs/sheetjs)
  identifies the Community Edition as Apache-2.0; its package source and
  license must remain available with the release notices.
