# Reviewed model release — 2026-09-19

The owner requested immediate production deployment after being told that the
model update was only on staging and that full Sandbox lifecycle acceptance was
unfinished. This approval covers the following already built candidate only.
It does not attest to complete Sandbox E2E or authorize arbitrary future releases.

- Production baseline: `ced1b95fb70f545a41f02ac2af6b01834afdcae9`.
- Candidate: `d0074e336d743cbc626d9a02050d58f0e2a19ea7`.
- Successful canonical CI: `35432171388`.
- Successful staging release: `35432690027`.
- App digest: `sha256:8b91cd6f2b2c651fa5ed16927d898602f290c9c324c5004992471536f97ec65c`.
- Frontend digest: `sha256:c0770988bb2d7ffe33897a77ad2081965ff5ed5b42abbb638b0da922e8b45837`.

The model refresh retains internal IDs, saved selections, embedding identity and
dimension. It updates managed provider names/capabilities and normalizes retired
reasoning efforts. Eleven bounded supplier probes passed; normal staging DeepSeek
text and a neutral-named two-color image completed correctly. An exact-token
instruction failed and is not reported as passing. These are bounded checks, not
a sustained reliability or complete multimodel application acceptance claim.

The reviewed candidate also includes separately tested operations UI recovery,
Free-plan wording and already released storefront assets. The application diff
does not change billing handlers/services, authentication backend, database
migrations, runtime environment definitions, dependencies or image build inputs.
The operations-only CSRF refresh remains conditional on its existing header.
The server SSH wrapper's operations-only mode is separately tested; promotion
does not install or modify the host's SSH authorization or gate configuration.

`reviewed-model-release` must match the exact candidate, baseline and staging
run above. Existing canonical ancestry and CI checks, prior production manifest,
staging artifact/live digest verification, protected `server-production` owner
review, restricted deploy seam, health checks and automatic rollback remain.
The release manifest records this distinct acceptance class. It must never be
recorded as `full-sandbox-e2e-green` or `ui-regression-green`.

After release, verify both production OCI revisions/digests, the managed model
catalog, refreshed authenticated UI/default, and one normal DeepSeek response.
Full Sandbox lifecycle and remaining multimodel application acceptance remain
follow-up work; this exception does not mark them complete.
