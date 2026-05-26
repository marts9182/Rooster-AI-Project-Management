/**
 * EventBus — lightweight in-process event emitter that all
 * agents and the server subscribe to.
 *
 * Events:
 *   task:moved      { taskId, fromStage, toStage, task }
 *   agent:thinking  { agentId, agentName, role, taskId }
 *   agent:comment   { agentId, agentName, role, taskId, comment }
 *   agent:idle      { agentId }
 */

import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // 7 agents + SSE clients
  }

  /** Convenience: emit a typed event with a payload object. */
  fire(event, payload) {
    this.emit(event, { ...payload, _ts: Date.now() });
  }
}

// Singleton
const bus = new EventBus();
export default bus;
