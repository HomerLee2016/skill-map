---
name: skill-map-ui-rules
description: Apply Skill Map UI/UX principles and rules when adding or changing any page, dialog or button (one blue primary per page, red only for destructive confirms, icon-only familiar actions, placement, spacing, colours, naming).
---

Read `docs/UI-UX-RULES.md` (principles in section 0) before changing UI.

Principles: one next action per screen; quiet by default; actions next to the thing they act on; icons for familiar things, words for new ones; same thing same look and name; safe choice easy, risky choice deliberate; phone is first-class; say why; less chrome.

Checklist:
- ONE primary button (`toolbar-btn toolbar-btn--primary` or `modal-btn-save`) per page/dialog; all others plain `toolbar-btn` / `modal-btn-cancel`.
- Red (`toolbar-btn--danger`) only on the final confirm of a destructive action; the opener is secondary.
- Edit/delete on items: icon-only `ContentActions`, right-aligned on the item's subtitle row, with title + aria-label.
- CSS variables only (no hard-coded colours except status). Sentence-case verb-first labels; consistent names (Remove vs Delete).
- Check desktop + phone and light + dark; show before/after screenshots in the Claude thread (never commit them to the repo).
- Update `docs/UI-UX.md` when a page, menu or modal changes.
