---
name: project-standards
description: Monorepo engineering standards for Voxora. Use when implementing, refactoring, reviewing, or planning code in apps/api, apps/worker, apps/web, packages/shared, scripts, or root configs, and when you need consistent architecture boundaries, naming, testing, quality gates, and delivery rules.
---

# Project Standards

## Overview

Apply a single engineering standard for this repository. Keep code changes consistent across web, api, worker, and shared packages while minimizing regressions.

## Workflow

1. Identify scope:
   - `apps/web`: UI, routes, client state, API integration.
   - `apps/api`: HTTP contracts, auth, persistence, business rules.
   - `apps/worker`: queue processing, transcription jobs, provider integration.
   - `packages/shared`: shared types/contracts used by multiple apps.
2. Confirm contract impact:
   - If API payloads change, update both producer and consumer.
   - If shared types change, run typecheck for full workspace.
3. Implement smallest safe change:
   - Prefer localized changes over wide rewrites.
   - Reuse existing patterns in each app.
4. Validate with project commands:
   - `npm run typecheck`
   - `npm run build`
   - Run targeted app command when needed (`--workspace`).
5. Report result:
   - List files changed.
   - Explain behavior change and any remaining risk.

## Monorepo Rules

- Keep transport and domain concerns separated:
  - API routes should delegate business logic to service-level functions.
  - Worker orchestration should be isolated from provider-specific clients.
- Keep shared package dependency-light:
  - Put only contracts, utility types, and cross-app primitives in `packages/shared`.
  - Do not place app-specific logic in shared.
- Maintain backward compatibility where possible:
  - Prefer additive changes in request/response schemas.
  - If breaking changes are required, update all affected consumers in same PR.

## Coding Rules

- Use TypeScript strictness already configured in each project.
- Prefer explicit types at module boundaries (API handlers, queue payloads, shared contracts).
- Avoid hidden side effects in helper functions.
- Keep function names task-oriented and domain-specific.
- Keep files cohesive; split only when size or coupling makes navigation harder.

## Validation Rules

- Mandatory before handoff:
  - `npm run typecheck`
  - `npm run build`
- Run `npm run lint` when available in touched workspace.
- For API/worker behavior changes, include at least one execution proof:
  - command output summary,
  - seed/mock run result,
  - or reproducible manual scenario.

## Pull Request Rules

- Describe user-visible behavior change first.
- Include compatibility notes when contracts changed.
- List follow-up tasks explicitly if any were deferred.

## Output Contract

Always conclude with:

- `Scope touched`
- `Contract impact`
- `Checks executed`
- `Changed files`
- `Residual risks`

## References

Load [references/monorepo-standards.md](references/monorepo-standards.md) for checklists and ready-to-use implementation patterns.
