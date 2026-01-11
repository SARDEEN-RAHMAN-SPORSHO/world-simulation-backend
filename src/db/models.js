/**
 * Data Models and Schema Definitions
 */

export const WorldStateSchema = {
  simulationId: String,
  tick: Number,
  year: Number,
  worldName: String,
  description: String,
  countries: [
    {
      id: String,
      name: String,
      ideology: String,
      description: String,
      power: Number,        // 0-100
      stability: Number,    // 0-100
      technology: Number,   // 0-100
      population: Number,
      resources: Number,    // 0-100
      alliances: [String],
      tensions: Object,     // { countryId: tensionLevel (-100 to 100) }
      history: [String],    // Recent major events
    }
  ],
  globalEvents: [
    {
      tick: Number,
      year: Number,
      type: String,         // WAR, PEACE, ALLIANCE, COLLAPSE, INNOVATION, REBELLION
      actors: [String],
      description: String,
      impact: Object
    }
  ],
  metrics: {
    stabilityIndex: Number,
    explanation: String,
    ideologicalDiversity: Number,
    conflictLevel: Number,
    survivalRate: Number
  },
  status: String,         // RUNNING, PAUSED, COMPLETED, FAILED
  createdAt: Date,
  updatedAt: Date
};

export const AgentConfigSchema = {
  simulationId: String,
  agents: [
    {
      id: String,
      role: String,       // OVERSEER, LEADER, THINKER, STRATEGIST
      apiKey: String,
      countryId: String,  // null for neutral agents
      personality: String,
      memory: [String],
      lastAction: Object,
      decisionHistory: [Object]
    }
  ]
};

export const EventLogSchema = {
  simulationId: String,
  tick: Number,
  year: Number,
  timestamp: Date,
  agentId: String,
  eventType: String,
  content: String,
  worldStateBefore: Object,
  worldStateAfter: Object,
  overseerInsights: Object,
  philosophicalInsight: Object
};

/**
 * Helper functions for data validation
 */
export function validateWorldState(state) {
  if (!state.simulationId) throw new Error('Missing simulationId');
  if (!Array.isArray(state.countries)) throw new Error('Countries must be an array');
  
  for (const country of state.countries) {
    if (country.power < 0 || country.power > 100) {
      throw new Error(`Invalid power value for ${country.name}`);
    }
    if (country.stability < 0 || country.stability > 100) {
      throw new Error(`Invalid stability value for ${country.name}`);
    }
  }
  
  return true;
}

export function clampValue(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
