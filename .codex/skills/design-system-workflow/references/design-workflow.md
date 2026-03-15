# Design Workflow Reference

## Page Delivery Checklist

- Confirm page goal and primary CTA.
- Define required states: loading, empty, error, success.
- Ensure keyboard navigation and visible focus.
- Ensure readable hierarchy on mobile and desktop.

## Component Checklist

- Use semantic component names by domain (`DashboardTopbar`, `JobsTable`, etc.).
- Keep variant API minimal and explicit.
- Isolate formatting helpers from rendering logic.
- Reuse common states/components when possible.

## Tokens and Styling Checklist

- Reuse existing Tailwind utilities and global classes first.
- Introduce new tokens only when repeated usage is expected.
- Keep spacing scale consistent within the same screen section.
- Keep contrast and state color semantics consistent.

## Layout Patterns for This Repo

- Marketing/Landing sections:
  - Keep sectionized structure in `src/components/landing`.
  - Keep narrative flow: hero -> proof -> process -> pricing -> CTA/footer.
- Dashboard:
  - Keep navigation/status context always visible.
  - Keep dense data in table/panel format with clear labels.
- Auth/Login:
  - Keep minimal distractions and clear status feedback.

## Handoff Template (Design to Code)

When implementing from `docs/design`:

1. Artifact used:
   - file(s) and date.
2. Components created/updated:
   - list component names and paths.
3. Intentional deviations:
   - what changed and why.
4. Validation:
   - desktop + mobile check completed.
