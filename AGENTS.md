# AGENTS.md

## Skills
A skill is a local instruction set stored in `SKILL.md`.

### Available skills
- `project-standards`: Use when implementing or reviewing code in this monorepo and you need consistent architecture, coding, testing, and delivery conventions. (file: `.codex/skills/project-standards/SKILL.md`)
- `design-system-workflow`: Use when creating or changing UI, pages, components, or visual standards in `apps/web` and `docs/design`. (file: `.codex/skills/design-system-workflow/SKILL.md`)
- `pr-release-gate`: Use before merge and before release/deploy to run a deterministic quality gate with pass/fail criteria, blockers, and rollback notes. (file: `.codex/skills/pr-release-gate/SKILL.md`)

### How to use skills
- Trigger rules:
  - If the user names a skill (with `$skill-name` or plain text), use it.
  - If the task clearly matches a skill description, use it.
- Progressive disclosure:
  - Read `SKILL.md` first.
  - Read only the specific `references/` file needed for the current task.
  - Use bundled scripts/assets when they exist.
- Coordination:
  - Prefer the minimal set of skills for the request.
  - If coding and UI are both relevant, use this order: `project-standards` then `design-system-workflow`.
  - If the task is merge/release readiness, apply `pr-release-gate` after implementation skills.
- Fallback:
  - If a skill is missing or blocked, state the issue briefly and continue with best effort.

### Coordination matrix
- Backend/shared work (`apps/api`, `apps/worker`, `packages/shared`):
  - Apply `project-standards`.
- Frontend work (`apps/web`, `docs/design`):
  - Apply `project-standards` and `design-system-workflow` (in this order).
- Merge/release/deploy work:
  - Apply `pr-release-gate` after implementation skills.

### Required output contract by skill
- `project-standards` must end with:
  - scope touched,
  - contract impact (if any),
  - checks executed and outcomes,
  - changed files,
  - residual risks.
- `design-system-workflow` must end with:
  - design source used (`docs/design` or explicit requirement),
  - mapping from design intent to components/paths,
  - responsive and state coverage evidence,
  - intentional visual deviations (if any).
- `pr-release-gate` must end with:
  - `Gate: pass | pass-with-risk | fail`,
  - `Blockers`,
  - `Risk notes`,
  - `Rollback notes`,
  - `Next actions`.

### Quality floor
- For code changes, minimum required checks:
  - `npm run typecheck`
  - `npm run build`
- For merge/deploy readiness:
  - `npm run gate:pr`

### Project default
- For backend/shared changes (`apps/api`, `apps/worker`, `packages/shared`), default to `project-standards`.
- For frontend/design changes (`apps/web`, `docs/design`), use both skills unless the task is purely visual.
- Before merge or deploy, always apply `pr-release-gate`.
