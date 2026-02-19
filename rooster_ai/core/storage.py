"""Core storage functionality for projects, tasks, and agents."""

import json
import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from rooster_ai.models import Project, Task, Agent, Message, TaskStatus


class Storage:
    """Simple JSON-based storage for the application."""
    
    def __init__(self, base_path: str = None):
        if base_path is None:
            base_path = os.path.join(os.getcwd(), 'data')
        
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
        
        self.projects_file = self.base_path / 'projects.json'
        self.tasks_file = self.base_path / 'tasks.json'
        self.agents_file = self.base_path / 'agents.json'
        self.messages_file = self.base_path / 'messages.json'
        
        # Initialize files if they don't exist
        for file in [self.projects_file, self.tasks_file, self.agents_file, self.messages_file]:
            if not file.exists():
                file.write_text('[]')
    
    def _load_json(self, filepath: Path) -> list:
        """Load JSON data from file."""
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    def _save_json(self, filepath: Path, data: list):
        """Save JSON data to file."""
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Project methods
    def get_projects(self) -> List[Project]:
        """Get all projects."""
        data = self._load_json(self.projects_file)
        return [Project.from_dict(p) for p in data]
    
    def get_project(self, project_id: str) -> Optional[Project]:
        """Get a project by ID."""
        projects = self.get_projects()
        for project in projects:
            if project.id == project_id:
                return project
        return None
    
    def save_project(self, project: Project):
        """Save or update a project."""
        projects = self.get_projects()
        # Remove existing project with same ID
        projects = [p for p in projects if p.id != project.id]
        projects.append(project)
        
        data = [p.to_dict() for p in projects]
        self._save_json(self.projects_file, data)
    
    def delete_project(self, project_id: str):
        """Delete a project."""
        projects = self.get_projects()
        projects = [p for p in projects if p.id != project_id]
        data = [p.to_dict() for p in projects]
        self._save_json(self.projects_file, data)
    
    # Task methods
    def get_tasks(self, project_id: str = None) -> List[Task]:
        """Get all tasks, optionally filtered by project."""
        data = self._load_json(self.tasks_file)
        tasks = [Task.from_dict(t) for t in data]
        
        if project_id:
            tasks = [t for t in tasks if t.project_id == project_id]
        
        return tasks
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        tasks = self.get_tasks()
        for task in tasks:
            if task.id == task_id:
                return task
        return None
    
    def save_task(self, task: Task):
        """Save or update a task."""
        task.updated_at = datetime.now()
        tasks = self.get_tasks()
        # Remove existing task with same ID
        tasks = [t for t in tasks if t.id != task.id]
        tasks.append(task)
        
        data = [t.to_dict() for t in tasks]
        self._save_json(self.tasks_file, data)
    
    def delete_task(self, task_id: str):
        """Delete a task."""
        tasks = self.get_tasks()
        tasks = [t for t in tasks if t.id != task_id]
        data = [t.to_dict() for t in tasks]
        self._save_json(self.tasks_file, data)
    
    # Agent methods
    def get_agents(self) -> List[Agent]:
        """Get all agents."""
        data = self._load_json(self.agents_file)
        return [Agent.from_dict(a) for a in data]
    
    def get_agent(self, agent_id: str) -> Optional[Agent]:
        """Get an agent by ID."""
        agents = self.get_agents()
        for agent in agents:
            if agent.id == agent_id:
                return agent
        return None
    
    def save_agent(self, agent: Agent):
        """Save or update an agent."""
        agents = self.get_agents()
        # Remove existing agent with same ID
        agents = [a for a in agents if a.id != agent.id]
        agents.append(agent)
        
        data = [a.to_dict() for a in agents]
        self._save_json(self.agents_file, data)
    
    # Message methods
    def get_messages(self, task_id: str = None, limit: int = 100) -> List[Message]:
        """Get messages, optionally filtered by task."""
        data = self._load_json(self.messages_file)
        messages = [Message.from_dict(m) for m in data]
        
        if task_id:
            messages = [m for m in messages if m.task_id == task_id]
        
        # Sort by timestamp and limit
        messages.sort(key=lambda m: m.timestamp, reverse=True)
        return messages[:limit]
    
    def save_message(self, message: Message):
        """Save a message."""
        messages = self.get_messages(limit=10000)
        messages.append(message)
        
        data = [m.to_dict() for m in messages]
        self._save_json(self.messages_file, data)
