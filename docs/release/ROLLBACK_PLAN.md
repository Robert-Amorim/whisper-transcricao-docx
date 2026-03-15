# Rollback Plan

## Objective

Define minimum rollback procedure for pre-release and production incidents in this monorepo (`web`, `api`, `worker`, `shared`).

## Rollback Trigger

Trigger rollback when at least one condition is true:

- Healthcheck fails for more than 5 minutes after deploy.
- Error rate increases above 5% in core API endpoints.
- Queue processing failure rate remains above 10% for 10 minutes.
- Authentication, upload, or transcription flow becomes unavailable.

## Deployment Order

Use this order when multiple services change:

1. `packages/shared` build artifacts
2. `apps/api`
3. `apps/worker`
4. `apps/web`

## Rollback Order

Use reverse order for rollback:

1. `apps/web`
2. `apps/worker`
3. `apps/api`
4. `packages/shared`

## Service Actions

### web

- Revert to previous static bundle/image.
- Purge CDN/cache only after rollback artifact is active.
- Confirm routes load and login page is reachable.

### api

- Revert to previous artifact/container version.
- Validate `/health` and `/v1/auth/login`.
- If schema migration is backward-incompatible, execute DB restore plan before reopening traffic.

### worker

- Pause worker consumption before rollback, if possible.
- Redeploy previous worker artifact.
- Resume consumption and validate successful completion of new jobs.

### shared

- Rebuild/redeploy consumers (`api`, `worker`, `web`) pinned to previous shared contract.
- Validate compatibility with current database schema and queue payloads.

## Data and Schema Safety

- Always back up database before running non-additive migrations.
- For non-reversible migrations, include explicit restore instructions in release notes.
- Preserve `storage/uploads` and `storage/outputs` paths during rollback.

## Minimum Verification After Rollback

Run and verify:

1. API health endpoint returns success.
2. Login and token refresh flow work.
3. New transcription job can be queued.
4. Worker completes a transcription and writes outputs.
5. Web dashboard and transcription pages render.

## Ownership

- Incident commander: release owner on duty.
- Technical rollback execution: service owner (`api`, `worker`, `web`).
- Final go/no-go after rollback: engineering lead.
