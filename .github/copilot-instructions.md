# Copilot Workflow Instructions — Rooster AI Project Management

## Golden Rule

**NEVER modify `data/tasks.json`, `data/messages.json`, or `data/agents.json` directly.**
All task mutations MUST go through the running Express API on `http://localhost:5000`.
The agents can only see and respond to work that flows through the API.

---

## Pre-Flight Checklist (Before Any Work)

1. **Verify the server is running.**
   ```powershell
   Invoke-RestMethod -Uri http://localhost:5000/api/agents -Method GET | Select-Object -First 1
   ```
   If this fails, start the server first:
   ```powershell
   cd c:\Sandbox\AIProjectManagement\Rooster-AI-Project-Management\web.ui\backend
   node server.js          # run in background terminal
   ```

2. **Every piece of work requires a task.**
   No code changes, no file edits, no builds without a task on the board that has been moved through the proper stages.

---

## Task Lifecycle (Mandatory Stages — In Order)

```
backlog → analyze → develop → ready_for_test → testing → ready_for_acceptance → accepted
```

**No stage may be skipped.** The API enforces this (`validateTransition`).

### Stage-by-Stage Workflow

| Stage | What Happens | Who Engages |
|---|---|---|
| **backlog** | Task created, triaged, prioritised | Manager, Product Owner |
| **analyze** | Requirements reviewed, technical approach discussed | Tech Lead, Product Owner |
| **develop** | Implementation work performed | Developer, Tech Lead (+ Intern if applicable) |
| **ready_for_test** | Code complete, handed off for testing | QA, Developer, Tech Lead |
| **testing** | Test execution, bug reports, quality checks | QA (+ Accessibility if UI task) |
| **ready_for_acceptance** | Process review, final sign-off prep | Product Owner, Manager (+ Accessibility if UI) |
| **accepted** | Done — celebrated, lessons noted | Manager |

---

## API Calls (Use These — Not Direct File Edits)

### Create a task
There is no POST endpoint for task creation yet. To add a task:
- Add it to `data/tasks.json` with `"status": "backlog"` and immediately call the move endpoint to trigger agent engagement:
  ```powershell
  # After adding the task to tasks.json with status "backlog":
  Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{taskId}/move `
    -Method POST -ContentType "application/json" `
    -Body '{"status":"backlog"}'
  ```
  **Note:** Since backlog→backlog is not a forward move, instead move it to the next stage when ready. The agents for backlog engage when the task first appears.

### Move a task to the next stage
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{taskId}/move `
  -Method POST -ContentType "application/json" `
  -Body '{"status":"analyze"}'
```

### Check agent comments on a task
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{taskId}/comments -Method GET
```

### Verify agent statuses
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/agents -Method GET
```

---

## Mandatory Workflow for Copilot (Step-by-Step)

### 1. Create the Task
- Add the task object to `data/tasks.json` with `"status": "backlog"`
- The task MUST have: `id`, `project_id`, `title`, `description`, `acceptance_criteria`, `status`, `sprint_id`

### 2. Move to Analyze (Agents: Manager + Product Owner engage at backlog; Tech Lead + PO engage at analyze)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"analyze"}'
```
- **WAIT** for agents to respond (2-5 seconds)
- **READ** their comments: `GET /api/tasks/{id}/comments`
- **Consider** their feedback before proceeding

### 3. Move to Develop (Agents: Developer + Tech Lead engage)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"develop"}'
```
- **WAIT** for agents, **READ** comments
- **NOW** do the actual implementation work

### 4. Move to Ready for Test (Agents: QA + Developer + Tech Lead engage)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"ready_for_test"}'
```
- **WAIT**, **READ** agent feedback

### 5. Move to Testing (Agents: QA engages, + Accessibility if UI task)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"testing"}'
```
- **WAIT**, **READ** agent QA feedback
- **Address** any issues raised

### 6. Move to Ready for Acceptance (Agents: Product Owner + Manager)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"ready_for_acceptance"}'
```
- **WAIT**, **READ** PO/Manager sign-off

### 7. Move to Accepted (Agent: Manager celebrates)
```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/tasks/{id}/move -Method POST -ContentType "application/json" -Body '{"status":"accepted"}'
```

---

## Rules Summary

1. **Server must be running** before any task work begins.
2. **Every change requires a task** — no cowboy commits.
3. **Tasks move one stage at a time** through the API — never skip stages.
4. **Never edit data JSON files directly** to change task status — use the API.
5. **Wait for agents** after each move — read their comments and factor them in.
6. **Implementation happens during the `develop` stage only** — not before.
7. **If the API call fails**, fix the server first — do not fall back to direct file edits.

---

## What Happens When You Bypass the Workflow

- Agents never see the task and cannot contribute their expertise
- No QA review, no accessibility check, no tech lead architecture review
- No audit trail in `messages.json`
- The board shows stale data
- Team members (agents) are left out of the loop

**The whole point of this system is collaborative AI project management. Use it.**
