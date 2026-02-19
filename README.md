# Rooster AI Project Management 🐓

A Jira-type application that allows AI agents to collaborate on software projects. Think of it as a project management workspace where AI agents with different roles and personalities work together to deliver the best code possible.

## Features

- **Project Management**: Create projects and clone repositories into a dedicated projects folder
- **Task Board**: Kanban-style board with lanes (To Do, In Progress, Review, Done)
- **AI Agent Team**: 7 specialized agents with unique personalities and skills:
  - **Manager** (Marcus Thompson) - Strategic coordinator
  - **Tech Lead** (Sarah Chen) - Technical architecture expert
  - **Developer** (Alex Rivera) - Full-stack implementation specialist
  - **Intern** (Jamie Park) - Enthusiastic learner
  - **QA** (Taylor Johnson) - Quality assurance expert
  - **Accessibility** (Morgan Davis) - Inclusive design advocate
  - **Product Owner** (Jordan Lee) - User-focused prioritizer
- **Collaborative Workflow**: Agents interact with each other based on their roles and personalities
- **Task Notes & Communication**: Agents can leave notes and messages on tasks

## Installation

1. Clone this repository:
```bash
git clone https://github.com/marts9182/Rooster-AI-Project-Management.git
cd Rooster-AI-Project-Management
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Initialize the system:
```bash
./rooster init
```

## Quick Start

### 1. Create a Project

```bash
./rooster project create \
  --name "My Awesome App" \
  --description "Building a cool web application" \
  --repo-url "https://github.com/user/repo.git"
```

This will:
- Create a new project
- Clone the repository into the `projects/` folder
- Return a project ID for future use

### 2. Create a Task with Auto-Assignment

```bash
./rooster task create \
  --project proj-12345678 \
  --title "Implement user authentication" \
  --description "Add login and registration features with secure password handling" \
  --auto-assign
```

The `--auto-assign` flag will:
- Automatically assign the task to the appropriate agent based on the description
- Simulate agent collaboration showing how the team interacts

### 3. View the Task Board

```bash
./rooster task list
```

This shows a Kanban-style board with all tasks organized by status.

### 4. Move Tasks Through Lanes

```bash
./rooster task move task-12345678 IN_PROGRESS
./rooster task move task-12345678 REVIEW
./rooster task move task-12345678 DONE
```

### 5. View Agent Team

```bash
./rooster agent list
```

See all agents, their personalities, skills, and current tasks.

## Command Reference

### Projects

```bash
# Create a project
./rooster project create --name "NAME" --description "DESC" [--repo-url URL]

# List all projects
./rooster project list

# Show project details
./rooster project show <project-id>
```

### Tasks

```bash
# Create a task
./rooster task create --project <id> --title "TITLE" --description "DESC" [--auto-assign]

# List tasks
./rooster task list [--project <id>] [--status TODO|IN_PROGRESS|REVIEW|DONE]

# Show task details
./rooster task show <task-id>

# Move task to different lane
./rooster task move <task-id> TODO|IN_PROGRESS|REVIEW|DONE

# Assign task to agent
./rooster task assign <task-id> <agent-id>

# Add a note to task
./rooster task note <task-id> "Your note here"
```

### Agents

```bash
# List all agents
./rooster agent list

# Show agent details
./rooster agent show <agent-id>
```

## Agent Personalities

Each agent has a unique personality that influences how they approach work:

- **Marcus Thompson (Manager)**: Strategic thinker who focuses on team coordination and ensuring projects stay on track
- **Sarah Chen (Tech Lead)**: Detail-oriented technical expert passionate about architecture and code quality
- **Alex Rivera (Developer)**: Creative problem-solver who loves tackling challenges with clean code
- **Jamie Park (Intern)**: Enthusiastic learner bringing fresh perspectives and great documentation skills
- **Taylor Johnson (QA)**: Meticulous tester with an eye for edge cases and quality metrics
- **Morgan Davis (Accessibility)**: Empathetic advocate ensuring inclusive design for all users
- **Jordan Lee (Product Owner)**: User-focused decision maker who prioritizes based on value

## How Agents Collaborate

When you create a task with `--auto-assign`, the system:

1. **Product Owner** creates and clarifies requirements
2. **Tech Lead** reviews technical approach and architecture
3. **Developer/Intern** implements the feature (auto-assigned based on complexity)
4. **QA** provides testing strategy and prepares test cases
5. **Accessibility** reviews if the task involves UI/UX
6. **Manager** oversees the process and provides support

Each agent leaves messages from their unique perspective, creating a rich collaborative workflow.

## Project Structure

```
Rooster-AI-Project-Management/
├── rooster                    # Main CLI entry point
├── rooster_ai/
│   ├── models/               # Data models (Project, Task, Agent, Message)
│   ├── agents/               # Agent definitions and personalities
│   ├── core/                 # Core functionality
│   │   ├── storage.py       # Data persistence
│   │   ├── project_manager.py # Project and task management
│   │   └── workflow.py       # Agent collaboration logic
│   └── cli/                  # Command-line interface
├── projects/                 # Cloned repositories (auto-created)
├── data/                     # Storage files (auto-created)
└── requirements.txt          # Python dependencies
```

## Examples

### Example 1: Feature Development

```bash
# Create a project
./rooster project create \
  --name "E-commerce Platform" \
  --description "Building an online store"

# Create feature task
./rooster task create \
  --project proj-abc123 \
  --title "Add shopping cart functionality" \
  --description "Implement add to cart, view cart, and update quantities" \
  --auto-assign

# View the collaboration
./rooster task show task-xyz789
```

### Example 2: Bug Fix

```bash
# Create bug task (auto-assigned to QA/Developer)
./rooster task create \
  --project proj-abc123 \
  --title "Fix checkout button not working" \
  --description "The checkout button doesn't respond on mobile devices. Need to test and fix." \
  --auto-assign

# Move through workflow
./rooster task move task-bug123 IN_PROGRESS
./rooster task move task-bug123 REVIEW
./rooster task move task-bug123 DONE
```

### Example 3: Accessibility Improvement

```bash
# Create accessibility task
./rooster task create \
  --project proj-abc123 \
  --title "Improve form accessibility" \
  --description "Add proper ARIA labels and keyboard navigation to all forms" \
  --auto-assign

# This will auto-assign to Accessibility agent
```

## Data Storage

All data is stored in JSON files in the `data/` directory:
- `projects.json` - Project information
- `tasks.json` - Task details and status
- `agents.json` - Agent state and current tasks
- `messages.json` - Agent communication history

## Future Enhancements

- Retro/retrospective meetings where agents reflect on completed work
- Sprint planning capabilities
- Advanced agent AI using language models for more realistic conversations
- Web UI for visual board management
- GitHub integration for automatic task creation from issues
- Metrics and reporting dashboards

## Contributing

Contributions are welcome! This is a foundation for AI-powered project management.

## License

MIT License - Feel free to use and modify for your projects. 
