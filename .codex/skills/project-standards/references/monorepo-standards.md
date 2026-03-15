# Monorepo Standards Reference

## Scope Checklist

- Confirm target app/package before editing.
- Confirm if contract changes affect another workspace.
- Prefer single-responsibility edits by feature.

## API + Worker Contract Checklist

- Keep queue payloads typed and version-aware.
- Align API DTOs with `packages/shared` when reused by web/worker.
- Validate auth and permission assumptions on API changes.
- Keep provider-specific logic behind adapters in worker libs.

## Web Checklist

- Keep page-level composition in `src/pages`.
- Keep reusable UI in `src/components`.
- Keep API clients in `src/lib`.
- Avoid duplicating types already available in `packages/shared`.

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
   - Keep behavior parity.
   - Move code first, then adjust internals.

## Validation Commands

```powershell
npm run typecheck
npm run build
```

Targeted runs:

```powershell
npm run dev --workspace @voxora/web
npm run dev --workspace @voxora/api
npm run dev --workspace @voxora/worker
```
