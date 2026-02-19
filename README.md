# Rooster AI Project Management 🐓

A Jira-style project management application with **autonomous AI agents** that collaborate on software projects in real time. Features a **Kanban board web UI** (React + TypeScript) backed by an **Express API** with **Server-Sent Events (SSE)** for live agent activity.

## Features

- **Kanban Board** — 7-lane web UI (Backlog → Analyze → Develop → Ready for Test → Testing → Ready for Acceptance → Accepted)
- **Drag-and-Drop** — move tasks between lanes with HTML5 drag-and-drop
- **Auto-Polling** — board refreshes every 3 seconds when external changes occur
- **Sprint Selector** — filter the board by sprint
- **Task Detail Modal** — view description, acceptance criteria, and agent comments
- **Accessibility** — ARIA roles, keyboard navigation (Tab/Enter/Escape), focus trapping
- **Autonomous AI Agents** — 7 server-side agents that react to task movements in real time:
  - **Manager** (Marcus Thompson) — Strategic coordinator
  - **Tech Lead** (Sarah Chen) — Technical architecture expert
  - **Developer** (Alex Rivera) — Full-stack implementation specialist
  - **Intern** (Jamie Park) — Enthusiastic learner
  - **QA** (Taylor Johnson) — Quality assurance expert
  - **Accessibility** (Morgan Davis) — Inclusive design advocate
  - **Product Owner** (Jordan Lee) — User-focused prioritizer
- **Live Agent Feed** — SSE pushes `agent:thinking`, `agent:comment`, and `agent:idle` events to the browser in real time

---

## Prerequisites

- **Node.js 18+** and **npm**

---

## Installation

```bash
git clone https://github.com/marts9182/Rooster-AI-Project-Management.git
cd Rooster-AI-Project-Management
```

### 1. Install backend dependencies

```bash
cd web.ui/backend
npm install
```

### 2. Build the React frontend

```bash
cd web.ui/frontend-react
npm install
npm run build
```

This produces a production build in `web.ui/frontend-react/dist/` that Express serves automatically.

---

## Running

```bash
cd web.ui/backend
node server.js
```

Open **http://localhost:5000** in your browser. All 7 agents boot automatically and begin listening for task events.

### Development mode (with hot-reload)

```bash
# Terminal 1 — Express API + Agent Runtime
cd web.ui/backend
node server.js

# Terminal 2 — Vite dev server (proxies /api to Express)
cd web.ui/frontend-react
npm run dev
```

Then open **http://localhost:3000** for the Vite dev server.

---

## Project Structure

```
Rooster-AI-Project-Management/
├── web.ui/
│   ├── backend/
│   │   ├── server.js                # Express API + SSE + static file server
│   │   └── agents/
│   │       ├── index.js             # Barrel export (runtime, bus, validateTransition)
│   │       ├── EventBus.js          # Node.js EventEmitter with .fire() helper
│   │       ├── BaseAgent.js         # Abstract agent with boot/engage/respond lifecycle
│   │       ├── AgentRuntime.js      # Boots all agents, wires persistence, SSE broadcast
│   │       ├── workflowRules.js     # Stage → role mapping (which agents engage where)
│   │       ├── MarcusThompson.js    # Manager persona
│   │       ├── SarahChen.js         # Tech Lead persona
│   │       ├── AlexRivera.js        # Developer persona
│   │       ├── JamiePark.js         # Intern persona
│   │       ├── TaylorJohnson.js     # QA persona
│   │       ├── MorganDavis.js       # Accessibility persona
│   │       └── JordanLee.js         # Product Owner persona
│   └── frontend-react/              # React 19 + TypeScript 5.9 (Vite)
│       └── src/
│           ├── App.tsx              # Root component with SSE status indicator
│           ├── App.css              # Global styles + agent thinking animation
│           ├── types/index.ts       # TypeScript interfaces
│           ├── services/api.ts      # Typed API service layer
│           ├── agents/index.ts      # Agent name lookup map (UI display only)
│           ├── hooks/
│           │   ├── useTaskPoller.ts  # 3-second polling with hash comparison
│           │   ├── useAgentEvents.ts # SSE subscription hook
│           │   └── useAgentWorkflow.ts # Task move API wrapper
│           ├── components/
│           │   ├── Board.tsx        # Kanban board with 7 lanes
│           │   ├── Lane.tsx         # Single lane with drop target
│           │   ├── Card.tsx         # Draggable task card
│           │   ├── TaskModal.tsx    # Task detail modal with comments
│           │   ├── SprintSelector.tsx # Sprint filter dropdown
│           │   └── ErrorBanner.tsx  # Error display
│           └── constants/           # Status labels, lane config
├── data/                            # JSON data files
│   ├── projects.json
│   ├── tasks.json
│   ├── sprints.json
│   ├── agents.json
│   └── messages.json
└── projects/                        # Project artifacts
```

---

## How Agents Work

Agents are **autonomous server-side processes** that boot when the Express server starts. Each agent extends `BaseAgent` and listens for `task:moved` events on the EventBus.

When a task is moved to a new lane:

1. **EventBus** fires a `task:moved` event
2. **AgentRuntime** routes the event to all agents
3. Each agent checks `shouldEngage()` based on the lane's role mapping (e.g., QA engages on `ready_for_test`)
4. Engaged agents enter a **thinking** state (with personality-appropriate delays) and broadcast `agent:thinking` via SSE
5. Agents generate a response comment and persist it to `messages.json`
6. An `agent:comment` event is broadcast via SSE, and the browser refreshes automatically

The browser subscribes to `/api/events` (SSE) and shows a pulsing "🤖 Agent is thinking…" indicator when any agent is processing.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sprints` | List all sprints |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/tasks` | List all tasks (optional `?sprint=` filter) |
| `GET` | `/api/tasks/:id/comments` | Get comments for a task |
| `POST` | `/api/tasks/:id/move` | Move a task to a new lane (triggers agents) |
| `POST` | `/api/tasks/:id/comments` | Add a comment to a task |
| `GET` | `/api/agents` | List all agents and their statuses |
| `GET` | `/api/events` | SSE stream for live agent activity |

---

## Data Storage

All data is stored as JSON in the `data/` directory:

| File | Contents |
|------|----------|
| `projects.json` | Project metadata |
| `tasks.json` | Tasks with status, acceptance criteria, assignments |
| `sprints.json` | Sprint definitions and dates |
| `agents.json` | Agent state and online status |
| `messages.json` | Agent comments and communication history |

---

## License

MIT License — feel free to use and modify for your projects.
