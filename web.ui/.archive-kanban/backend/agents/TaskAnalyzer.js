/**
 * TaskAnalyzer — extracts structured insights from a task object
 * so agents can produce context-aware, unique responses.
 */

// ── Keyword / domain detection ────────────────────────────────────────────

const TECH_DOMAINS = {
  frontend: ['react', 'vue', 'angular', 'css', 'html', 'component', 'ui', 'ux', 'dom', 'vite', 'webpack', 'tailwind', 'styling', 'layout', 'responsive', 'modal', 'form', 'button'],
  backend: ['api', 'express', 'server', 'node', 'endpoint', 'rest', 'graphql', 'middleware', 'route', 'database', 'sql', 'mongo', 'redis', 'cache'],
  testing: ['test', 'jest', 'mocha', 'cypress', 'playwright', 'coverage', 'unit test', 'integration test', 'e2e', 'qa', 'regression'],
  devops: ['ci', 'cd', 'deploy', 'docker', 'kubernetes', 'github actions', 'pipeline', 'build', 'release'],
  accessibility: ['a11y', 'wcag', 'aria', 'screen reader', 'keyboard', 'focus', 'contrast', 'accessible'],
  mobile: ['ios', 'android', 'capacitor', 'cordova', 'mobile', 'touch', 'native', 'pwa'],
  security: ['auth', 'security', 'csrf', 'xss', 'injection', 'encryption', 'token', 'password', 'csp'],
  architecture: ['refactor', 'architecture', 'design pattern', 'migration', 'modular', 'decouple', 'abstraction', 'interface', 'adapter'],
};

const RISK_SIGNALS = {
  high_complexity: ['migration', 'rewrite', 'refactor', 'overhaul', 'redesign', 'replace'],
  breaking_change: ['breaking', 'remove', 'delete', 'deprecate', 'rename', 'replace'],
  data_risk: ['database', 'schema', 'migration', 'data loss', 'backup', 'storage'],
  performance: ['performance', 'optimization', 'latency', 'memory', 'cpu', 'cache', 'load'],
  external_dependency: ['api', 'third-party', 'external', 'integration', 'vendor', 'plugin'],
};

const COMPLEXITY_FACTORS = {
  long_description: (task) => (task.description?.length || 0) > 300 ? 2 : 0,
  many_acceptance_criteria: (task) => {
    const count = (task.acceptance_criteria?.match(/\d+\./g) || []).length;
    return count > 5 ? 2 : count > 3 ? 1 : 0;
  },
  cross_cutting: (task) => {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    const domainCount = Object.values(TECH_DOMAINS).filter(
      keywords => keywords.some(kw => text.includes(kw))
    ).length;
    return domainCount > 2 ? 2 : domainCount > 1 ? 1 : 0;
  },
  has_risk_signals: (task) => {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    const riskCount = Object.values(RISK_SIGNALS).filter(
      signals => signals.some(s => text.includes(s))
    ).length;
    return riskCount > 2 ? 3 : riskCount > 0 ? 1 : 0;
  },
};

// ── Main analyzer ─────────────────────────────────────────────────────────

export function analyzeTask(task) {
  const text = `${task.title || ''} ${task.description || ''} ${task.acceptance_criteria || ''}`.toLowerCase();

  // 1. Detect tech domains
  const domains = [];
  for (const [domain, keywords] of Object.entries(TECH_DOMAINS)) {
    const matched = keywords.filter(kw => text.includes(kw));
    if (matched.length > 0) {
      domains.push({ domain, matchCount: matched.length, keywords: matched });
    }
  }
  domains.sort((a, b) => b.matchCount - a.matchCount);

  // 2. Detect risks
  const risks = [];
  for (const [risk, signals] of Object.entries(RISK_SIGNALS)) {
    const matched = signals.filter(s => text.includes(s));
    if (matched.length > 0) {
      risks.push({ risk: risk.replace(/_/g, ' '), signals: matched });
    }
  }

  // 3. Calculate complexity score (0-10)
  let complexityScore = 0;
  for (const factor of Object.values(COMPLEXITY_FACTORS)) {
    complexityScore += factor(task);
  }
  complexityScore = Math.min(10, complexityScore);

  const complexityLabel =
    complexityScore >= 7 ? 'high' :
    complexityScore >= 4 ? 'medium' : 'low';

  // 4. Extract acceptance criteria as array
  const criteriaItems = (task.acceptance_criteria || '')
    .split(/\n/)
    .map(s => s.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  // 5. Extract key action verbs from description
  const actionVerbs = extractActionVerbs(task.description || '');

  // 6. Identify primary domain
  const primaryDomain = domains.length > 0 ? domains[0].domain : 'general';

  return {
    primaryDomain,
    domains,
    risks,
    complexityScore,
    complexityLabel,
    criteriaItems,
    criteriaCount: criteriaItems.length,
    actionVerbs,
    hasAcceptanceCriteria: criteriaItems.length > 0,
    isUiRelated: domains.some(d => d.domain === 'frontend' || d.domain === 'accessibility'),
    isHighRisk: risks.length >= 2 || complexityScore >= 7,
    taskSummary: buildTaskSummary(task, primaryDomain, complexityLabel, risks),
  };
}

function extractActionVerbs(description) {
  const verbs = [
    'add', 'create', 'build', 'implement', 'fix', 'remove', 'delete',
    'update', 'modify', 'refactor', 'migrate', 'replace', 'design',
    'review', 'audit', 'test', 'deploy', 'configure', 'integrate',
    'optimize', 'validate', 'ensure', 'enable', 'disable',
  ];
  const text = description.toLowerCase();
  return verbs.filter(v => text.includes(v));
}

function buildTaskSummary(task, domain, complexity, risks) {
  const parts = [`A ${complexity}-complexity ${domain} task`];
  if (risks.length > 0) {
    parts.push(`with ${risks.map(r => r.risk).join(', ')} considerations`);
  }
  return parts.join(' ') + '.';
}
