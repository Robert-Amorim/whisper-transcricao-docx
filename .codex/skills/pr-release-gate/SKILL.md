---
name: pr-release-gate
description: Quality gate for pull requests and releases in Voxora. Use before merge, before deploy, when validating risky refactors, schema changes, auth changes, queue/worker behavior changes, or any delivery that needs explicit pass/fail criteria and rollback awareness.
---

# Pr Release Gate

## Overview

Execute a deterministic quality gate before merge and release. Produce a clear pass/fail decision with blockers, risk notes, and next actions.

## Workflow

1. Classify change impact:
   - `low`: docs/text/refactor without behavior change.
   - `medium`: feature change with bounded surface.
   - `high`: auth, persistence schema, queue contract, external provider, or cross-workspace contracts.
2. Run baseline checks:
   - `npm run typecheck`
   - `npm run build`
   - `npm run lint` (if available for touched workspaces)
3. Run change-specific checks:
   - API contract change: verify consumer compatibility (`apps/web` and/or worker).
   - Prisma/schema change: verify migration strategy and startup impact.
   - Worker/provider change: verify timeouts, retries, and failure handling.
   - UI change: verify responsive behavior and state coverage (loading/empty/error/success).
4. Decide gate outcome:
   - `pass`: no blockers.
   - `pass-with-risk`: merge/release allowed with explicit known risk and mitigation.
   - `fail`: one or more blockers that must be resolved first.
5. Emit gate report:
   - scope,
   - checks run and results,
   - blockers/risk,
   - rollback notes when release is involved.

## Blocking Rules

- Fail immediately if typecheck or build fails.
- Fail if any cross-workspace contract changed without coordinated updates.
- Fail if migration is required but not included/documented.
- Fail if high-impact change has no rollback path.

## Release Rules

- Confirm environment variables required by affected apps are available.
- Confirm deployment order when multiple services changed:
  - shared/build artifacts first,
  - API/worker before web when contracts are backend-driven.
- Record rollback trigger and rollback action before deploy.

## Output Format

Always conclude with:

- `Gate`: pass | pass-with-risk | fail
- `Blockers`: explicit list (or `none`)
- `Risk notes`: explicit list (or `none`)
- `Rollback notes`: explicit list (or `none`)
- `Next actions`: ordered and actionable

## References

Load [references/pr-release-checklist.md](references/pr-release-checklist.md) for step-by-step command-level checklists.
