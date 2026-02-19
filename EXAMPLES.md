# Example Workflows

This document contains example workflows demonstrating how to use Rooster AI Project Management.

## Scenario 1: Starting a New Web Application

### Initialize and Create Project
```bash
# Initialize the system (first time only)
./rooster init

# Create a new project for a web app
./rooster project create \
  --name "My Web App" \
  --description "A modern web application using React and FastAPI"

# Note the project ID (e.g., proj-abc12345)
```

### Create Development Tasks
```bash
PROJECT_ID="proj-abc12345"  # Replace with your project ID

# Backend API task
./rooster task create \
  --project $PROJECT_ID \
  --title "Develop REST API endpoints" \
  --description "Create CRUD endpoints for user management with proper authentication" \
  --auto-assign

# Frontend task
./rooster task create \
  --project $PROJECT_ID \
  --title "Build React dashboard" \
  --description "Implement responsive dashboard with data visualization components" \
  --auto-assign

# Testing task
./rooster task create \
  --project $PROJECT_ID \
  --title "QA testing for user flows" \
  --description "Test registration, login, password reset, and profile update flows" \
  --auto-assign

# Documentation task
./rooster task create \
  --project $PROJECT_ID \
  --title "Write API documentation" \
  --description "Create comprehensive API docs with examples and authentication guide" \
  --auto-assign
```

### View the Board
```bash
# See all tasks organized by status
./rooster task list

# Filter to see only tasks in a specific project
./rooster task list --project $PROJECT_ID
```

### Move Tasks Through Workflow
```bash
# Get a task ID from the board (e.g., task-xyz789)
TASK_ID="task-xyz789"

# Developer starts working
./rooster task move $TASK_ID IN_PROGRESS

# Add progress notes
./rooster task note $TASK_ID "Implemented user CRUD endpoints"
./rooster task note $TASK_ID "Added JWT authentication"

# Ready for review
./rooster task move $TASK_ID REVIEW

# After review, mark as done
./rooster task move $TASK_ID DONE
```

## Scenario 2: Working with an Existing Repository

### Clone a GitHub Repository
```bash
# Create project with repository URL
./rooster project create \
  --name "Open Source Project" \
  --description "Contributing to an open source project" \
  --repo-url "https://github.com/username/repo.git"

# The repository will be cloned to: projects/<project-id>/
```

### Create Bug Fix Tasks
```bash
PROJECT_ID="proj-def45678"

# Bug fix task
./rooster task create \
  --project $PROJECT_ID \
  --title "Fix broken navigation on mobile" \
  --description "Navigation menu doesn't work on mobile devices - hamburger icon not responding" \
  --auto-assign

# The QA agent will be involved automatically
```

## Scenario 3: Accessibility-Focused Development

### Create Accessibility Tasks
```bash
PROJECT_ID="proj-ghi78901"

# Accessibility audit task
./rooster task create \
  --project $PROJECT_ID \
  --title "Accessibility audit of checkout page" \
  --description "Review checkout form for WCAG compliance, test with screen readers" \
  --auto-assign

# This will auto-assign to Morgan Davis (Accessibility agent)
# Multiple agents will collaborate on the task
```

## Scenario 4: Viewing Agent Collaboration

### See How Agents Work Together
```bash
# Create a complex task
./rooster task create \
  --project proj-abc12345 \
  --title "Implement payment processing" \
  --description "Add Stripe integration for credit card payments with secure handling" \
  --auto-assign

# View the task to see agent collaboration
./rooster task show task-<id>

# You'll see messages from:
# - Product Owner: Clarifying requirements
# - Tech Lead: Reviewing architecture
# - Developer: Planning implementation
# - QA: Preparing test cases
# - Accessibility: Checking payment form accessibility
# - Manager: Overseeing the process
```

## Scenario 5: Managing Multiple Projects

### List All Projects
```bash
# See all your projects
./rooster project list

# View details of a specific project
./rooster project show proj-abc12345
```

### Filter Tasks by Project
```bash
# See tasks for specific project
./rooster task list --project proj-abc12345

# See only TODO tasks across all projects
./rooster task list --status TODO

# See tasks in review
./rooster task list --status REVIEW
```

## Scenario 6: Understanding Your Team

### Explore Agent Capabilities
```bash
# List all agents and their personalities
./rooster agent list

# View specific agent details
./rooster agent show agent-developer-001

# See what each agent is currently working on
# (shown in the agent list output)
```

## Scenario 7: Sprint Planning

### Create a Sprint Worth of Tasks
```bash
PROJECT_ID="proj-sprint01"

# User stories
./rooster task create --project $PROJECT_ID \
  --title "User story: Password reset" \
  --description "As a user, I want to reset my password via email so I can regain access" \
  --auto-assign

./rooster task create --project $PROJECT_ID \
  --title "User story: Profile editing" \
  --description "As a user, I want to update my profile information" \
  --auto-assign

# Technical tasks
./rooster task create --project $PROJECT_ID \
  --title "Set up CI/CD pipeline" \
  --description "Configure GitHub Actions for automated testing and deployment" \
  --auto-assign

# View the sprint board
./rooster task list --project $PROJECT_ID
```

## Scenario 8: Reassigning Tasks

### Manually Assign to Different Agent
```bash
# Sometimes you want to override auto-assignment
TASK_ID="task-xyz789"

# Assign to intern for learning opportunity
./rooster task assign $TASK_ID agent-intern-001

# Assign to tech lead for complex architecture work
./rooster task assign $TASK_ID agent-techlead-001
```

## Tips

1. **Auto-assignment is smart**: Tasks with keywords like "test", "qa", "bug" go to QA agent. "Documentation" goes to intern. "Architecture" goes to tech lead.

2. **Use descriptive task titles**: Better descriptions lead to better agent assignments and more relevant collaboration messages.

3. **Check agent collaboration**: Always view tasks with `./rooster task show <task-id>` to see how agents are collaborating.

4. **Add notes regularly**: Use `./rooster task note` to document progress, decisions, and blockers.

5. **Use the board view**: `./rooster task list` gives you a Kanban-style overview of all work.

6. **Project organization**: Keep related tasks in the same project for better organization.

## Next Steps

- Explore creating your own projects
- Experiment with different task descriptions to see how agents are assigned
- Use the system to manage your actual development work
- Consider extending the system with custom agents or integrations
