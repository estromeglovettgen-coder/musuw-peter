## 1. R2 Runtime Wiring

- [x] 1.1 Extend the existing production secret contract and application entrypoint for the R2 S3 key pair.
- [x] 1.2 Configure the native S3 provider for the private `musuw-production` R2 bucket.
- [x] 1.3 Prune unused images only after a healthy activated release.

## 2. Cloud and Data Migration

- [x] 2.1 Delete the obsolete R2 bucket, create the production bucket, and install a bounded read/write credential.
- [x] 2.2 Copy and verify existing server files, then transactionally switch tenant, knowledge-base, and resource bindings.

## 3. Verification and Release

- [x] 3.1 Pass focused local production-contract and OpenSpec validation.
- [x] 3.2 Commit and push the task version, wait for CI/deploy, and verify production health.
- [x] 3.3 Use the browser to read an existing object and upload/delete a new document through the real R2 path.
