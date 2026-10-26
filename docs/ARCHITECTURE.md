# Skill Map — Architecture

> Audience: developers and AI assistants. Read this before changing code.
> Last reviewed: 2026-10-10 against the code on branch `main`.

## 1. What the app is

Skill Map is a **client-side-only React + TypeScript web app** for language and skill learning. It has no backend in production. Everything runs in the browser.

Four views:

| View | File | Purpose |
|------|------|---------|
| Roadmap | `src/Roadmap.tsx` | Skill tree (React Flow) with YAML two-way sync, node completion, links to lessons/tests |
| Lessons | `src/Lessons.tsx` | Markdown lessons (+ embedded HTML/`<audio>`) in a folder tree |
| Tests | `src/Tests.tsx` | Multiple-choice quizzes from YAML, shuffled options, audio, review of wrong answers |
| Revision | `src/Revision.tsx` | Five-stage spaced repetition over previously answered questions |

Guiding principle: the app is a **language-learning helper, not a teacher**. Content is authored (often with AI) as plain files; the app just organises, quizzes and schedules review.

## 2. Tech stack

- React 19, TypeScript, Vite 8
- `vite-plugin-singlefile` (production build is a single HTML file)
- React Flow (`reactflow`) for the roadmap graph
- `react-markdown` + `rehype-raw` for lessons
- `@uiw/react-textarea-code-editor` for YAML editing
- `react-resizable-panels` for split panes
- Dexie (IndexedDB) for revision data
- `yaml` for parsing/serialising roadmaps, tests, structure files
- Oxlint, Playwright (regression), tsx-based unit test runner (`test-wrapper.ts`)

## 3. Repository layout

```
src/
  main.tsx                 React entry
  App.tsx                  Page switching, dark mode, unsaved-roadmap guard, deep links
  Roadmap.tsx / Lessons.tsx / Tests.tsx / Revision.tsx   The four pages
  components/              UI pieces (TopBar, AnswerQuestion, QuestionTracker, SkillNode, Sidebar/…)
    roadmap/               RoadmapCanvas (React Flow wrapper), YamlEditorPanel
    revision/              LearntSummary, RevisionSessionView, RevisionDataButtons
  hooks/                   Graph parse/serialise, graph edits, node editor, auto-layout, audio auto-advance, YAML sync, panel resize, revision data/session, workspace history
  contexts/
    WorkspaceContext.tsx   Selected folder handle and loaded content (history lives in hooks/useWorkspaceHistory.ts)
  services/                Anything touching storage or content loading
    workspace.ts           loadWorkspaceContent: workspace folder, else bundled data
    workspaceBundled.ts    Bundled demo content (import.meta.glob)
    workspaceFolder.ts     Reads lessons/tests/roadmaps/structure from a folder handle
    workspaceParsing.ts    Pure parsers shared by both loaders
    workspaceHandleStore.ts  IndexedDB storage of the folder handle
    workspaceRoadmapPersistence.ts    Writes roadmap YAML into the workspace folder
    workspaceStructurePersistence.ts  Writes structure.yaml into the workspace folder
  utils/                   Pure-ish logic + browser helpers
    proficiency.ts         Pure Leitner levels, intervals, next review time (no storage)
    incorrectReview.ts     Pure builder for the incorrect-answer review list
    testScoring.ts         Counting correct answers
    folderStructure.ts     Folder tree model for lessons/tests
    contentCatalog.ts      Catalog builders for pickers
    lessonMarkdown.tsx     Markdown renderer
    audioProxy.ts          Rewrites Google Translate TTS URLs to /api/audio-proxy
    workspacePersistence.ts  localStorage selection/history and pure history helpers
    revisionSession.ts     Pure helpers for the revision page (stars, due questions, row upsert)
    roadmapYaml.ts         Pure roadmap completeness and label from YAML
    unsavedChanges.ts      Navigation guard rules
  data/                    Bundled demo content (roadmaps/, lessons/, tests/) — loaded with import.meta.glob
  worker.ts                Cloudflare Worker: /api/audio-proxy with host allowlist
  services/revisionDb.ts   Dexie schema, workspace storage keys, insert/query/export/import
vite.config.ts             Vite config (composes plugins)
vite/plugins/audioProxy.ts Dev/preview audio proxy middleware
wrangler.jsonc             Cloudflare Worker config (dist assets + src/worker.ts)
regression/                Playwright browser tests
dev_helper_script/         Jupyter notebooks for generating/validating content (audio URLs, YAML checks)
AI_content_generator_full_prompt_guide.md   Prompt + schema for AI-generated roadmaps, lessons, tests
```

## 4. Runtime architecture (today)

```mermaid
flowchart LR
  subgraph Browser["Browser (only runtime)"]
    UI["React pages<br/>Roadmap · Lessons · Tests · Revision"]
    WS["WorkspaceContext<br/>(folder handle, history, badges)"]
    SVC["services/*<br/>content loading + writes"]
    BUNDLE["Bundled content<br/>src/data/* via import.meta.glob"]
    IDB[("IndexedDB<br/>Dexie: revision DB per workspace")]
    LS[("localStorage<br/>workspace selection & history")]
  end
  FOLDER[("User's local folder<br/>lessons/ tests/ roadmaps/ revision/")]
  GT["translate.google.com/translate_tts<br/>(audio URLs inside lessons/tests)"]

  UI --> WS --> SVC
  SVC -- "File System Access API<br/>(Chromium only)" --> FOLDER
  SVC -- "fallback when no folder" --> BUNDLE
  UI --> IDB
  WS --> LS
  WS --> IDB
  UI -- "<audio src>" --> GT
```

### 4.1 Content loading

`src/services/workspace.ts` → `loadWorkspaceContent(handle?)` (folder reads in `workspaceFolder.ts`, bundled data in `workspaceBundled.ts`):

1. If a workspace folder handle exists, read `lessons/`, `tests/`, `roadmaps/`, plus `structure.yaml` files from it.
2. Otherwise (or on failure) use the bundled defaults from `src/data/`, which are compiled into the build via `import.meta.glob(..., { query: '?raw', eager: true })`.

Formats:

- **Lesson**: `lessons/<id>.md`. Title = first `# heading`. Tree defined by `lessons/structure.yaml`.
- **Test**: `tests/<id>.yaml` with `quiz_title` and `questions[]` (`question_number`, `question`, `options`, `correct_answer`, optional `explanation`, `audio_track_url`). Folders via `tests/structure.yaml`.
- **Roadmap**: `roadmaps/<id>.yaml`, a list of nodes (`id`, `label`, `x`, `y`, `finished`, `description`, `dependsOn`, `lessons`, `tests`, `url`, `children`). Parsed by `useGraphParser`, serialised back by `useYamlSync`.

### 4.2 Writing back

`workspaceRoadmapPersistence.ts` and `workspaceStructurePersistence.ts` write directly into the chosen folder through the File System Access API (`getDirectoryHandle` / `getFileHandle` / `createWritable`). There is no server call.

### 4.3 Revision (spaced repetition)

- Stored in **Dexie** (`services/revisionDb.ts`; scheduling rules in `utils/proficiency.ts`), one IndexedDB database per workspace. Rows are `CompletedQuestionRecord` (`question_name`, `options`, `correct_answer`, `selected_answer`, `correct`, `last_time`, `next_revision_time`, `proficiency`, `quiz_title`, `audio_track_url`, `hash`).
- Proficiency levels `1.1 … 5.3` (22 sub-levels). Stage intervals: 8h, 24h, 48h, 72h, 168h.
- Correct answer advances within a stage; wrong answer drops back to the start of the previous stage.
- Completing a revision session writes a snapshot into the workspace's `revision/` folder. Manual JSON export/import is also available.

**Key limitation:** IndexedDB lives in one browser profile on one device. Progress made on a PC is invisible on a phone. This is the central problem for mobile use (see the ideas document in §10).

### 4.4 Workspace persistence

`utils/workspacePersistence.ts` (localStorage) and `services/workspaceHandleStore.ts` (IndexedDB):

- `localStorage` keys `skill-map.workspace-selection` and `skill-map.workspace-history` hold name and path.
- A separate IndexedDB database `skill-map-workspace-db` stores the `FileSystemDirectoryHandle` objects, because handles can be stored in IndexedDB but not in localStorage.
- Browsers may require the user to re-grant permission on each visit. The UI has to handle that.

### 4.5 Audio

- Lessons and tests reference audio as Google Translate TTS URLs (`translate.google.com/translate_tts?...`).
- `utils/audioProxy.ts` rewrites those URLs to `/api/audio-proxy?url=…`. In dev and preview the route is served by the Vite plugin (`vite.config.ts`); in production by the Cloudflare Worker (`src/worker.ts`, §6).
- `hooks/useAudioAutoAdvance.ts` waits for the audio to finish before advancing a quiz question.

## 5. Build and run

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server on `:5173`, with middleware plugins (see §6) |
| `npm run build` | `tsc -b` then `vite build` → single-file HTML in `dist/` |
| `npm run preview` | Serves the build with the same middleware |
| `npm run lint` | Oxlint |
| `npm test` | Runs `*.test.ts(x)` in `src/` and `regression/` via `test-wrapper.ts` |

## 6. Server routes

The static build has no server, so the one API route has two implementations with the same behaviour (400 on missing `url`, upstream status on failure, content-type passthrough, `Cache-Control: public, max-age=3600`):

- Dev and preview: Vite middleware in `vite/plugins/audioProxy.ts`.
- Production: Cloudflare Worker in `src/worker.ts`. It only forwards GET requests to `https://translate.google.com/translate_tts` (anything else gets 403, non-GET gets 405), so it is not an open proxy.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/audio-proxy` | GET | Proxies Google Translate TTS audio to avoid CORS on `fetch` |


## 7. Hosting and deployment

Hosted on Cloudflare Workers (free plan, 100k requests/day) from the same project: `wrangler.jsonc` serves `dist/` as static assets and runs `src/worker.ts` for `/api/*` only.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`, run by Cloudflare on every push to `main`.
- Local check: `npm run build && npx wrangler dev`.

The static bundle needs no server. The Worker exists only for the audio proxy; the Google TTS endpoint is unofficial (§9), so audio may break independently of the app.

## 8. Platform constraints (important for mobile)

| Capability | Used for | Desktop Chrome/Edge | Firefox / Safari | Phone browsers |
|-----------|----------|---------------------|------------------|----------------|
| File System Access (`showDirectoryPicker`) | Reading/writing a user folder | Yes | No | Generally no (verify on your device) |
| IndexedDB | Revision DB, folder handles | Yes | Yes | Yes |
| Service Worker | Offline app shell (PWA) | Yes | Yes (limited) | Yes |
| Origin Private File System (OPFS) | Browser-private file storage | Yes | Yes (recent) | Yes |
| Web Speech API (`speechSynthesis`) | Offline TTS | Yes | Yes | Yes (voices vary) |

Consequence: on a phone, the app cannot open a folder the way the desktop does. Mobile needs another content source (see §10).

## 9. Known issues and cleanup candidates

Resolved by the cleanup story (#3): empty `server.ts`, unwired `save-question-result.ts`, the unused `drizzle.config.ts` and `db/schema.ts`, the three duplicate DB re-export modules, the legacy `/api/save-*` routes, and the unused exports.

Still open:

1. Audio depends on an unofficial Google Translate endpoint. That is fragile, and its terms of use do not clearly allow redistribution in a public open-source project.
2. Cloud sync (signed in) is keyed by Supabase `user_id` and workspace: a `workspaces` table (user_id, key, name) is referenced by the revision records, lessons, tests, roadmaps and folder structures tables (`supabase/README.md`). Large binary files (audio, images) are not stored; if they are ever needed, use Supabase Storage with a `<user_id>/` path policy.
3. `README.md` says the app is "local-first with no separate backend service". That is still true, and this doc is the more detailed reference.

## 10. Target architecture (goal: web app for PC and mobile, zero cost, open source)

### 10.1 Goals

- One codebase, one URL, installable on phones (PWA), usable offline for revision.
- Zero recurring cost: static hosting only, no server.
- Progress that follows the user across devices.
- Content can be shared as plain files (packs), not only as code.
- Desktop keeps the folder workflow. Mobile gets a simpler workflow with the same data.

### 10.2 Layered design

```
┌───────────────────────────────────────────────────────────┐
│ UI (responsive React)                                     │
│  Desktop: roadmap graph + YAML editor                     │
│  Mobile:  roadmap as tree/list, lesson reader, quiz,      │
│           revision (large touch targets)                  │
├───────────────────────────────────────────────────────────┤
│ Core (pure TypeScript, no DOM, no storage)                │
│  schemas (zod or hand-written validators)                 │
│  parsers/serialisers: roadmap, lesson, test, structure    │
│  scoring, proficiency engine, next-review time            │
│  progress events → derived state                          │
├───────────────────────────────────────────────────────────┤
│ Content source adapters  (same interface)                 │
│  FolderSource   File System Access (desktop Chromium)     │
│  ZipSource      import/export a .zip pack (any device)    │
│  OpfsSource     browser-private copy for offline (PWA)    │
│  BundledSource  src/data/ demo content                    │
│  UrlSource      packs from a GitHub repo or raw URL       │
├───────────────────────────────────────────────────────────┤
│ Progress sync adapters                                    │
│  Local IndexedDB  (always on, fast, offline)              │
│  Export/import    progress-*.json (manual, always works)  │
│  Google Drive     one JSON file in the user's Drive,      │
│                   client-side only (Google Identity +     │
│                   Drive API), no server needed            │
├───────────────────────────────────────────────────────────┤
│ Platform                                                  │
│  Service worker (offline shell, cache content + audio)    │
│  Web Speech API fallback for audio                        │
└───────────────────────────────────────────────────────────┘
```

Rules that keep this manageable:

- UI components never call `FileSystemDirectoryHandle` or Dexie directly. They call a `ContentSource` or `ProgressStore` interface.
- Core logic has no imports from React, Dexie or the File System Access API. That makes it testable with `npm test` and reusable.
- Progress is stored as **append-only events** (e.g. `{ questionHash, at, correct, deviceId }`) instead of mutable rows. Merging two devices is then a union of events, which avoids most conflicts. Proficiency is recomputed from events.

### 10.3 Data model for progress (proposed)

```jsonc
// progress-<userId>.json  (one file, stored in Drive or exported by hand)
{
  "version": 1,
  "events": [
    { "id": "d1-000123", "deviceId": "pc-homer", "at": "2026-10-10T08:00:00Z",
      "questionHash": "a3f9…", "pack": "spanish-travel", "correct": true }
  ]
}
```

Dedupe by `id`. Recompute proficiency per question from its events in time order. This is the same Leitner logic as today, just derived from history.

### 10.4 Mobile without a folder

Three options, in order of effort:

1. **Zip pack import/export.** Desktop exports a `.zip` (lessons, tests, roadmaps, progress). Phone imports it. Works everywhere. Lowest risk.
2. **OPFS workspace.** The phone keeps its own copy of the pack in the browser's private storage, and the PWA caches it for offline use.
3. **Drive sync.** Both devices read and write the same `progress-*.json` in Google Drive via the client-side Drive API. Free for personal use. Needs a Google OAuth client ID but no backend.

### 10.5 Responsive UI

- Keep the same routes. Use CSS breakpoints and a `useMediaQuery` hook.
- On narrow screens:
  - Roadmap: render as an indented list (the data is already a tree), not a draggable graph. Editing stays desktop-only.
  - Tests and Revision: single column, large answer buttons, audio controls at the bottom.
  - Lessons: reader mode with a collapsible table of contents.
- Use `100dvh` and safe-area insets. Avoid hover-only interactions.

### 10.6 Offline and PWA

- Add `vite-plugin-pwa` (Workbox). It generates a manifest and a service worker.
- Precache the app shell and bundled content.
- For audio: either cache the MP3s the first time they play (Cache API), or generate them once with an offline TTS tool and ship them with the pack. Do not rely on the Google endpoint for offline use.

### 10.7 Hosting at zero cost

| Option | Cost | Notes |
|--------|------|-------|
| GitHub Pages | Free for public repos | Deploy from GitHub Actions on push to `main`. Simplest fit. |
| Cloudflare Pages | Free tier | Good performance, preview deploys per branch |
| Netlify / Vercel | Free tier | Fine, but limits can change |

All three serve static files. No server, no database, no monthly cost. Use "static-only" as a hard rule in the codebase: any feature that needs a backend goes behind an optional adapter, never a requirement.

### 10.8 Sharing content (open-source knowledge packs)

- A **pack** is a folder or zip with `pack.yaml` (title, language, author, licence), `roadmaps/`, `lessons/`, `tests/`, and optional `audio/`.
- Packs live in public Git repos. Anyone can fork, edit and submit a pull request.
- A registry is a JSON index file in a Git repo, for example `registry.json` listing pack URLs. The app fetches it and offers "Install pack". No database.
- Import by URL: `?pack=<raw-url>` loads a pack from GitHub raw.
- Add a `licence` field to every pack. Content generated with AI should say so and give the prompt version used.
- Schema validation runs in CI (GitHub Actions, free for public repos) using the same validators as the app core.

### 10.9 Suggested migration order

1. Extract `core/` (validators, scoring, proficiency) from `utils/` and `services/`. Add tests. No behaviour change.
2. Introduce `ContentSource` and `ProgressStore` interfaces. Wrap the current folder and Dexie code behind them.
3. Replace the Dexie row model with the event log (§10.3) and write a migration from existing `revision` data.
4. Add zip import/export and the responsive layouts (§10.4, §10.5).
5. Add the PWA layer and cache audio (§10.6).
6. Add Drive sync as an optional adapter (§10.4 option 3).
7. Deploy the static build to GitHub Pages (§10.7) and document the pack format for contributors.
8. Remove the dead code listed in §9.

## 11. Conventions for contributors and AI assistants

- Content first: lessons and tests are plain Markdown/YAML. Do not hardcode learning content in TypeScript.
- Keep the app static. Do not add a backend dependency without a fallback that works without it.
- Do not add a feature that writes outside the workspace folder or the app's own storage.
- New storage code goes behind an adapter interface (§10.2), not inside a page component.
- When changing the content format, update `AI_content_generator_full_prompt_guide.md` and `README.md` in the same change.
- Run `npm run lint` and `npm test` before committing.
