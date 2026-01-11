import { WorldState } from './worldState.js';

/**
 * Resolves agent actions and determines outcomes
 */
export class EventResolver {
  constructor(db, simulationId, agentManager) {
    this.db = db;
    this.simulationId = simulationId;
    this.agentManager = agentManager;
    this.worldStateManager = new WorldState(db, simulationId);
  }

  async resolveActions(worldState, decisions) {
    const events = [];
    const allChanges = {};
    const allTensionChanges = {};

    // Prioritize actions: MILITARY > DIPLOMACY > ESPIONAGE > INTERNAL
    const sortedDecisions = this.prioritizeActions(decisions);

    for (const decision of sortedDecisions) {
      try {
        const actorConfig = await this.getActorConfig(decision.actorId);
        
        if (!actorConfig) {
          console.warn(`⚠️ No config found for actor ${decision.actorId}`);
          continue;
        }

        // Get AI resolution for this action
        const resolution = await this.agentManager.resolveAction(
          decision,
          worldState,
          actorConfig
        );

        // Create event from resolution
        const event = {
          type: this.mapActionToEventType(decision.action, decision.specificAction),
          actors: [decision.actorId, decision.target].filter(Boolean),
          description: resolution.description,
          impact: resolution.changes,
          unintendedConsequences: resolution.unintendedConsequences,
          success: resolution.success,
          successLevel: resolution.successLevel
        };

        events.push(event);

        // Merge changes
        for (const [countryId, changes] of Object.entries(resolution.changes || {})) {
          if (!allChanges[countryId]) {
            allChanges[countryId] = {};
          }
          
          for (const [stat, value] of Object.entries(changes)) {
            allChanges[countryId][stat] = (allChanges[countryId][stat] || 0) + value;
          }
        }

        // Merge tension changes
        for (const [countryId, tensionValue] of Object.entries(resolution.newTensions || {})) {
          if (!allTensionChanges[decision.actorId]) {
            allTensionChanges[decision.actorId] = {};
          }
          allTensionChanges[decision.actorId][countryId] = tensionValue;
        }

        // Handle special actions
        await this.handleSpecialActions(worldState, decision, resolution);

      } catch (error) {
        console.error(`❌ Error resolving action for ${decision.actorId}:`, error.message);
        
        events.push({
          type: 'FAILED_ACTION',
          actors: [decision.actorId],
          description: `${decision.actorId}'s attempt to ${decision.specificAction} failed unexpectedly`,
          impact: {},
          success: false
        });
      }
    }

    return {
      events,
      changes: allChanges,
      tensionChanges: allTensionChanges
    };
  }

  prioritizeActions(decisions) {
    const priority = {
      'MILITARY': 1,
      'DIPLOMACY': 2,
      'ESPIONAGE': 3,
      'INTERNAL': 4
    };

    return decisions.sort((a, b) => 
      (priority[a.action] || 99) - (priority[b.action] || 99)
    );
  }

  mapActionToEventType(action, specificAction) {
    const mapping = {
      'declare_war': 'WAR',
      'ceasefire': 'PEACE',
      'form_alliance': 'ALLIANCE',
      'break_alliance': 'ALLIANCE_BROKEN',
      'invest_technology': 'INNOVATION',
      'stabilize': 'INTERNAL_REFORM',
      'reform_policy': 'REFORM',
      'sabotage': 'ESPIONAGE',
      'steal_technology': 'ESPIONAGE',
      'gather_intel': 'INTELLIGENCE'
    };

    return mapping[specificAction] || action;
  }

  async handleSpecialActions(worldState, decision, resolution) {
    // Handle alliance formation/breaking
    if (decision.specificAction === 'form_alliance' && resolution.success) {
      this.worldStateManager.updateAlliances(
        worldState,
        decision.actorId,
        decision.target,
        'FORM'
      );
    } else if (decision.specificAction === 'break_alliance') {
      this.worldStateManager.updateAlliances(
        worldState,
        decision.actorId,
        decision.target,
        'BREAK'
      );
    }

    // Handle war declaration
    if (decision.specificAction === 'declare_war') {
      // Wars involve allies
      const actor = worldState.countries.find(c => c.id === decision.actorId);
      const target = worldState.countries.find(c => c.id === decision.target);

      if (actor && target) {
        console.log(`⚔️ WAR: ${actor.name} declares war on ${target.name}!`);
        
        // Allied nations may join
        for (const allyId of target.alliances) {
          const ally = worldState.countries.find(c => c.id === allyId);
          if (ally && ally.stability > 40) {
            console.log(`🛡️ ${ally.name} joins the war to defend ${target.name}`);
          }
        }
      }
    }
  }

  async getActorConfig(actorId) {
    const config = await this.db.collection('agent_configs')
      .findOne({ simulationId: this.simulationId });

    if (!config) return null;

    return config.agents.find(a => a.countryId === actorId);
  }
}
