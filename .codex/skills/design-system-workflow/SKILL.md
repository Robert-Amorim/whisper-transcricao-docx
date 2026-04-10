---
name: design-system-workflow
description: UI and design-system workflow for Voxora. Use when creating or updating pages, components, styles, design tokens, or visual references in apps/web and docs/design, and when you need consistent handoff from design artifacts to React/Tailwind implementation.
---

# Design System Workflow

## Overview

Apply a consistent workflow between design references and production UI. Keep visual language, component reuse, and responsive behavior predictable while allowing stronger visual direction where the product surface supports it.

## Workflow

1. Read design intent:
   - Source files in `docs/design` or explicit requirements from user.
   - Use `references/frontend-design.md` as the aesthetic companion reference for layout, typography, motion, and polish decisions.
   - Extract layout, spacing rhythm, hierarchy, and states.
2. Map to implementation:
   - Page composition in `apps/web/src/pages`.
   - Reusable sections/components in `apps/web/src/components`.
   - Shared styles/tokens in `apps/web/src/styles/globals.css` and Tailwind config.
3. Normalize design decisions:
   - Reuse existing tokens/classes before adding new ones.
   - Keep naming semantic (`primary`, `surface`, `muted`, `success`, etc.).
   - Preserve established product patterns on dashboard, auth, and workflow-heavy screens unless the user explicitly asks for a redesign.
   - Use bolder visual exploration mainly for new marketing surfaces, new standalone pages, or clearly net-new UI patterns.
4. Implement with responsive-first behavior:
   - Support mobile and desktop explicitly.
   - Preserve readability and action clarity in both breakpoints.
5. Validate:
   - Run `npm run typecheck --workspace @voxora/web`.
   - Run `npm run build --workspace @voxora/web`.
   - Verify key states (loading, empty, error, success).

## Visual Rules

- Define colors, spacing, and radii as reusable tokens.
- Avoid one-off inline styles unless there is a clear one-time need.
- Keep typography scale intentional across headings, body, and helper text.
- Keep interaction states visible (hover, focus, disabled, busy).
- Let `references/frontend-design.md` raise the craft level, but do not let it override established tokens, accessibility, or familiar workflow patterns without a clear product reason.

## Component Rules

- Split components when reuse is likely across pages.
- Keep component props explicit and typed.
- Prefer composition over variant explosion.
- Keep business logic out of presentational components.

## Handoff Rules

- If a design change introduces a new UI pattern, document it in `docs/design`.
- If implementation diverges from design artifact for usability/technical reasons, record the rationale in PR summary.
- Keep names aligned between design artifact and code component when practical.
- When `references/frontend-design.md` influenced the result, note whether it affected typography, composition, motion, or thematic direction.

## Output Contract

Always conclude with:

- `Design source`
- `Components/paths updated`
- `State coverage (loading/empty/error/success)`
- `Responsive validation (mobile/desktop)`
- `Intentional deviations`

## References

Load [references/frontend-design.md](references/frontend-design.md) when you need practical guidance for visual direction, polish, and distinctive frontend execution.
