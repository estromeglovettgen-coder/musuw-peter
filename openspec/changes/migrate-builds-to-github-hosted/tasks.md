## 1. Hosted runner routing

- [x] 1.1 Pin CI and Storefront jobs to standard `ubuntu-24.04` and enable their official caches directly
- [x] 1.2 Route production authorization, native AMD64 construction, and final restricted deployment to `ubuntu-24.04`

## 2. Production build simplification

- [x] 2.1 Replace the Beijing source artifact transport and preinstalled Node assumption with exact-SHA checkout and official Node setup
- [x] 2.2 Replace raw Docker lifecycle code with official actions and separate maximum-mode GHA cache scopes while preserving native builds, provenance, and digest validation

## 3. Contracts and documentation

- [x] 3.1 Update workflow validation and checked-in runner configuration for hosted execution
- [x] 3.2 Update deployment documentation and validate the OpenSpec change

## 4. Verification and activation

- [x] 4.1 Run workflow syntax, shell, static production, and repository contract checks
- [x] 4.2 Push the change and verify fresh CI, Storefront, cached production build, GitHub-hosted Tokyo deployment, and public health
