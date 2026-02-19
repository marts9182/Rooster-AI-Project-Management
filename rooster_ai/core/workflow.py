"""Agent interaction and workflow system."""

import uuid
from typing import List, Optional
from datetime import datetime

from rooster_ai.models import Agent, Task, Message, TaskStatus, AgentRole
from rooster_ai.core.storage import Storage


def get_agent_by_role(storage: Storage, role: AgentRole) -> Optional[Agent]:
    """Get an agent by their role from storage."""
    agents = storage.get_agents()
    for agent in agents:
        if agent.role == role:
            return agent
    return None


def get_agent_by_id(storage: Storage, agent_id: str) -> Optional[Agent]:
    """Get an agent by their ID from storage."""
    return storage.get_agent(agent_id)


class AgentWorkflow:
    """Manages agent interactions and workflows."""
    
    def __init__(self, storage: Storage):
        self.storage = storage
    
    def assign_task_by_role(self, task: Task) -> Optional[Agent]:
        """Intelligently assign a task to an appropriate agent based on task requirements."""
        # Simple assignment logic based on task description keywords
        description_lower = task.description.lower()
        
        # Determine appropriate role
        if any(word in description_lower for word in ['feature', 'implement', 'develop', 'code']):
            agent = get_agent_by_role(self.storage, AgentRole.DEVELOPER)
        elif any(word in description_lower for word in ['test', 'qa', 'quality', 'bug']):
            agent = get_agent_by_role(self.storage, AgentRole.QA)
        elif any(word in description_lower for word in ['accessibility', 'a11y', 'wcag', 'screen reader']):
            agent = get_agent_by_role(self.storage, AgentRole.ACCESSIBILITY)
        elif any(word in description_lower for word in ['architecture', 'design', 'technical lead']):
            agent = get_agent_by_role(self.storage, AgentRole.TECH_LEAD)
        elif any(word in description_lower for word in ['requirement', 'story', 'user', 'product']):
            agent = get_agent_by_role(self.storage, AgentRole.PRODUCT_OWNER)
        elif any(word in description_lower for word in ['simple', 'documentation', 'docs', 'readme']):
            agent = get_agent_by_role(self.storage, AgentRole.INTERN)
        else:
            # Default to developer
            agent = get_agent_by_role(self.storage, AgentRole.DEVELOPER)
        
        if agent:
            task.assignee = agent.id
            self.storage.save_task(task)
            
            # Update agent's current task
            agent.current_task = task.id
            self.storage.save_agent(agent)
        
        return agent
    
    def send_message(self, from_agent_id: str, content: str, 
                    to_agent_id: str = None, task_id: str = None) -> Message:
        """Send a message from one agent to another or broadcast."""
        message = Message(
            id=f"msg-{uuid.uuid4().hex[:8]}",
            from_agent=from_agent_id,
            to_agent=to_agent_id,
            content=content,
            task_id=task_id
        )
        
        self.storage.save_message(message)
        return message
    
    def get_agent_perspective(self, agent: Agent, task: Task) -> str:
        """Get an agent's perspective on a task based on their role and personality."""
        perspectives = {
            AgentRole.MANAGER: f"{agent.name} reviews the task and considers resource allocation, timeline, and team capacity. They want to ensure the team has what they need to succeed.",
            
            AgentRole.TECH_LEAD: f"{agent.name} analyzes the technical requirements and considers architecture implications. They're thinking about code quality, technical debt, and how this fits into the overall system.",
            
            AgentRole.DEVELOPER: f"{agent.name} is excited to tackle the implementation. They're already thinking about the best approach, potential challenges, and how to write clean, maintainable code.",
            
            AgentRole.INTERN: f"{agent.name} is enthusiastic about contributing. They see this as a learning opportunity and are ready to ask questions and research the best approaches.",
            
            AgentRole.QA: f"{agent.name} is already thinking about test cases and edge cases. They want to ensure this feature is thoroughly tested and works correctly in all scenarios.",
            
            AgentRole.ACCESSIBILITY: f"{agent.name} reviews the requirements through an accessibility lens. They're checking if this will work for users with disabilities and if it meets WCAG standards.",
            
            AgentRole.PRODUCT_OWNER: f"{agent.name} evaluates the business value and user impact. They're ensuring this aligns with user needs and product goals."
        }
        
        return perspectives.get(agent.role, f"{agent.name} reviews the task.")
    
    def simulate_workflow(self, task: Task) -> List[Message]:
        """Simulate a workflow where agents collaborate on a task."""
        messages = []
        
        # 1. Product Owner creates and clarifies requirements
        po = get_agent_by_role(self.storage, AgentRole.PRODUCT_OWNER)
        if po:
            msg = self.send_message(
                po.id,
                f"I've created a new task: '{task.title}'. {self.get_agent_perspective(po, task)}",
                task_id=task.id
            )
            messages.append(msg)
        
        # 2. Tech Lead reviews technical approach
        tech_lead = get_agent_by_role(self.storage, AgentRole.TECH_LEAD)
        if tech_lead:
            msg = self.send_message(
                tech_lead.id,
                f"I've reviewed '{task.title}' from a technical perspective. {self.get_agent_perspective(tech_lead, task)} I'll ensure we follow best practices.",
                task_id=task.id
            )
            messages.append(msg)
        
        # 3. Developer or Intern takes the task
        assignee_id = task.assignee
        if assignee_id:
            agent = get_agent_by_id(self.storage, assignee_id)
            if agent:
                msg = self.send_message(
                    agent.id,
                    f"I'm taking on '{task.title}'. {self.get_agent_perspective(agent, task)}",
                    task_id=task.id
                )
                messages.append(msg)
        
        # 4. QA provides input on testing
        qa = get_agent_by_role(self.storage, AgentRole.QA)
        if qa:
            msg = self.send_message(
                qa.id,
                f"For '{task.title}', {self.get_agent_perspective(qa, task)} I'll prepare test cases.",
                task_id=task.id
            )
            messages.append(msg)
        
        # 5. Accessibility reviews if relevant
        accessibility = get_agent_by_role(self.storage, AgentRole.ACCESSIBILITY)
        if accessibility and any(word in task.description.lower() for word in ['ui', 'interface', 'user', 'form', 'button', 'page']):
            msg = self.send_message(
                accessibility.id,
                f"I'm reviewing '{task.title}' for accessibility. {self.get_agent_perspective(accessibility, task)}",
                task_id=task.id
            )
            messages.append(msg)
        
        # 6. Manager oversees
        manager = get_agent_by_role(self.storage, AgentRole.MANAGER)
        if manager:
            msg = self.send_message(
                manager.id,
                f"Great collaboration everyone on '{task.title}'! {self.get_agent_perspective(manager, task)} Let me know if you need any support.",
                task_id=task.id
            )
            messages.append(msg)
        
        return messages
