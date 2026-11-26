---
name: skill-map-ui-rules
description: Apply Skill Map UI/UX rules when adding or changing any page, dialog or button (one primary blue button per page, red only for destructive confirms, spacing, colours, naming).
---

Before changing UI, read `docs/UI-UX-RULES.md` and follow it. Key points:

- ONE primary button (`toolbar-btn toolbar-btn--primary` or `modal-btn-save`) per page/dialog. All other buttons are plain `toolbar-btn` / `modal-btn-cancel`.
- Red (`toolbar-btn--danger`) only on the final confirm of a destructive action.
- Use CSS variables, never hard-coded colours (except status colours).
- Sentence-case verb-first labels; consistent names (Remove vs Delete).
- Check desktop + phone and light + dark; add screenshots to the PR.
- Update `docs/UI-UX.md` when a page, menu or modal changes.
