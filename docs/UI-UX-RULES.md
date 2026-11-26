# Skill Map — UI/UX rules

Short rules so every page and dialog looks clean and consistent. Check them before adding or changing UI.

## 1. Buttons (most important rule)
- **One primary (blue) button per page or dialog** — the single action the user most likely wants next. Class: `toolbar-btn toolbar-btn--primary` (modals may use `modal-btn-save`).
- Everything else is **secondary**: plain `toolbar-btn` (neutral grey, bordered) or `modal-btn-cancel`.
- **Danger (red)** `toolbar-btn--danger` only on the final confirm of a destructive action. The button that *opens* that confirm is secondary.
- Dialog footer order: Cancel (secondary) on the left, confirm (primary/danger) on the right.
- Repeated buttons (table rows, list items) are secondary, never primary.
- Navigation-style buttons (sidebar action lists, canvas toolbars) are secondary. If the page header already has the primary for an action, do not duplicate it in blue.
- Disabled = 50% opacity, `not-allowed` cursor, and a tooltip or line saying why.

## 2. Spacing
- 4 / 8 / 12 / 16 / 24 px scale only. 8 px between buttons, 16 px inside cards, 24 px between sections.
- Phone: 16 px side gutter, tap targets at least 40 px.

## 3. Typography
- Page title 24 px bold, card title 18 px, body 14 px, helper text 12–13 px muted.
- Button labels: sentence case ("Start revision", not "Start Revision"), verb first, 1–3 words.

## 4. Colour
- Always CSS variables (`--panel-bg`, `--lessons-text`, `--toolbar-btn-bg`, ...). No hard-coded colours except status: red = error/destructive, amber = warning, green = correct/done.
- Blue means "do this next". Do not use it for decoration, tabs or links.
- Every screen must be checked in both light and dark.

## 5. Icons and emoji
- Optional, one per button at most, always before the label, never the only cue for a destructive action. Icon-only buttons need `aria-label` and a title.

## 6. Modals
- One purpose per modal, title says the action. Close with Cancel, ✕ or Esc. Never stack two modals.
- Editors full-screen on phone; confirm dialogs centred with full-width stacked buttons.
- Destructive confirm says exactly what is removed and what stays.

## 7. Empty, loading and error states
- Empty: one sentence on why it is empty + the next step (a single secondary or primary button).
- Loading: say what is loading; buttons show "Saving…" and disable.
- Errors: plain words next to the action that failed, and say what was or was not changed.

## 8. Naming and consistency
- Same thing, same name everywhere (Workspace, Lesson, Test, Revision, Roadmap). Do not mix "Remove", "Delete" and "Clear" for the same thing: **Remove** = take out of a list/device, **Delete** = permanent.
- Reuse existing components/classes (see UI-UX.md section 8) before inventing new ones.

## 9. Page checklist
1. How many blue buttons are visible? (must be ≤ 1 per page/dialog)
2. Is red used only for the final destructive confirm?
3. Light + dark, desktop + phone checked?
4. Labels sentence case, names consistent?
5. Empty and error states present?
