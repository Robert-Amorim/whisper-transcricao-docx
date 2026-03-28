# Monorepo Standards Reference

## Scope Checklist

- Confirm target workspace before editing (`apps/web`, `apps/api`, `apps/worker`, `packages/shared`).
- Confirm whether changed files affect runtime contract, not only types.
- Prefer single-responsibility edits by feature.
- Keep unrelated refactors out of the same change.

## Contract Impact Matrix

- API response/request change:
  - Update API producer.
  - Update web consumer.
  - Update worker consumer when applicable.
- Shared type change (`packages/shared`):
  - Confirm compile in all workspaces.
  - Keep additive changes when possible.
- Queue payload change:
  - Keep backward compatibility or ship producer and consumer together.

## Local Prerequisites

- Node >= 22.
- Dependencies installed with `npm install` at repository root.
- Database reachable (local or tunnel) and schema up to date.
- Redis reachable for worker execution (`REDIS_HOST`/`REDIS_PORT`).

## Safe Change Patterns

1. Additive schema change:
   - Add optional field in shared type.
   - Support field in API producer.
   - Consume field in web with fallback.
2. Worker provider update:
   - Extend provider adapter.
   - Keep queue contract stable.
   - Add timeout/retry guardrails.
3. Refactor:
   - Preserve behavior first.
   - Move code first, then optimize internals.

## Validation Commands

Baseline:

```powershell
npm run typecheck
npm run build
```

Targeted:

```powershell
npm run dev --workspace @voxora/web
npm run dev --workspace @voxora/api
npm run dev --workspace @voxora/worker
```

Release-ready check:

```powershell
npm run gate:pr
```

## Evidence Template (handoff)

Use this structure in final delivery summary:

```text
Scope touched:
- <workspace/files>
Contract impact:
- <none | details>
Checks executed:
- <command>: <result>
Changed behavior:
- <what changed>
Residual risks:
- <none | details>
```
