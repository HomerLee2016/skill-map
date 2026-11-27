# Skill Map — UI/UX guide

> Audience: Homer (and anyone changing the UI). A plain-language map of how the app looks and behaves, so UI/UX can be reviewed without reading code.
> Keep this file updated whenever a screen, menu, modal or mobile rule changes (see "Maintaining this doc" at the end).
> Last reviewed: 2026-11-24, with the lesson/test editing feature.

## 1. The big picture

- One page app, no URLs per screen. A **top bar** switches between five pages: **Roadmap, Lessons, Tests, Revision, Sharing hub** (plus **Admin** for admins only).
- All five pages stay mounted; the inactive ones are hidden (`.page-panel`). Switching is instant and keeps each page's state (selected lesson, open quiz).
- Everything the user does happens on the page itself or in a **modal** (centred pop-up) or a **dropdown menu** from the top bar.
- Dark theme is the default; a toggle switches to light.
- Layout is **desktop first, with one phone breakpoint at 768 px** (`src/mobile.css`, `src/contentEditor.css`).

## 2. Layout and navigation

```
┌ Top bar ─────────────────────────────────────────────────────────────┐
│ Skill Map  Roadmap Lessons Tests Revision Sharing   [workspace ▾] 👤 🌙 │
├───────────────┬──────────────────────────────────────────────────────┤
│ Sidebar       │ Page content                                         │
│ (tree/list)   │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

| Part | What it does | Code |
| --- | --- | --- |
| Top bar | Brand, page links, **workspace pill** (name + "Change Workspace"), **account icon**, dark-mode toggle | `components/TopBar.tsx` |
| Sidebar | Left panel on Roadmap, Lessons, Tests. Folder tree of items, Expand/Collapse all, add-folder and assign buttons | `components/Sidebar/` |
| Page content | Roadmap graph, lesson text, quiz, revision tables, sharing tables | `Roadmap.tsx`, `Lessons.tsx`, `Tests.tsx`, `Revision.tsx`, `Sharing.tsx` |
| Reconnect banner | Shown under the top bar when the browser lost folder permission; one click asks again | `components/FolderReconnectBanner.tsx` |

### Workspaces
A **workspace** is one course (for example Japanese, Spanish). It is a local folder, a cloud-only copy, or both. The **Change Workspace** menu lists them with:
- `📁` linked to a folder on this device, `☁` saved in the account
- a **red number bubble** = revision questions due now (shown for every workspace, folder or cloud-only)
- `⬇️` download as ZIP, `🗑️` remove
- actions: Browse from local, Import .zip (browsers without a folder picker), Duplicate, Merge

### Account menu (👤)
Signed-in email, "sync … ago", **Sync now**, an amber "N items changed in two places" link when a sync found a conflict, Auto sync toggle, Sign out. Signed out: Sign in with Google.

## 3. Pages

- **Roadmap**: React Flow skill graph. Nodes link to lessons and tests. A YAML panel edits the same roadmap both ways.
- **Lessons**: sidebar tree of lessons; the right side renders the lesson markdown (audio players inline). Above the lesson: icon buttons **✏ Edit** and **🗑 Delete** (tooltips, no text). Sidebar: **＋ Add lesson**.
- **Tests**: sidebar tree of tests; the right side runs one question at a time with a question tracker, instant right/wrong feedback, optional audio and auto-advance, a score screen and a review of wrong answers. Above the quiz: icon buttons **✏ Edit** and **🗑 Delete**. Sidebar: **＋ Add test**.
- **Revision**: five-star spaced repetition over answered questions, summary table, remove records, export/import.
- **Sharing hub**: publish a snapshot, browse and clone others' workspaces, vote/star, report.
- **Admin** (only for users in the database's `app_admins` table; hidden for everyone else): lists every Supabase script bundled with the build as Applied / Not run (checked against `migration_log` and the real tables), with one primary **Check again** button.

## 4. Editing lessons and tests (new)

### Add / edit lesson (`LessonEditorModal`)
1. **AI prompt guide** panel (open when adding). It holds the workspace's markdown guide, with **Copy guide** and **Edit guide**.
2. **Id (file name)**: filled from the title; cannot change later.
3. Tabs **Markdown | Preview**; paste the AI's markdown, check the preview.
4. **Add lesson / Save changes**.

### Add / edit test (`TestEditorModal`)
- Same guide panel and id field.
- Tabs **UI mode | YAML mode**. Adding starts in YAML mode (paste what the AI gave you); editing starts in UI mode. Switching converts between them; a YAML error blocks the switch and says why.
- **UI mode**: test title, then one card per question: a type picker (**Multiple choice** or **JLPT star**), a multi-line question box, answer rows with a radio button for the correct one (add/remove answers), optional explanation and audio link, move up/down and delete. A JLPT star card has the sentence (with `____ ★`) and four numbered choices; it is saved in the guide's format (choices written as `1:`–`4:` inside the question, options `"1"`–`"4"`).
- **YAML mode**: a plain monospace box.
- Problems show under the form in red (block saving) or amber (warnings). Saving is disabled until the errors are fixed.
- When rewording questions of an existing test, a checkbox keeps their stars and next review date.

### Delete
A small confirm dialog says what happens (roadmap links removed, revision history stays). Deleting also reaches the account and other devices.

### Conflicts
- Saving something another device changed is refused with a message, never merged silently.
- After Sync now, items changed on two devices open **Changed in two places** with "Use account version" / "Keep this device" per item.

## 5. Modals

All modals share `.modal-overlay` (dimmed backdrop) and `.modal-dialog` (rounded panel). Close with the Cancel button; editors also close with the ✕ or Esc.

| Modal | Size on desktop | On phone |
| --- | --- | --- |
| Editors (lesson, test) | centred, up to 920 px wide, scrolling body, fixed header and footer | **full screen** (100dvh), footer buttons full width |
| Confirm / conflict / workspace dialogs | about 460 px, centred | centred, buttons stacked, full width |

## 6. Mobile (≤ 768 px)

- Top bar collapses to `☰ Skill Map … workspace pill`. Page links, account list and the dark toggle live in the hamburger dropdown.
- The sidebar is a **drawer**: closed by default, opened with the `❯` tab at the left edge, closed again after picking an item. Content has extra left padding to clear that tab.
- Tap targets are at least 40–44 px; inputs inside editors use 16 px text so iOS does not zoom.
- Tables (Revision, Sharing) become stacked rows or scroll sideways.
- The Roadmap toolbar becomes a 2×2 grid under the progress bar.

## 7. Theming

- Colours are CSS variables on `:root` (light) and overridden under `.app-shell-dark` (dark) in `src/index.css`. New UI must use the variables (`--panel-bg`, `--panel-border`, `--lessons-text`, `--lessons-content-bg`, `--modal-*`, `--toolbar-btn-*`) and never hard-code colours, except status colours (red errors, amber warnings, green correct).
- Toggles use the `.toggle-track` switch component.

## 8. Reusable patterns

| Pattern | Class / component |
| --- | --- |
| Primary button (max one per page/dialog) | `.toolbar-btn.toolbar-btn--primary` (gradient) |
| Secondary button (default) | `.toolbar-btn` (neutral). Rules: `docs/UI-UX-RULES.md` |
| Danger confirm | `.toolbar-btn--danger` |
| Icon button | `.icon-btn` |
| Dialog buttons | `.modal-btn-cancel`, `.modal-btn-save`, `.ce-danger` for destructive |
| Text inputs | `.modal-input`, labels `.modal-label` |
| Dropdown menus | workspace and account menus close on outside click |
| Tabs in editors | `.ce-tabs` / `.ce-tab` |
| Inline notices | `.ce-notice` (amber, dismissible) above lesson/test content after a partly failed save |
| Popovers, tags, vote buttons | `components/sharing/` |

## 9. Behaviour rules worth remembering

- Anything the user changes is saved straight away (no global Save), except the roadmap YAML which has an explicit Save and an unsaved-changes prompt.
- Editing is only offered when it can be saved: signed in, or a folder workspace. Otherwise the buttons are disabled and a line explains why. The built-in demo workspace cannot be edited.
- Errors are shown next to the action that caused them, in plain words, with what was or was not changed.

## 10. Maintaining this doc

Update this file in the same PR whenever you add or change a page, menu, modal, mobile rule or shared component. Check desktop and phone and show the screenshots in the Claude thread; do not commit them to the repo.
