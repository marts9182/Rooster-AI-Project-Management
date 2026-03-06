/** Backend agents barrel export. */
export { default as runtime, bus, ALL_AGENTS, AGENTS_BY_ROLE, AGENTS_BY_ID } from './AgentRuntime.js';
export { BaseAgent } from './BaseAgent.js';
export { default as eventBus } from './EventBus.js';
export * from './workflowRules.js';
export { analyzeTask } from './TaskAnalyzer.js';
export { BaseLLMAdapter, SmartTemplateAdapter, defaultAdapter } from './LLMAdapter.js';
export { default as marcus } from './MarcusThompson.js';
