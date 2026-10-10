# Skill Map

Skill Map is a React + TypeScript learning workspace for building study roadmaps, browsing structured lessons, taking quizzes with audio support, and reviewing past questions with a five-stage spaced-repetition system.

The app is organized into four main views:

- **Roadmap** — visualize skill trees from YAML files, edit node details, auto-align layouts, and jump to lessons or tests from specific nodes.
- **Lessons** — browse lesson content from Markdown files arranged in a collapsible folder-based tree with audio support.
- **Tests** — run multiple-choice quizzes loaded from YAML test data, with randomized options, audio playback, auto-advance on correct answers, and a review flow for incorrect answers.
- **Revision** — review previously answered questions using a five-stage proficiency engine with Leitner-style spaced-repetition intervals.

## What the app includes

- A workspace-based learning experience where you can open a local folder and load your own lessons, tests, and roadmaps.
- An interactive roadmap editor powered by React Flow with node details, progress tracking, auto-align layout, and quick links into lessons, tests, or sub-tree roadmaps.
- A side-by-side YAML editor with live two-way synchronization between the visual graph and raw YAML.
- A lesson browser that loads Markdown content (with embedded HTML and audio) from your selected workspace.
- A test runner with structured folders, multiple-choice questions with randomized option ordering, answer tracking, and optional audio tracks.
- Audio auto-advance that waits for question audio to finish playing before moving to the next question.
- An "Enable Audio" toggle to turn question audio tracks on or off.
- A review-incorrect-answers flow at the end of a quiz or revision session.
- A question tracker bar showing numbered indicators colour-coded by status (correct, incorrect, unanswered, current) with a sliding-window view for long sessions.
- A five-stage spaced-repetition revision system with 22 sub-levels, proficiency badges, and configurable review intervals.
- A learnt summary table showing question ID, quiz title, prompt, correct answer, proficiency level, and next revision time in human-readable format.
- Per-workspace revision databases isolated by workspace, with automatic backup on completion and manual JSON import/export.
- A workspace dropdown with recent workspace history and pending due-revision badge counts.
- A collapsible sidebar that slides in and out with a toggle button.
- Dark mode and light mode toggle.
- An unsaved-changes guard that prompts confirmation before navigating away from an edited roadmap.
- A light-weight local-first setup that uses the browser File System Access API and IndexedDB persistence instead of a separate backend service.

## Getting started

### Prerequisites

- Node.js 18+ recommended
- npm
- A modern browser with support for the File System Access API

### Setup guide for non-technical users

You do not need to write code to get started. Follow these steps:

1. Install Node.js 18+ and VS Code on your computer.
2. Open this project folder in VS Code.
3. Open the built-in terminal in VS Code and run:

```bash
npm install
```

4. Start the app with:

```bash
npm run dev
```

5. When the terminal shows the local address, open it in your browser.
6. Click the workspace button in the top bar and choose a folder on your computer.
7. Inside that folder, create or edit subfolders named `lessons`, `tests`, and `roadmaps` and add your own Markdown and YAML files.
8. If you want to start from examples, the built-in demo content is available under `src/data/` and can be copied into your own workspace.

### Run the app locally

The development command starts the Vite frontend with built-in API middleware:

```bash
npm run dev
```

Then open:

- Frontend: http://localhost:5173

## Available scripts

- `npm run dev` — start the Vite development server with API middleware
- `npm run dev:custom` — start the Vite server on `127.0.0.1:4173`
- `npm run build` — type-check with `tsc` and build the production bundle (single-file output)
- `npm run preview` — preview the production build locally
- `npm run lint` — run Oxlint
- `npm run test` — discover and execute all `*.test.ts` / `*.test.tsx` test suites across `src/` and `regression/`

## Project structure

### Pages

- `src/App.tsx` — top-level page routing, navigation tabs, and cross-view deep linking
- `src/Roadmap.tsx` — roadmap editor and React Flow graph view with YAML sync
- `src/Lessons.tsx` — lesson browser and content tree
- `src/Tests.tsx` — quiz UI, folder organization, audio playback, and answer handling
- `src/Revision.tsx` — revision workflow, proficiency tracking, import/export, and backup

### Components

- `src/components/AnswerQuestion.tsx` — multiple-choice question renderer with randomized options, audio player, and auto-advance toggle
- `src/components/EditModal.tsx` — modal for editing roadmap node properties (title, description, URL, linked lessons/tests)
- `src/components/IncorrectReviewScreen.tsx` — review flow for questions answered incorrectly
- `src/components/ProgressBar.tsx` — HUD bar for roadmap completion percentage
- `src/components/QuestionTracker.tsx` — question index indicators with sliding-window pagination
- `src/components/SkillNode.tsx` — custom React Flow node with completion toggle, edit button, and navigation links
- `src/components/Toolbar.tsx` — floating canvas toolbar (Auto-Align, Show/Hide Details, Add Node, Tips)
- `src/components/TopBar.tsx` — header bar with tab navigation, workspace dropdown with revision badges, and dark mode toggle
- `src/components/workspaceTrigger.ts` — workspace menu action handler
- `src/components/Sidebar/` — collapsible sidebar shell, content tree sidebar, and roadmap sidebar

### Hooks

- `src/hooks/useAudioAutoAdvance.ts` — audio playback lifecycle and auto-advance timer
- `src/hooks/useAutoLayout.ts` — hierarchical auto-layout algorithm for roadmap nodes
- `src/hooks/useEdgeSelection.ts` — React Flow edge selection and deletion
- `src/hooks/useExpandCollapseState.ts` — tree expand/collapse toggle state
- `src/hooks/useGraphParser.ts` — YAML to React Flow nodes/edges parser
- `src/hooks/useResizePanel.ts` — drag-to-resize handler for the YAML editor panel
- `src/hooks/useYamlSync.ts` — React Flow graph to YAML serialization

### Services

- `src/services/workspace.ts` — loads lessons, tests, roadmaps, and structures from the workspace or static fallback files
- `src/services/workspaceRoadmapPersistence.ts` — writes roadmap YAML to the workspace directory
- `src/services/workspaceStructurePersistence.ts` — writes `structure.yaml` to the workspace directory

### Contexts

- `src/contexts/WorkspaceContext.tsx` — workspace selection, history, directory handle persistence, and revision badge counts

### Utilities

- `src/utils/audioProxy.ts` — rewrites Google Translate TTS URLs to the local audio proxy endpoint
- `src/utils/contentCatalog.ts` — catalog builders and picker option formatters for lessons and tests
- `src/utils/folderStructure.ts` — folder tree data structures, tree resolution, and item assignment
- `src/utils/lessonMarkdown.tsx` — React Markdown renderer with rehype-raw and custom audio handling
- `src/utils/revision.ts` — Dexie database, five-stage proficiency logic, spaced-repetition intervals, and JSON export/import
- `src/utils/testScoring.ts` — correct answer counting helper
- `src/utils/unsavedChanges.ts` — navigation guard for unsaved roadmap edits
- `src/utils/workspacePersistence.ts` — localStorage and IndexedDB helpers for workspace directory handles and history

### Other

- `src/data/` — built-in demo content for roadmaps, lessons, and tests
- `dev_helper_script/` — Jupyter notebooks for generating audio track URLs
- `regression/` — Playwright-based browser regression tests

## Dev server API endpoints

The Vite dev server includes middleware plugins that provide local API endpoints:

- `GET /api/audio-proxy?url=...` — proxies remote audio (e.g. Google Translate TTS) to bypass CORS

## Workspace content format

### Roadmaps

Roadmap data is stored in YAML files inside your workspace's `roadmaps/` folder. Each file can define a roadmap graph with nodes that include fields such as `id`, `label`, `description`, `children`, and optional metadata used by the UI.

### Lessons

Lessons are Markdown files inside your workspace's `lessons/` folder. They can be grouped with a `structure.yaml` file to define the lesson tree shown in the sidebar. Lessons support embedded HTML and `<audio>` elements for pronunciation audio.

### Tests

Tests are defined in YAML files inside your workspace's `tests/` folder. A `structure.yaml` file can be used to organize tests into folders for the test browser. Each question can include an optional `audio_track_url` field for pronunciation audio playback.

### Revision data

When you review questions, the app stores progress in a per-workspace Dexie/IndexedDB database. The five-stage proficiency system uses Leitner-style intervals:

| Stage | Review interval |
|-------|----------------|
| 1     | 8 hours        |
| 2     | 24 hours       |
| 3     | 48 hours       |
| 4     | 72 hours       |
| 5     | 168 hours (7 days) |

Correct answers advance proficiency within a stage (e.g. `1.1` → `1.2`). Incorrect answers downgrade to the beginning of the previous stage. The app can export revision data as JSON and automatically creates backup snapshots in the workspace's `revision/` folder upon completing a revision session.

## Tech stack

- React 19 + TypeScript
- Vite 8 with vite-plugin-singlefile for single-file builds
- React Flow for interactive roadmap graphs
- React Markdown + rehype-raw for lesson rendering with embedded HTML
- @uiw/react-textarea-code-editor for the YAML editor
- react-resizable-panels for split-pane layouts
- Dexie + IndexedDB for local persistence
- YAML for roadmap and test content parsing
- Oxlint for linting
- Playwright for browser regression tests
