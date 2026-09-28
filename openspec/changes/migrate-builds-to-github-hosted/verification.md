# Hosted production delivery verification

## Local and contract verification

- `go test -race -count=1 ./internal/handler` passed after moving production revision reporting to the existing validated runtime revision.
- `ruby scripts/ci/validate-workflows.rb` passed.
- `bash scripts/weknora-production/verify-static.sh` passed.
- `bash scripts/weknora-production/deploy-ci-seams-contract.test.sh` passed.
- `bash scripts/ci/secret-scan.sh` passed.
- `openspec validate migrate-builds-to-github-hosted --strict` passed.

## Hosted cold activation baseline

- Revision `c025140a92e9489c6969c4b8edec93bdad8456bc` passed [CI run 33140608230](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33140608230).
- The same revision passed [Storefront run 33140734078](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33140734078).
- The same revision passed [Production run 33140734082](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33140734082) using only GitHub-hosted Ubuntu jobs and the restricted Tokyo release command.
- The intentional cold source-changing image build took 8 minutes 2 seconds; the restricted deployment took 42 seconds.
- Post-deploy checks confirmed healthy application and frontend containers, exact revision labels, the same validated runtime revision inside the application container, public health success, and Paddle public configuration still `configured=true` in `live` mode.

## Warm-cache acceptance

- Documentation-only revision `1710569fcd6e990eb9f5e24cdf0bd6f40bfcdb48`
  passed [CI run 33141237062](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33141237062),
  [Storefront run 33141368238](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33141368238),
  and [Production run 33141368215](https://github.com/estromeglovettgen-coder/musuw/actions/runs/33141368215).
- The GitHub-hosted native AMD64 image job completed in 1 minute 44 seconds,
  down from the 8-minute-2-second cold baseline. The application image step
  completed in 7 seconds, including registry push, and the build log explicitly
  reported the `make build-prod` source-compilation layer as `CACHED`.
- Digest validation passed before the restricted release. The Tokyo deployment
  then completed in 35 seconds; the complete production workflow took about
  2 minutes 33 seconds from creation through completion.
- Post-deploy checks confirmed healthy app and frontend containers, exact
  application/frontend revision labels, and the same validated runtime revision.
  The TikHub and Paddle protected mounts were present and non-empty without
  reading their contents. Public `/health` returned success, while Paddle public
  configuration remained `configured=true` in `live` mode with a client token.
