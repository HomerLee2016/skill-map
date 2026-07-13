# Skill Map

An interactive, web-based tool for defining and visualizing educational roadmaps, skill trees, and structured learning paths using YAML.

This project provides a split-pane interface with a live YAML text editor on the left and an interactive, zoomable/pannable Node/Graph visualization on the right powered by React Flow.

## Features

- **YAML-Based Definition**: Define your skill trees and roadmap nodes hierarchically using simple and readable YAML structure.
- **Live Visualization**: Real-time rendering of the node tree as you type.
- **Interactive Graph**: Pan, zoom, and adjust nodes in a responsive canvas powered by React Flow.
- **Resizable Layout**: A custom draggable divider allows users to resize the editor and visualizer panels dynamically.
- **Syntax Highlighting & Error Detection**: Rich YAML code editing experience with error feedback when the YAML syntax is invalid or missing required properties (like `id` or `label`).

---

## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/HomerLee2016/skill-map.git
   cd skill-map
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the Vite development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173` to see the editor in action.

### Building for Production

Compile TypeScript and build the static application bundle:
```bash
npm run build
```
You can preview the built production app locally using:
```bash
npm run preview
```

### Linting

Lint code using Oxlint:
```bash
npm run lint
```

---

## Roadmap YAML Schema

The application parses YAML content into a hierarchical structure. The root element and all children must follow this format:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Unique identifier for the node. |
| `label` | `string` | Yes | Display text for the node in the diagram. |
| `description` | `string` | No | Additional context about the skill. |
| `children` | `RoadmapNode[]` | No | An array of nested child skills/sub-skills. |

### Example YAML

```yaml
id: calculus
label: Calculus Roadmap
description: Complete guide to mastering Calculus
children:
  - id: algebra
    label: Basic Algebra
  - id: limits
    label: Limits
    children:
      - id: sandwich
        label: Sandwich Theorem
  - id: derivatives
    label: Derivatives
  - id: integrals
    label: Integrals
```

---

## Tech Stack

- **Framework**: [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Build Tool**: [Vite 8](https://vite.dev/)
- **Interactive Graph**: [React Flow 11](https://reactflow.dev/)
- **Code Editor**: [@uiw/react-textarea-code-editor](https://github.com/uiwjs/react-textarea-code-editor)
- **YAML Parser**: [yaml](https://github.com/eemeli/yaml)
- **Linter**: [Oxlint](https://oxc.rs/docs/guide/usage/linter)

