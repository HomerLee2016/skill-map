# Skill Map

Skill Map is a React + TypeScript learning workspace for building study roadmaps, browsing structured lessons, taking quizzes, and reviewing past questions with a simple spaced-repetition flow.

The app is organized into four main views:

- Roadmap: visualize skill trees from YAML files, edit node details, and jump to lessons or tests from specific nodes.
- Lessons: browse lesson content from Markdown files arranged in a folder-based tree.
- Tests: run multiple-choice quizzes loaded from YAML test data and save results.
- Revision: review previously answered questions and revisit ones that are due for repetition.

## What the app includes

- A workspace-based learning experience where you can open a local folder and load your own lessons, tests, and roadmaps.
- An interactive roadmap editor powered by React Flow with node details, progress states, and quick links into lessons or tests.
- A lesson browser that loads Markdown content from your selected workspace.
- A test runner with structured folders, multiple-choice questions, and answer tracking.
- A revision page for spaced-repetition review, including import/export of revision data and automatic backup files.
- A light-weight local-first setup that uses browser file access and IndexedDB persistence instead of a separate backend service.

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

The development command starts the Vite frontend:

```bash
npm run dev
```

Then open:

- Frontend: http://localhost:5173

## Available scripts

- `npm run dev` - start the Vite development server
- `npm run dev:custom` - start the Vite server on `127.0.0.1:4173`
- `npm run build` - build the production bundle
- `npm run preview` - preview the production build locally
- `npm run lint` - run Oxlint
- `npm run test` - run the TypeScript test wrapper

## Project structure

- `src/App.tsx` - top-level page routing and navigation
- `src/Roadmap.tsx` - roadmap editor and graph view
- `src/Lessons.tsx` - lesson browser and content tree
- `src/Tests.tsx` - quiz UI, folder organization, and answer handling
- `src/Revision.tsx` - revision workflow, import/export, and backup support
- `src/contexts/WorkspaceContext.tsx` - workspace selection and loading logic
- `src/services/workspace.ts` - loading lessons, tests, and roadmaps from the selected workspace
- `src/data/` - built-in demo content for roadmaps, lessons, and tests
- `src/utils/` - helpers for parsing YAML, folder structures, revision state, and persistence

## Workspace content format

### Roadmaps

Roadmap data is stored in YAML files inside your workspace's `roadmaps/` folder. Each file can define a roadmap graph with nodes that include fields such as `id`, `label`, `description`, `children`, and optional metadata used by the UI.

### Lessons

Lessons are Markdown files inside your workspace's `lessons/` folder. They can be grouped with a `structure.yaml` file to define the lesson tree shown in the sidebar.

### Tests

Tests are defined in YAML files inside your workspace's `tests/` folder. A `structure.yaml` file can be used to organize tests into folders for the test browser.

### Revision data

When you review questions, the app stores progress in the browser and can export revision data as JSON. It can also create a backup copy inside a `revision/` folder in the selected workspace.

## Tech stack

- React 19 + TypeScript
- Vite 8
- React Flow for interactive graphs
- React Markdown for lesson rendering
- Dexie + IndexedDB for local persistence
- YAML for roadmap and test content parsing
