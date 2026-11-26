# Skill Map — UI/UX rules

Short rules so every page and dialog looks clean and consistent. Check them before adding or changing UI.

## 0. Principles (the "why" behind the rules)
1. **One thing per screen to do next.** Show a single blue action; everything else steps back. If everything is highlighted, nothing is.
2. **Quiet by default.** Neutral grey for most controls, colour only where it carries meaning (blue = next step, red = destructive, amber = warning, green = correct).
3. **Put actions next to what they act on.** Edit/delete live on the title/subtitle row of the item, right-aligned, not in a separate toolbar row above it.
4. **Familiar things get icons, new things get words.** Pencil and bin are icon-only (with tooltip + aria-label); anything the user has not seen before keeps a text label.
5. **Same thing, same look, same name** on every page, both themes and both screen sizes. Reuse components before inventing styles.
6. **Make the safe choice easy, the risky choice deliberate.** Destructive actions need a confirm that says what is lost and what stays; cancel is always the calmer button.
7. **Phone is not an afterthought.** Same hierarchy, bigger tap targets (44 px), full-width stacked dialog buttons.
8. **Say why.** Disabled controls, empty lists and errors explain the reason and the next step in plain words.
9. **Less chrome.** Remove a button, label or divider before adding one. Do not repeat an action in two places in the same colour.

## 1. Buttons (most important rule)
- **One primary (blue) button per page or dialog** — the single action the user most likely wants next. Class: `toolbar-btn toolbar-btn--primary` (modals may use `modal-btn-save`).
- Everything else is **secondary**: plain `toolbar-btn` (neutral grey, bordered) or `modal-btn-cancel`.
- **Danger (red)** `toolbar-btn--danger` only on the final confirm of a destructive action. The button that *opens* that confirm is secondary.
- Dialog footer order: Cancel (secondary) on the left, confirm (primary/danger) on the right.
- Repeated buttons (table rows, list items) are secondary, never primary.
- Navigation-style buttons (sidebar action lists, canvas toolbars) are secondary. If the page header already has the primary for an action, do not duplicate it in blue.
- Actions belong on the same row as the item they act on, right-aligned (e.g. edit/delete icons beside the test subtitle).
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
- Prefer one consistent inline SVG set (stroke 2, 16 px, `currentColor`) over emoji for actions; emoji only in decorative labels already in use.
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

## 10. Icon-only buttons
- Use icon-only (`icon-btn`) for repeated, well-known row/header actions such as edit and delete (`ContentActions`). Always add `title` + `aria-label`; delete icon is red-tinted but opens a confirm. Text buttons for anything unfamiliar or primary.
