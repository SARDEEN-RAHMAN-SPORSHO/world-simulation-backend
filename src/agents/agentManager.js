import { GeminiClient } from './geminiClient.js';
import {
  overseerPrompt,
  leaderPrompt,
  thinkerPrompt,
  strategistPrompt,
  actionResolutionPrompt
} from './prompts.js';

export class AgentManager {
  constructor(simulationId, db) {
    this.simulationId = simulationId;
    this.db = db;
    this.clients = new Map();
    this.agentConfig = null;
  }

  async initialize() {
    if (this.clients.size > 0) return; // Already initialized

    const config = await this.db.collection('agent_configs')
      .findOne({ simulationId: this.simulationId });

    if (!config) {
      throw new Error(`No agent configuration found for simulation ${this.simulationId}`);
    }

    this.agentConfig = config;

    for (const agent of config.agents) {
      try {
        this.clients.set(agent.id, {
          client: new GeminiClient(agent.apiKey),
          config: agent
        });
      } catch (error) {
        console.error(`❌ Failed to initialize agent ${agent.id}:`, error.message);
      }
    }

    console.log(`✅ Initialized ${this.clients.size} agents for simulation ${this.simulationId}`);
  }

  async collectDecisions(worldState) {
    if (this.clients.size === 0) await this.initialize();

    const decisions = [];

    // Collect decisions from all leader agents
    for (const [agentId, { client, config }] of this.clients.entries()) {
      if (config.role !== 'LEADER') continue;

      const country = worldState.countries.find(c => c.id === config.countryId);
      
      if (!country) {
        console.warn(`⚠️ Country ${config.countryId} not found for agent ${agentId}`);
        continue;
      }

      // Skip if country has collapsed
      if (country.stability < 10 && country.power < 10) {
        console.log(`⏭️ Skipping ${country.name} - nation has collapsed`);
        continue;
      }

      try {
        const prompt = leaderPrompt(country, worldState, worldState.tick);
        const decision = await client.callWithRetry(prompt);

        if (decision.error) {
          console.error(`❌ Agent ${agentId} (${country.name}) failed to make decision:`, decision.error);
          // Make a safe default decision
          decisions.push({
            agentId,
            actorId: config.countryId,
            action: 'INTERNAL',
            specificAction: 'stabilize',
            target: null,
            details: 'Emergency stabilization measures',
            reasoning: 'AI agent unavailable, default action',
            expectedOutcome: 'Maintain status quo',
            risks: 'None'
          });
        } else {
          decisions.push({
            agentId,
            actorId: config.countryId,
            apiKey: config.apiKey, // Pass for resolution
            ...decision
          });
          
          console.log(`✅ ${country.name}: ${decision.specificAction} ${decision.target ? `→ ${decision.target}` : ''}`);
        }
      } catch (error) {
        console.error(`❌ Error collecting decision from ${agentId}:`, error.message);
      }
    }

    return decisions;
  }

  async getOverseerAnalysis(worldState) {
    const overseer = this.clients.get('overseer');
    
    if (!overseer) {
      console.warn('⚠️ No overseer agent configured');
      return {
        stabilityIndex: 50,
        explanation: 'No overseer analysis available',
        emergingPatterns: [],
        predictions: [],
        hiddenCosts: 'Unknown'
      };
    }

    try {
      const prompt = overseerPrompt(worldState, worldState.tick);
      const analysis = await overseer.client.callWithRetry(prompt);

      if (analysis.error) {
        throw new Error(analysis.error);
      }

      console.log(`📊 Overseer Analysis: Stability Index = ${analysis.stabilityIndex}/100`);
      return analysis;
    } catch (error) {
      console.error('❌ Overseer analysis failed:', error.message);
      return {
        stabilityIndex: 50,
        explanation: 'Overseer analysis failed',
        emergingPatterns: [],
        predictions: [],
        hiddenCosts: 'Unknown'
      };
    }
  }

  async getThinkerCommentary(worldState, recentEvents) {
    const thinker = this.clients.get('thinker');
    
    if (!thinker) {
      return null;
    }

    try {
      const prompt = thinkerPrompt(worldState, recentEvents);
      const commentary = await thinker.client.callWithRetry(prompt);

      if (commentary.error) {
        throw new Error(commentary.error);
      }

      console.log(`💭 Philosophical Insight: ${commentary.philosophicalQuestion}`);
      return commentary;
    } catch (error) {
      console.error('❌ Thinker commentary failed:', error.message);
      return null;
    }
  }

  async getStrategistAnalysis(worldState) {
    const strategist = this.clients.get('strategist');
    
    if (!strategist) {
      return null;
    }

    try {
      // Find active conflicts
      const activeConflicts = worldState.globalEvents
        .filter(e => e.type === 'WAR' && worldState.tick - e.tick < 10)
        .map(e => ({
          attacker: e.actors[0],
          defender: e.actors[1],
          startYear: e.year
        }));

      const prompt = strategistPrompt(worldState, activeConflicts);
      const analysis = await strategist.client.callWithRetry(prompt);

      if (analysis.error) {
        throw new Error(analysis.error);
      }

      return analysis;
    } catch (error) {
      console.error('❌ Strategist analysis failed:', error.message);
      return null;
    }
  }

  async resolveAction(decision, worldState, actorConfig) {
    try {
      const prompt = actionResolutionPrompt(decision, worldState, actorConfig);
      
      // Use the actor's API key for resolution to distribute load
      const client = new GeminiClient(actorConfig.apiKey);
      const result = await client.callWithRetry(prompt);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('❌ Action resolution failed:', error.message);
      
      // Return safe default result
      return {
        success: false,
        successLevel: 'FAILURE',
        changes: {},
        description: `Action failed due to unforeseen circumstances: ${error.message}`,
        unintendedConsequences: 'Operation aborted',
        newTensions: {}
      };
    }
  }

  async updateAgentMemory(agentId, event) {
    try {
      await this.db.collection('agent_configs').updateOne(
        { 
          simulationId: this.simulationId,
          'agents.id': agentId 
        },
        {
          $push: {
            'agents.$.memory': {
              $each: [event],
              $slice: -20 // Keep only last 20 memories
            }
          }
        }
      );
    } catch (error) {
      console.error(`❌ Failed to update memory for agent ${agentId}:`, error.message);
    }
  }
}
