---
name: design-system-workflow
description: UI and design-system workflow for Voxora. Use when creating or updating pages, components, styles, design tokens, or visual references in apps/web and docs/design, and when you need consistent handoff from design artifacts to React/Tailwind implementation.
---

# Design System Workflow

## Overview

Apply a consistent workflow between design references and production UI. Keep visual language, component reuse, and responsive behavior predictable.

## Workflow

1. Read design intent:
   - Source files in `docs/design` or explicit requirements from user.
   - Extract layout, spacing rhythm, hierarchy, and states.
2. Map to implementation:
   - Page composition in `apps/web/src/pages`.
   - Reusable sections/components in `apps/web/src/components`.
   - Shared styles/tokens in `apps/web/src/styles/globals.css` and Tailwind config.
3. Normalize design decisions:
   - Reuse existing tokens/classes before adding new ones.
   - Keep naming semantic (`primary`, `surface`, `muted`, `success`, etc.).
4. Implement with responsive-first behavior:
   - Support mobile and desktop explicitly.
   - Preserve readability and action clarity in both breakpoints.
5. Validate:
   - Run web build/typecheck.
   - Verify key states (loading, empty, error, success).

## Visual Rules

- Define colors, spacing, and radii as reusable tokens.
- Avoid one-off inline styles unless there is a clear one-time need.
- Keep typography scale intentional across headings, body, and helper text.
- Keep interaction states visible (hover, focus, disabled, busy).

## Component Rules

- Split components when reuse is likely across pages.
- Keep component props explicit and typed.
- Prefer composition over variant explosion.
- Keep business logic out of presentational components.

## Handoff Rules

- If a design change introduces a new UI pattern, document it in `docs/design`.
- If implementation diverges from design artifact for usability/technical reasons, record the rationale in PR summary.
- Keep names aligned between design artifact and code component when practical.

## Output Contract

Always conclude with:

- `Design source`
- `Components/paths updated`
- `State coverage (loading/empty/error/success)`
- `Responsive validation (mobile/desktop)`
- `Intentional deviations`

## References

Load [references/design-workflow.md](references/design-workflow.md) when you need practical checklists for pages, dashboards, and auth screens.
