"""Project management functionality."""

import os
import uuid
from pathlib import Path
from typing import Optional
import git

from rooster_ai.models import Project, Task, TaskStatus
from rooster_ai.core.storage import Storage


class ProjectManager:
    """Manages projects and repositories."""
    
    def __init__(self, storage: Storage, projects_base_path: str = None):
        self.storage = storage
        
        if projects_base_path is None:
            projects_base_path = os.path.join(os.getcwd(), 'projects')
        
        self.projects_base_path = Path(projects_base_path)
        self.projects_base_path.mkdir(exist_ok=True)
    
    def create_project(self, name: str, description: str, repo_url: str = None) -> Project:
        """Create a new project."""
        project_id = f"proj-{uuid.uuid4().hex[:8]}"
        
        project = Project(
            id=project_id,
            name=name,
            description=description,
            repo_url=repo_url
        )
        
        # Clone repository if URL provided
        if repo_url:
            project.repo_path = self._clone_repository(project_id, repo_url)
        
        self.storage.save_project(project)
        return project
    
    def _clone_repository(self, project_id: str, repo_url: str) -> str:
        """Clone a repository into the projects folder."""
        repo_path = self.projects_base_path / project_id
        
        if repo_path.exists():
            # Repository already exists, pull latest changes
            repo = git.Repo(repo_path)
            repo.remotes.origin.pull()
        else:
            # Clone the repository
            git.Repo.clone_from(repo_url, repo_path)
        
        return str(repo_path)
    
    def get_project(self, project_id: str) -> Optional[Project]:
        """Get a project by ID."""
        return self.storage.get_project(project_id)
    
    def list_projects(self):
        """List all projects."""
        return self.storage.get_projects()
    
    def delete_project(self, project_id: str):
        """Delete a project."""
        self.storage.delete_project(project_id)


class TaskManager:
    """Manages tasks within projects."""
    
    def __init__(self, storage: Storage):
        self.storage = storage
    
    def create_task(self, project_id: str, title: str, description: str) -> Task:
        """Create a new task."""
        task_id = f"task-{uuid.uuid4().hex[:8]}"
        
        task = Task(
            id=task_id,
            project_id=project_id,
            title=title,
            description=description
        )
        
        self.storage.save_task(task)
        return task
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        return self.storage.get_task(task_id)
    
    def list_tasks(self, project_id: str = None, status: TaskStatus = None):
        """List tasks, optionally filtered by project and status."""
        tasks = self.storage.get_tasks(project_id)
        
        if status:
            tasks = [t for t in tasks if t.status == status]
        
        return tasks
    
    def update_task_status(self, task_id: str, status: TaskStatus):
        """Update task status (move through lanes)."""
        task = self.get_task(task_id)
        if task:
            task.status = status
            self.storage.save_task(task)
            return task
        return None
    
    def assign_task(self, task_id: str, agent_id: str):
        """Assign a task to an agent."""
        task = self.get_task(task_id)
        if task:
            task.assignee = agent_id
            self.storage.save_task(task)
            return task
        return None
    
    def add_note(self, task_id: str, note: str):
        """Add a note to a task."""
        task = self.get_task(task_id)
        if task:
            task.notes.append(f"[{task.updated_at.isoformat()}] {note}")
            self.storage.save_task(task)
            return task
        return None
    
    def delete_task(self, task_id: str):
        """Delete a task."""
        self.storage.delete_task(task_id)
