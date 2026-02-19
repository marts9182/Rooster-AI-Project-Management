"""Core data models for Rooster AI Project Management."""

from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class TaskStatus(Enum):
    """Task status representing different lanes in the board."""
    TODO = "To Do"
    IN_PROGRESS = "In Progress"
    REVIEW = "Review"
    DONE = "Done"


class AgentRole(Enum):
    """Different agent roles in the team."""
    MANAGER = "Manager"
    TECH_LEAD = "Tech Lead"
    DEVELOPER = "Developer"
    INTERN = "Intern"
    QA = "QA"
    ACCESSIBILITY = "Accessibility"
    PRODUCT_OWNER = "Product Owner"


@dataclass
class Project:
    """Represents a software project."""
    id: str
    name: str
    description: str
    repo_url: Optional[str] = None
    repo_path: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'repo_url': self.repo_url,
            'repo_path': self.repo_path,
            'created_at': self.created_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data):
        data['created_at'] = datetime.fromisoformat(data['created_at'])
        return cls(**data)


@dataclass
class Task:
    """Represents a task in a project."""
    id: str
    project_id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.TODO
    assignee: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    notes: List[str] = field(default_factory=list)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'title': self.title,
            'description': self.description,
            'status': self.status.value,
            'assignee': self.assignee,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'notes': self.notes
        }
    
    @classmethod
    def from_dict(cls, data):
        data['status'] = TaskStatus(data['status'])
        data['created_at'] = datetime.fromisoformat(data['created_at'])
        data['updated_at'] = datetime.fromisoformat(data['updated_at'])
        return cls(**data)


@dataclass
class Agent:
    """Represents an AI agent employee."""
    id: str
    name: str
    role: AgentRole
    personality: str
    skills: List[str] = field(default_factory=list)
    current_task: Optional[str] = None
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'role': self.role.value,
            'personality': self.personality,
            'skills': self.skills,
            'current_task': self.current_task
        }
    
    @classmethod
    def from_dict(cls, data):
        data['role'] = AgentRole(data['role'])
        return cls(**data)


@dataclass
class Message:
    """Represents a message between agents."""
    id: str
    from_agent: str
    to_agent: Optional[str]  # None means broadcast
    content: str
    task_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'from_agent': self.from_agent,
            'to_agent': self.to_agent,
            'content': self.content,
            'task_id': self.task_id,
            'timestamp': self.timestamp.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data):
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)
