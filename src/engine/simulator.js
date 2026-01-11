import { AgentManager } from '../agents/agentManager.js';
import { EventResolver } from './eventResolver.js';
import { WorldState } from './worldState.js';
import { Logger } from '../utils/logger.js';
import { 
  calculateStabilityIndex, 
  shouldTerminate, 
  generateRandomEvent 
} from './metrics.js';

/**
 * Main simulation engine - orchestrates the world simulation
 */
export class WorldSimulator {
  constructor(simulationId, db) {
    this.simulationId = simulationId;
    this.db = db;
    this.agentManager = new AgentManager(simulationId, db);
    this.eventResolver = new EventResolver(db, simulationId, this.agentManager);
    this.worldStateManager = new WorldState(db, simulationId);
    this.logger = new Logger(db, simulationId);
    this.isRunning = false;
    this.tickInterval = null;
  }

  async initialize() {
    console.log(`\n🌍 Initializing World Simulator for ${this.simulationId}`);
    await this.agentManager.initialize();
    console.log(`✅ Simulator ready\n`);
  }

  async start(tickDurationMs = 300000) { // 5 minutes default
    if (this.isRunning) {
      console.log('⚠️ Simulation already running');
      return;
    }

    await this.initialize();
    this.isRunning = true;

    console.log(`▶️ Starting simulation with ${tickDurationMs}ms interval`);
    
    // Execute first tick immediately
    await this.executeTick();

    // Schedule subsequent ticks
    this.tickInterval = setInterval(async () => {
      try {
        await this.executeTick();
      } catch (error) {
        console.error('❌ Tick execution error:', error);
      }
    }, tickDurationMs);
  }

  async executeTick() {
    try {
      console.log(`\n${'━'.repeat(80)}`);
      console.log(`⏰ EXECUTING TICK`);
      console.log(`${'━'.repeat(80)}\n`);

      // Load current world state
      let worldState = await this.worldStateManager.load();

      // Check if simulation should stop
      if (worldState.status !== 'RUNNING') {
        console.log(`⏹️ Simulation status is ${worldState.status}, stopping...`);
        this.pause();
        return;
      }

      console.log(`📅 Year ${worldState.year} | Tick ${worldState.tick}`);

      // PHASE 1: Generate random events (10% chance)
      const randomEvent = generateRandomEvent(worldState, worldState.tick);
      if (randomEvent) {
        console.log(`🎲 Random Event: ${randomEvent.description}`);
        worldState = this.worldStateManager.addEvent(worldState, randomEvent);
        
        // Apply random event impacts
        if (randomEvent.impact) {
          worldState = this.worldStateManager.applyChanges(worldState, randomEvent.impact);
        }
      }

      // PHASE 2: Agents observe and decide
      console.log(`\n🤖 Collecting agent decisions...`);
      const agentDecisions = await this.agentManager.collectDecisions(worldState);
      console.log(`✅ Collected ${agentDecisions.length} decisions\n`);

      // PHASE 3: Resolve actions
      console.log(`⚙️ Resolving actions...`);
      const resolutionResult = await this.eventResolver.resolveActions(
        worldState,
        agentDecisions
      );
      console.log(`✅ Resolved ${resolutionResult.events.length} events\n`);

      // PHASE 4: Apply changes to world state
      worldState = this.worldStateManager.applyChanges(worldState, resolutionResult.changes);
      worldState = this.worldStateManager.applyTensionChanges(worldState, resolutionResult.tensionChanges);

      // Add events to world state
      for (const event of resolutionResult.events) {
        worldState = this.worldStateManager.addEvent(worldState, event);
      }

      // PHASE 5: Overseer analysis
      console.log(`📊 Overseer analyzing world state...`);
      const overseerInsights = await this.agentManager.getOverseerAnalysis(worldState);
      
      // Calculate additional metrics
      const calculatedMetrics = calculateStabilityIndex(worldState);
      
      worldState.metrics = {
        ...overseerInsights,
        ...calculatedMetrics
      };
      
      console.log(`✅ Stability Index: ${worldState.metrics.stabilityIndex}/100`);
      console.log(`   ${overseerInsights.explanation}\n`);

      // PHASE 6: Philosophical commentary
      console.log(`💭 Philosophical thinker reflecting...`);
      const philosophicalInsight = await this.agentManager.getThinkerCommentary(
        worldState,
        resolutionResult.events
      );
      
      if (philosophicalInsight) {
        console.log(`✅ ${philosophicalInsight.philosophicalQuestion}\n`);
      }

      // PHASE 7: Strategic analysis (optional, run every 5 ticks)
      let strategistInsight = null;
      if (worldState.tick % 5 === 0) {
        console.log(`⚔️ Strategist analyzing conflicts...`);
        strategistInsight = await this.agentManager.getStrategistAnalysis(worldState);
      }

      // PHASE 8: Save state and log
      await this.worldStateManager.save(worldState);
      
      await this.logger.logTick(
        worldState.tick,
        worldState.year,
        resolutionResult.events,
        overseerInsights,
        philosophicalInsight,
        null, // worldStateBefore (omitted to save space)
        worldState
      );

      // PHASE 9: Advance time
      worldState.tick += 1;
      worldState.year += 1;
      await this.worldStateManager.save(worldState);

      // PHASE 10: Check termination conditions
      const terminationCheck = shouldTerminate(worldState, 1000);
      if (terminationCheck.terminate) {
        console.log(`\n🏁 TERMINATION CONDITION MET: ${terminationCheck.reason}`);
        console.log(`   ${terminationCheck.message}\n`);
        await this.complete(terminationCheck.reason);
      }

      // Display summary
      this.displayTickSummary(worldState);

    } catch (error) {
      console.error('❌ Fatal error in tick execution:', error);
      
      // Try to mark simulation as failed
      try {
        await this.db.collection('world_states').updateOne(
          { simulationId: this.simulationId },
          { $set: { status: 'FAILED', error: error.message } }
        );
      } catch (dbError) {
        console.error('❌ Failed to update simulation status:', dbError);
      }
      
      this.pause();
    }
  }

  displayTickSummary(worldState) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 TICK ${worldState.tick - 1} SUMMARY - Year ${worldState.year - 1}`);
    console.log(`${'─'.repeat(80)}`);
    
    const surviving = this.worldStateManager.getSurvivingCountries(worldState);
    const dominant = this.worldStateManager.getDominantPower(worldState);
    
    console.log(`🏛️  Nations Status:`);
    worldState.countries.forEach(c => {
      const status = c.stability < 20 ? '💀' : c.stability < 50 ? '⚠️ ' : '✅';
      console.log(`   ${status} ${c.name.padEnd(25)} | Power: ${String(c.power).padStart(3)} | Stability: ${String(c.stability).padStart(3)} | Tech: ${String(c.technology).padStart(3)}`);
    });
    
    console.log(`\n📈 Global Metrics:`);
    console.log(`   Stability Index: ${worldState.metrics.stabilityIndex}/100`);
    console.log(`   Surviving Nations: ${surviving.length}/${worldState.countries.length}`);
    console.log(`   Conflict Level: ${worldState.metrics.conflictLevel}/100`);
    console.log(`   Dominant Power: ${dominant?.name || 'None'}`);
    console.log(`${'─'.repeat(80)}\n`);
  }

  pause() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
    console.log('⏸️ Simulation paused');
  }

  async complete(reason) {
    this.pause();
    
    const worldState = await this.worldStateManager.load();
    worldState.status = 'COMPLETED';
    await this.worldStateManager.save(worldState);
    
    await this.logger.logSimulationEnd(worldState, reason);
    
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🏁 SIMULATION COMPLETED: ${this.simulationId}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Total Years: ${worldState.year}`);
    console.log(`   Final Stability: ${worldState.metrics.stabilityIndex}/100`);
    console.log(`${'═'.repeat(80)}\n`);
  }

  getStatus() {
    return {
      simulationId: this.simulationId,
      isRunning: this.isRunning
    };
  }
}
