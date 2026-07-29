# Skill Map

Skill Map is a React + TypeScript learning workspace for building study roadmaps, browsing structured lessons, taking quizzes, and reviewing past questions with a simple spaced-repetition flow.

The app is organized into four main views:

- Roadmap: visualize skill trees from YAML files, edit node details, and jump to lessons or tests from specific nodes.
- Lessons: browse lesson content from Markdown files arranged in a folder-based tree.
- Tests: run multiple-choice quizzes loaded from YAML test data and save results.
- Revision: review previously answered questions and revisit ones that are due for repetition.

## What the app includes

- Interactive roadmap graph powered by React Flow
- YAML editor for roadmap content with live parsing and error feedback
- Progress tracking for roadmap completion
- Folder-based lesson organization with Markdown content
- Quiz-taking experience for test collections
- Revision mode with persisted question history and proficiency-based review
- Local API server for saving quiz and revision data

## Getting started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install dependencies

```bash
npm install
```

### Run the app locally

The development command starts both the Vite frontend and the local API server:

```bash
npm run dev
```

Then open:

- Frontend: http://localhost:5173
- API server: http://localhost:5178

## Available scripts

- `npm run dev` - start the frontend and API server together
- `npm run build` - build the production bundle
- `npm run preview` - preview the production build locally
- `npm run lint` - run Oxlint
- `npm run api` - start the Express API server only

## Project structure

- `src/App.tsx` - top-level page routing and navigation
- `src/Roadmap.tsx` - roadmap editor and graph view
- `src/Lessons.tsx` - lesson browser and content tree
- `src/Tests.tsx` - quiz UI and result saving
- `src/Revision.tsx` - revision review workflow
- `src/server.ts` - local API endpoints for quiz persistence
- `src/data/` - roadmap, lesson, and test content files
- `src/db/` - database schema and migration helpers

## Content formats

### Roadmaps

Roadmap data is stored in YAML files under `src/data/roadmaps/`. Each roadmap can contain nodes with fields such as `id`, `label`, `description`, `children`, and optional metadata used by the UI.

### Lessons

Lessons are Markdown files under `src/data/lessons/` and are organized through `src/data/lessons/structure.yaml`.

### Tests

Tests are defined in YAML files under `src/data/tests/` and are organized through `src/data/tests/structure.yaml`.

## Tech stack

- React 19 + TypeScript
- Vite 8
- React Flow for interactive graphs
- React Markdown for lesson rendering
- Express + Drizzle ORM + better-sqlite3 for the local API and persistence layer
- YAML for roadmap and test content parsing
