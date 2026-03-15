# PR and Release Checklist

## Pre-Merge Checklist

1. Scope and impact
   - Identify touched workspaces.
   - Classify risk level: low, medium, high.
2. Core quality checks
   - Run `npm run typecheck`.
   - Run `npm run build`.
   - Run `npm run lint` when configured for touched workspaces.
3. Contract and behavior checks
   - If API contract changed, verify web/worker compatibility.
   - If shared types changed, verify all consumers compile.
   - If worker logic changed, verify retry/timeout/error paths.
4. Migration checks
   - If Prisma schema changed, ensure migration files are present.
   - Confirm migration can run in target environment.
5. PR decision
   - Pass only when no blockers remain.
   - If risks remain, label as pass-with-risk and document mitigation.

## Pre-Release Checklist

1. Release scope
   - List services included in release (`web`, `api`, `worker`, `shared`).
2. Configuration and secrets
   - Confirm required env vars exist for each changed service.
   - Confirm provider-related variables for worker/API when applicable.
3. Deployment order
   - Deploy backend dependencies before frontend when contracts changed.
   - Avoid deploying incompatible consumer/producer combinations.
4. Rollback readiness
   - Define rollback trigger (error threshold, failed healthcheck, etc.).
   - Define rollback action per service.
5. Go/No-go
   - Go only when checks are green and rollback is prepared.

## Suggested Gate Report Template

```text
Gate: pass | pass-with-risk | fail
Scope: <files/services impacted>
Checks run:
- <command/result>
- <command/result>
Blockers:
- <item> or none
Risk notes:
- <item> or none
Rollback notes:
- <trigger + action> or n/a
Next actions:
1. <action>
2. <action>
```
