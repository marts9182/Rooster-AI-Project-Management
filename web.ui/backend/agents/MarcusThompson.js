import { BaseAgent } from './BaseAgent.js';

export class MarcusThompson extends BaseAgent {
  id = 'agent-manager-001';
  name = 'Marcus Thompson';
  role = 'Manager';
  personality =
    'Strategic and supportive. Marcus focuses on team coordination, resource ' +
    "allocation, and ensuring projects stay on track. He's great at seeing " +
    'the big picture and keeping everyone motivated.';
  skills = ['Project Planning', 'Team Coordination', 'Risk Management', 'Stakeholder Communication'];
  thinkingDelayRange = [2000, 4500]; // managers deliberate

  systemPrompt =
    'You are Marcus Thompson, Project Manager. You are strategic and supportive. ' +
    'You focus on team coordination, resource allocation, and keeping projects on track.';

  guardrails = [
    'Ensure no workflow stages are skipped',
    'Keep the team motivated with positive reinforcement',
    'Escalate blockers immediately',
  ];

  stageActions = {
    backlog: {
      description: 'Acknowledge new work, assess priority and team capacity.',
      reviewCriteria: [
        'Priority assessed against current sprint goals',
        'Team capacity considered',
        'Dependencies identified',
      ],
      outputTemplate:
        '**[Manager — Backlog Triage]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'New task noted. Assessing priority and team capacity. ' +
        "I'll make sure this is properly prioritised in the " +
        'current sprint and dependencies are tracked.',
    },
    ready_for_acceptance: {
      description: 'Review process compliance and provide final sign-off alongside PO.',
      reviewCriteria: [
        'Workflow stages were followed in order',
        'All required reviews completed',
        'No process steps skipped',
      ],
      outputTemplate:
        '**[Manager — Process Review]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Verifying the workflow was followed correctly:\n' +
        '• Requirements were clarified (Backlog/Analyze)\n' +
        '• Technical review completed (Analyze)\n' +
        '• Development and testing done (Develop → Testing)\n' +
        '• Ready for Product Owner acceptance.',
    },
    accepted: {
      description: 'Celebrate completion, note lessons learned.',
      reviewCriteria: ['Task fully delivered', 'Team acknowledged'],
      outputTemplate:
        '**[Manager — Task Complete]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Great work, team! This task has been accepted and is ' +
        'complete. Noting any lessons learned for future sprints.',
    },
  };

  /**
   * Generate a sprint retrospective with analytics.
   * @param {object} sprint - The sprint object
   * @param {object[]} tasks - All tasks in this sprint
   * @param {object[]} messages - All messages for this sprint's tasks
   * @returns {{ content: string, analytics: object }}
   */
  generateRetro(sprint, tasks, messages) {
    // --- Task analytics ---
    const statusCounts = {};
    for (const t of tasks) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    }

    const completedTasks = tasks.filter(t => t.status === 'accepted');

    // Cycle time: created_at → updated_at (rough proxy)
    const cycleTimes = completedTasks
      .filter(t => t.created_at && t.updated_at)
      .map(t => {
        const start = new Date(t.created_at).getTime();
        const end = new Date(t.updated_at).getTime();
        return (end - start) / (1000 * 60 * 60); // hours
      });

    const avgCycleTimeHours = cycleTimes.length > 0
      ? (cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length).toFixed(1)
      : 'N/A';

    // --- Agent engagement counts ---
    const agentCounts = {};
    for (const m of messages) {
      const agent = m.from_agent || 'unknown';
      agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    }

    // Top contributor
    const topAgent = Object.entries(agentCounts)
      .sort(([, a], [, b]) => b - a)[0];

    // --- Bottleneck detection: tasks stuck in non-terminal stages ---
    const stuckTasks = tasks.filter(t =>
      t.status !== 'accepted' && t.status !== 'backlog'
    );

    // --- Rejection analysis ---
    const rejections = messages.filter(m => m.approval && !m.approval.approved);

    // --- Build retro content ---
    const lines = [
      `**[Manager — Sprint Retrospective]**`,
      `Sprint: *${sprint.name}*\n`,
      `## 📊 Sprint Analytics`,
      `  - **Total tasks:** ${tasks.length}`,
      `  - **Completed (accepted):** ${completedTasks.length}`,
      `  - **Tasks by status:** ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `  - **Average cycle time:** ${avgCycleTimeHours} hours`,
      `  - **Total agent comments:** ${messages.length}`,
      `  - **Agent rejections:** ${rejections.length}`,
      '',
      `## 👥 Agent Engagement`,
      ...Object.entries(agentCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([agent, count]) => `  - ${agent}: ${count} comments`),
      '',
      `  **Top contributor:** ${topAgent ? `${topAgent[0]} (${topAgent[1]} comments)` : 'N/A'}`,
      '',
    ];

    // What went well
    lines.push(`## ✅ What Went Well`);
    if (completedTasks.length > 0) {
      lines.push(`  - ${completedTasks.length} task(s) delivered and accepted.`);
    }
    if (messages.length > 20) {
      lines.push(`  - Strong team collaboration — ${messages.length} agent interactions recorded.`);
    }
    if (rejections.length > 0) {
      lines.push(`  - Gate-keeping working: ${rejections.length} quality rejection(s) caught issues early.`);
    }
    lines.push('');

    // What needs improvement
    lines.push(`## 🔧 What Needs Improvement`);
    if (stuckTasks.length > 0) {
      lines.push(`  - ${stuckTasks.length} task(s) not yet accepted: ${stuckTasks.map(t => `"${t.title}" (${t.status})`).join(', ')}`);
    }
    if (avgCycleTimeHours !== 'N/A' && parseFloat(avgCycleTimeHours) > 48) {
      lines.push(`  - Average cycle time (${avgCycleTimeHours}h) is high — consider breaking tasks into smaller pieces.`);
    }
    if (Object.keys(agentCounts).length < 5) {
      lines.push(`  - Only ${Object.keys(agentCounts).length} agents engaged — aim for broader participation.`);
    }
    lines.push('');

    // Action items
    lines.push(`## 📋 Action Items`);
    lines.push(`  1. Review any stuck tasks and unblock them.`);
    if (stuckTasks.length > 0) {
      lines.push(`  2. Follow up on: ${stuckTasks.map(t => t.title).join(', ')}`);
    }
    lines.push(`  ${stuckTasks.length > 0 ? '3' : '2'}. Carry forward learnings into the next sprint planning.`);

    const content = lines.join('\n');
    const analytics = {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      statusCounts,
      avgCycleTimeHours,
      totalComments: messages.length,
      rejections: rejections.length,
      agentEngagement: agentCounts,
      topContributor: topAgent ? { agent: topAgent[0], comments: topAgent[1] } : null,
      stuckTasks: stuckTasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
    };

    return { content, analytics };
  }
}

export default new MarcusThompson();
