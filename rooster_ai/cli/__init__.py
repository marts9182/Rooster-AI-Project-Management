#!/usr/bin/env python3
"""
Rooster AI Project Management CLI

A Jira-type application for AI agents to collaborate on projects.
"""

import click
from colorama import init, Fore, Style

from rooster_ai.core import Storage, ProjectManager, TaskManager, AgentWorkflow
from rooster_ai.models import TaskStatus
from rooster_ai.agents import get_default_agents, get_agent_by_id

# Initialize colorama for cross-platform colored output
init()

# Initialize core components
storage = Storage()
project_manager = ProjectManager(storage)
task_manager = TaskManager(storage)
workflow = AgentWorkflow(storage)


@click.group()
def cli():
    """Rooster AI Project Management - A collaborative workspace for AI agents."""
    pass


@cli.group()
def project():
    """Manage projects."""
    pass


@project.command('create')
@click.option('--name', required=True, help='Project name')
@click.option('--description', required=True, help='Project description')
@click.option('--repo-url', help='Git repository URL to clone')
def create_project(name, description, repo_url):
    """Create a new project."""
    proj = project_manager.create_project(name, description, repo_url)
    click.echo(f"{Fore.GREEN}✓ Created project: {proj.name} ({proj.id}){Style.RESET_ALL}")
    if repo_url:
        click.echo(f"{Fore.CYAN}  Repository cloned to: {proj.repo_path}{Style.RESET_ALL}")


@project.command('list')
def list_projects():
    """List all projects."""
    projects = project_manager.list_projects()
    
    if not projects:
        click.echo(f"{Fore.YELLOW}No projects found.{Style.RESET_ALL}")
        return
    
    click.echo(f"\n{Fore.CYAN}Projects:{Style.RESET_ALL}")
    for proj in projects:
        click.echo(f"  {Fore.GREEN}●{Style.RESET_ALL} {proj.name} ({proj.id})")
        click.echo(f"    {proj.description}")
        if proj.repo_url:
            click.echo(f"    {Fore.CYAN}Repository: {proj.repo_url}{Style.RESET_ALL}")
        click.echo()


@project.command('show')
@click.argument('project_id')
def show_project(project_id):
    """Show project details."""
    proj = project_manager.get_project(project_id)
    
    if not proj:
        click.echo(f"{Fore.RED}✗ Project not found: {project_id}{Style.RESET_ALL}")
        return
    
    click.echo(f"\n{Fore.CYAN}Project: {proj.name}{Style.RESET_ALL}")
    click.echo(f"ID: {proj.id}")
    click.echo(f"Description: {proj.description}")
    if proj.repo_url:
        click.echo(f"Repository: {proj.repo_url}")
        click.echo(f"Path: {proj.repo_path}")
    click.echo(f"Created: {proj.created_at}")
    
    # Show tasks
    tasks = task_manager.list_tasks(project_id)
    click.echo(f"\n{Fore.CYAN}Tasks: {len(tasks)}{Style.RESET_ALL}")


@cli.group()
def task():
    """Manage tasks."""
    pass


@task.command('create')
@click.option('--project', 'project_id', required=True, help='Project ID')
@click.option('--title', required=True, help='Task title')
@click.option('--description', required=True, help='Task description')
@click.option('--auto-assign', is_flag=True, help='Automatically assign to appropriate agent')
def create_task(project_id, title, description, auto_assign):
    """Create a new task."""
    # Verify project exists
    proj = project_manager.get_project(project_id)
    if not proj:
        click.echo(f"{Fore.RED}✗ Project not found: {project_id}{Style.RESET_ALL}")
        return
    
    t = task_manager.create_task(project_id, title, description)
    click.echo(f"{Fore.GREEN}✓ Created task: {t.title} ({t.id}){Style.RESET_ALL}")
    
    # Auto-assign if requested
    if auto_assign:
        agent = workflow.assign_task_by_role(t)
        if agent:
            click.echo(f"{Fore.CYAN}  Assigned to: {agent.name} ({agent.role.value}){Style.RESET_ALL}")
            
            # Simulate workflow
            click.echo(f"\n{Fore.YELLOW}Simulating agent collaboration...{Style.RESET_ALL}")
            messages = workflow.simulate_workflow(t)
            for msg in messages:
                agent = get_agent_by_id(msg.from_agent)
                if agent:
                    click.echo(f"\n{Fore.CYAN}{agent.name} ({agent.role.value}):{Style.RESET_ALL}")
                    click.echo(f"  {msg.content}")


@task.command('list')
@click.option('--project', 'project_id', help='Filter by project ID')
@click.option('--status', type=click.Choice(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']), help='Filter by status')
def list_tasks(project_id, status):
    """List all tasks."""
    status_enum = TaskStatus[status] if status else None
    tasks = task_manager.list_tasks(project_id, status_enum)
    
    if not tasks:
        click.echo(f"{Fore.YELLOW}No tasks found.{Style.RESET_ALL}")
        return
    
    # Group by status
    by_status = {}
    for t in tasks:
        if t.status not in by_status:
            by_status[t.status] = []
        by_status[t.status].append(t)
    
    # Display board view
    click.echo(f"\n{Fore.CYAN}Task Board:{Style.RESET_ALL}")
    
    for status in [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.DONE]:
        status_tasks = by_status.get(status, [])
        click.echo(f"\n{Fore.YELLOW}┌─ {status.value} ({len(status_tasks)}){Style.RESET_ALL}")
        
        for t in status_tasks:
            assignee_name = "Unassigned"
            if t.assignee:
                agent = get_agent_by_id(t.assignee)
                if agent:
                    assignee_name = f"{agent.name} ({agent.role.value})"
            
            click.echo(f"{Fore.YELLOW}│{Style.RESET_ALL} {Fore.GREEN}●{Style.RESET_ALL} {t.title} ({t.id})")
            click.echo(f"{Fore.YELLOW}│{Style.RESET_ALL}   {t.description[:60]}...")
            click.echo(f"{Fore.YELLOW}│{Style.RESET_ALL}   {Fore.CYAN}Assigned to: {assignee_name}{Style.RESET_ALL}")


@task.command('show')
@click.argument('task_id')
def show_task(task_id):
    """Show task details."""
    t = task_manager.get_task(task_id)
    
    if not t:
        click.echo(f"{Fore.RED}✗ Task not found: {task_id}{Style.RESET_ALL}")
        return
    
    click.echo(f"\n{Fore.CYAN}Task: {t.title}{Style.RESET_ALL}")
    click.echo(f"ID: {t.id}")
    click.echo(f"Status: {t.status.value}")
    click.echo(f"Description: {t.description}")
    
    if t.assignee:
        agent = get_agent_by_id(t.assignee)
        if agent:
            click.echo(f"Assigned to: {agent.name} ({agent.role.value})")
    
    click.echo(f"Created: {t.created_at}")
    click.echo(f"Updated: {t.updated_at}")
    
    if t.notes:
        click.echo(f"\n{Fore.CYAN}Notes:{Style.RESET_ALL}")
        for note in t.notes:
            click.echo(f"  • {note}")
    
    # Show messages
    messages = storage.get_messages(task_id=t.id)
    if messages:
        click.echo(f"\n{Fore.CYAN}Agent Collaboration ({len(messages)} messages):{Style.RESET_ALL}")
        for msg in reversed(messages):  # Show oldest first
            agent = get_agent_by_id(msg.from_agent)
            if agent:
                click.echo(f"\n{Fore.YELLOW}{agent.name} ({agent.role.value}):{Style.RESET_ALL}")
                click.echo(f"  {msg.content}")


@task.command('move')
@click.argument('task_id')
@click.argument('status', type=click.Choice(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']))
def move_task(task_id, status):
    """Move task to a different lane."""
    status_enum = TaskStatus[status]
    t = task_manager.update_task_status(task_id, status_enum)
    
    if t:
        click.echo(f"{Fore.GREEN}✓ Moved task '{t.title}' to {status_enum.value}{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.RED}✗ Task not found: {task_id}{Style.RESET_ALL}")


@task.command('assign')
@click.argument('task_id')
@click.argument('agent_id')
def assign_task(task_id, agent_id):
    """Assign task to an agent."""
    t = task_manager.assign_task(task_id, agent_id)
    
    if t:
        agent = get_agent_by_id(agent_id)
        if agent:
            click.echo(f"{Fore.GREEN}✓ Assigned task '{t.title}' to {agent.name}{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.RED}✗ Task not found: {task_id}{Style.RESET_ALL}")


@task.command('note')
@click.argument('task_id')
@click.argument('note')
def add_task_note(task_id, note):
    """Add a note to a task."""
    t = task_manager.add_note(task_id, note)
    
    if t:
        click.echo(f"{Fore.GREEN}✓ Added note to task '{t.title}'{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.RED}✗ Task not found: {task_id}{Style.RESET_ALL}")


@cli.group()
def agent():
    """Manage agents."""
    pass


@agent.command('list')
def list_agents():
    """List all agents."""
    agents = storage.get_agents()
    
    # Initialize with defaults if empty
    if not agents:
        click.echo(f"{Fore.YELLOW}Initializing default agents...{Style.RESET_ALL}")
        for default_agent in get_default_agents():
            storage.save_agent(default_agent)
        agents = storage.get_agents()
    
    click.echo(f"\n{Fore.CYAN}AI Agent Team:{Style.RESET_ALL}\n")
    
    for a in agents:
        click.echo(f"{Fore.GREEN}●{Style.RESET_ALL} {Fore.YELLOW}{a.name}{Style.RESET_ALL} - {a.role.value} ({a.id})")
        click.echo(f"  {a.personality}")
        click.echo(f"  {Fore.CYAN}Skills: {', '.join(a.skills)}{Style.RESET_ALL}")
        if a.current_task:
            task = task_manager.get_task(a.current_task)
            if task:
                click.echo(f"  {Fore.MAGENTA}Currently working on: {task.title}{Style.RESET_ALL}")
        click.echo()


@agent.command('show')
@click.argument('agent_id')
def show_agent(agent_id):
    """Show agent details."""
    a = get_agent_by_id(agent_id)
    
    if not a:
        click.echo(f"{Fore.RED}✗ Agent not found: {agent_id}{Style.RESET_ALL}")
        return
    
    click.echo(f"\n{Fore.CYAN}{a.name} - {a.role.value}{Style.RESET_ALL}")
    click.echo(f"ID: {a.id}")
    click.echo(f"\nPersonality:")
    click.echo(f"  {a.personality}")
    click.echo(f"\nSkills:")
    for skill in a.skills:
        click.echo(f"  • {skill}")
    
    if a.current_task:
        task = task_manager.get_task(a.current_task)
        if task:
            click.echo(f"\n{Fore.YELLOW}Current Task:{Style.RESET_ALL}")
            click.echo(f"  {task.title} ({task.id})")
            click.echo(f"  Status: {task.status.value}")


@cli.command('init')
def init_system():
    """Initialize the system with default agents."""
    click.echo(f"{Fore.CYAN}Initializing Rooster AI Project Management System...{Style.RESET_ALL}\n")
    
    # Save default agents
    agents = get_default_agents()
    for agent in agents:
        storage.save_agent(agent)
    
    click.echo(f"{Fore.GREEN}✓ Initialized {len(agents)} AI agents{Style.RESET_ALL}")
    click.echo(f"{Fore.GREEN}✓ System ready!{Style.RESET_ALL}\n")
    
    click.echo("Next steps:")
    click.echo("  1. Create a project: rooster project create --name 'My Project' --description 'Description'")
    click.echo("  2. Create a task: rooster task create --project <project-id> --title 'Task' --description 'Description' --auto-assign")
    click.echo("  3. View agents: rooster agent list")
    click.echo("  4. View board: rooster task list")


if __name__ == '__main__':
    cli()
