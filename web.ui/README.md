# Rooster AI Project Kanban Board

Web-based Kanban board for the Rooster AI Project with autonomous AI agents.

## How to Run

### 1. Backend (Express API + Agent Runtime)

1. Navigate to `web.ui/backend`.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the Express server:
   ```sh
   node server.js
   ```
   Runs on http://localhost:5000. All 7 AI agents boot automatically.

### 2. Frontend (React + TypeScript)

For production, the Express server serves the built React app from `frontend-react/dist/`.

For development with hot-reload:
```sh
cd web.ui/frontend-react
npm install
npm run dev
```
Open http://localhost:3000 (Vite proxies `/api` calls to Express).

### 3. Usage
- The board shows 7 lanes: Backlog → Analyze → Develop → Ready for Test → Testing → Ready for Acceptance → Accepted.
- Drag tasks between lanes — autonomous agents respond in real time via SSE.
- Click a task to view its description, acceptance criteria, and agent comments.

---

- The backend reads from `data/tasks.json`, `data/messages.json`, and other JSON files in `data/`.
- The Express backend must be running for the frontend to work.
