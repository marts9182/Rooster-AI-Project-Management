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

    // Cycle time variance
    const minCycle = cycleTimes.length > 0 ? Math.min(...cycleTimes).toFixed(1) : 'N/A';
    const maxCycle = cycleTimes.length > 0 ? Math.max(...cycleTimes).toFixed(1) : 'N/A';

    // --- Agent engagement counts ---
    const agentCounts = {};
    for (const m of messages) {
      const agent = m.from_agent || 'unknown';
      agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    }

    // Top contributor
    const topAgent = Object.entries(agentCounts)
      .sort(([, a], [, b]) => b - a)[0];

    // Bottom contributor
    const bottomAgent = Object.entries(agentCounts)
      .sort(([, a], [, b]) => a - b)[0];

    // Workload distribution analysis
    const agentCommentCounts = Object.values(agentCounts);
    const avgComments = agentCommentCounts.length > 0
      ? agentCommentCounts.reduce((a, b) => a + b, 0) / agentCommentCounts.length
      : 0;
    const workloadSkew = topAgent && bottomAgent
      ? (topAgent[1] / Math.max(bottomAgent[1], 1)).toFixed(1)
      : 'N/A';

    // --- Bottleneck detection: tasks stuck in non-terminal stages ---
    const stuckTasks = tasks.filter(t =>
      t.status !== 'accepted' && t.status !== 'backlog'
    );

    // --- Rejection analysis ---
    const rejections = messages.filter(m => m.approval && !m.approval.approved);

    // --- Comment depth analysis (short vs substantive) ---
    const shortComments = messages.filter(m => m.content && m.content.length < 100).length;
    const substantiveComments = messages.filter(m => m.content && m.content.length >= 100).length;

    // --- Fastest and slowest tasks ---
    const tasksWithCycleTime = completedTasks
      .filter(t => t.created_at && t.updated_at)
      .map(t => ({
        title: t.title,
        hours: ((new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1),
      }))
      .sort((a, b) => parseFloat(a.hours) - parseFloat(b.hours));

    const fastestTask = tasksWithCycleTime[0] || null;
    const slowestTask = tasksWithCycleTime.length > 1 ? tasksWithCycleTime[tasksWithCycleTime.length - 1] : null;

    // --- Build retro content ---
    const lines = [
      `**[Manager — Sprint Retrospective]**`,
      `Sprint: *${sprint.name}*\n`,
      `## 📊 Sprint Analytics`,
      `  - **Total tasks:** ${tasks.length}`,
      `  - **Completed (accepted):** ${completedTasks.length}`,
      `  - **Tasks by status:** ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `  - **Average cycle time:** ${avgCycleTimeHours} hours`,
      `  - **Cycle time range:** ${minCycle}h – ${maxCycle}h`,
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

    // What went well — data-driven
    lines.push(`## ✅ What Went Well`);
    if (completedTasks.length > 0) {
      const pct = ((completedTasks.length / tasks.length) * 100).toFixed(0);
      lines.push(`  - ${completedTasks.length}/${tasks.length} tasks delivered (${pct}% completion rate).`);
    }
    if (messages.length > 20) {
      lines.push(`  - Strong team collaboration — ${messages.length} agent interactions recorded.`);
    }
    if (rejections.length > 0) {
      lines.push(`  - Gate-keeping active: ${rejections.length} quality rejection(s) caught issues early.`);
    }
    if (substantiveComments > shortComments) {
      lines.push(`  - Comment quality was strong — ${substantiveComments} substantive comments vs ${shortComments} brief ones.`);
    }
    if (fastestTask) {
      lines.push(`  - Fastest delivery: "${fastestTask.title}" completed in ${fastestTask.hours}h.`);
    }
    if (Object.keys(agentCounts).length >= 5) {
      lines.push(`  - Broad participation: ${Object.keys(agentCounts).length} agents engaged across the sprint.`);
    }
    lines.push('');

    // What needs improvement — proactive insights even when successful
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
    // Proactive: workload imbalance
    if (workloadSkew !== 'N/A' && parseFloat(workloadSkew) > 2.0) {
      lines.push(`  - Workload imbalance detected: ${topAgent[0]} contributed ${topAgent[1]} comments vs ${bottomAgent[0]} with ${bottomAgent[1]} (${workloadSkew}x ratio). Consider redistributing review responsibilities.`);
    }
    // Proactive: zero rejections
    if (rejections.length === 0 && tasks.length > 0) {
      lines.push(`  - Zero rejections across ${tasks.length} tasks — gate-keeping may be too lenient. Review approval thresholds to ensure quality checks are meaningful.`);
    }
    // Proactive: cycle time variance
    if (slowestTask && fastestTask && parseFloat(slowestTask.hours) > parseFloat(fastestTask.hours) * 3) {
      lines.push(`  - High cycle time variance: fastest task took ${fastestTask.hours}h, slowest took ${slowestTask.hours}h ("${slowestTask.title}"). Investigate what caused delays.`);
    }
    // Proactive: comment quality
    if (shortComments > substantiveComments) {
      lines.push(`  - ${shortComments} of ${messages.length} comments were brief (< 100 chars) — encourage more detailed feedback from agents.`);
    }
    lines.push('');

    // Action items — data-driven, sprint-specific
    lines.push(`## 📋 Action Items`);
    let actionNum = 1;
    if (stuckTasks.length > 0) {
      lines.push(`  ${actionNum++}. Unblock stuck tasks: ${stuckTasks.map(t => `"${t.title}"`).join(', ')}.`);
    }
    if (rejections.length === 0 && tasks.length > 0) {
      lines.push(`  ${actionNum++}. Review gate-keeping thresholds — zero rejections across ${tasks.length} tasks suggests criteria may need tightening.`);
    }
    if (workloadSkew !== 'N/A' && parseFloat(workloadSkew) > 2.0) {
      lines.push(`  ${actionNum++}. Address workload imbalance — ${bottomAgent[0]} had significantly fewer interactions. Consider adjusting stage assignments.`);
    }
    if (slowestTask && fastestTask && parseFloat(slowestTask.hours) > parseFloat(fastestTask.hours) * 3) {
      lines.push(`  ${actionNum++}. Investigate cycle time outlier: "${slowestTask.title}" (${slowestTask.hours}h) — was it blocked, under-specified, or over-scoped?`);
    }
    if (shortComments > substantiveComments) {
      lines.push(`  ${actionNum++}. Improve comment quality — shift from brief acknowledgments to actionable feedback.`);
    }
    if (completedTasks.length === tasks.length && tasks.length > 0) {
      lines.push(`  ${actionNum++}. All tasks delivered — carry velocity into next sprint. Consider increasing scope slightly.`);
    }
    if (actionNum === 1) {
      // Fallback if nothing specific emerged
      lines.push(`  1. Sprint ran smoothly. Focus on continuous improvement and stretch goals next sprint.`);
    }

    const content = lines.join('\n');

    // --- Auto-generate review summary ---
    const reviewParts = [];
    reviewParts.push(`${completedTasks.length}/${tasks.length} tasks delivered.`);
    if (avgCycleTimeHours !== 'N/A') {
      reviewParts.push(`Average cycle time: ${avgCycleTimeHours}h.`);
    }
    if (rejections.length > 0) {
      reviewParts.push(`${rejections.length} quality gate rejection(s).`);
    } else if (tasks.length > 0) {
      reviewParts.push(`Zero rejections — review gate-keeping thresholds.`);
    }
    if (topAgent) {
      reviewParts.push(`Top contributor: ${topAgent[0]} (${topAgent[1]} comments).`);
    }
    const review = reviewParts.join(' ');

    const analytics = {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      statusCounts,
      avgCycleTimeHours,
      cycleTimeRange: { min: minCycle, max: maxCycle },
      totalComments: messages.length,
      rejections: rejections.length,
      agentEngagement: agentCounts,
      topContributor: topAgent ? { agent: topAgent[0], comments: topAgent[1] } : null,
      stuckTasks: stuckTasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
      workloadSkew,
      commentDepth: { short: shortComments, substantive: substantiveComments },
    };

    return { content, analytics, review };
  }
}

export default new MarcusThompson();
