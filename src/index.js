import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db/connection.js';
import { WorldSimulator } from './engine/simulator.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory storage for active simulations
const activeSimulations = new Map();

// Database connection
let db;

// Initialize DB connection
(async () => {
  try {
    db = await connectDB();
    console.log('✅ Database connected and ready');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
})();

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'alive',
    activeSimulations: activeSimulations.size,
    timestamp: new Date().toISOString()
  });
});

/**
 * Create new simulation
 */
app.post('/api/simulation/create', async (req, res) => {
  try {
    const { apiKeys, durationHours, tickIntervalMinutes } = req.body;

    // Validate input
    if (!apiKeys || !apiKeys.overseer || !apiKeys.leaders || apiKeys.leaders.length === 0) {
      return res.status(400).json({ error: 'Missing required API keys' });
    }

    const simulationId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Load world initialization data
    const worldInitPath = join(__dirname, '../config/world-init.json');
    const worldInit = JSON.parse(readFileSync(worldInitPath, 'utf-8'));

    // Initialize world state
    await db.collection('world_states').insertOne({
      simulationId,
      tick: 0,
      year: 0,
      worldName: worldInit.worldName,
      description: worldInit.description,
      countries: worldInit.countries,
      globalEvents: [],
      metrics: {
        stabilityIndex: 50,
        explanation: 'Initial state',
        ideologicalDiversity: 100,
        conflictLevel: 35,
        survivalRate: 100
      },
      status: 'RUNNING',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Store agent configurations
    const agents = [
      { 
        id: 'overseer', 
        role: 'OVERSEER', 
        apiKey: apiKeys.overseer,
        countryId: null,
        personality: 'Neutral observer',
        memory: [],
        decisionHistory: []
      },
      ...apiKeys.leaders.filter(key => key && key.trim()).map((key, idx) => ({
        id: `leader_${idx}`,
        role: 'LEADER',
        apiKey: key,
        countryId: worldInit.countries[idx]?.id,
        personality: `Leader of ${worldInit.countries[idx]?.name}`,
        memory: [],
        decisionHistory: []
      })),
    ];

    if (apiKeys.thinker) {
      agents.push({
        id: 'thinker',
        role: 'THINKER',
        apiKey: apiKeys.thinker,
        countryId: null,
        personality: 'Philosophical observer',
        memory: [],
        decisionHistory: []
      });
    }

    if (apiKeys.strategist) {
      agents.push({
        id: 'strategist',
        role: 'STRATEGIST',
        apiKey: apiKeys.strategist,
        countryId: null,
        personality: 'Military analyst',
        memory: [],
        decisionHistory: []
      });
    }

    await db.collection('agent_configs').insertOne({
      simulationId,
      agents
    });

    // Create simulator
    const simulator = new WorldSimulator(simulationId, db);
    activeSimulations.set(simulationId, simulator);

    // Start simulation
    const intervalMs = (tickIntervalMinutes || 5) * 60 * 1000;
    await simulator.start(intervalMs);

    // Schedule auto-stop
    if (durationHours) {
      setTimeout(async () => {
        const sim = activeSimulations.get(simulationId);
        if (sim) {
          await sim.complete('DURATION_LIMIT');
        }
      }, durationHours * 60 * 60 * 1000);
    }

    console.log(`✅ Simulation created: ${simulationId}`);
    console.log(`   Duration: ${durationHours || 'unlimited'} hours`);
    console.log(`   Tick interval: ${tickIntervalMinutes || 5} minutes`);

    res.json({
      simulationId,
      status: 'STARTED',
      worldName: worldInit.worldName,
      countries: worldInit.countries.length,
      tickIntervalMinutes: tickIntervalMinutes || 5,
      durationHours: durationHours || null
    });

  } catch (error) {
    console.error('❌ Error creating simulation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pause simulation
 */
app.post('/api/simulation/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    const simulator = activeSimulations.get(id);

    if (!simulator) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    simulator.pause();

    await db.collection('world_states').updateOne(
      { simulationId: id },
      { $set: { status: 'PAUSED', updatedAt: new Date() } }
    );

    res.json({ simulationId: id, status: 'PAUSED' });
  } catch (error) {
    console.error('❌ Error pausing simulation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resume simulation
 */
app.post('/api/simulation/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    let simulator = activeSimulations.get(id);

    // If simulator doesn't exist in memory, recreate it
    if (!simulator) {
      const worldState = await db.collection('world_states').findOne({ simulationId: id });
      
      if (!worldState) {
        return res.status(404).json({ error: 'Simulation not found' });
      }

      simulator = new WorldSimulator(id, db);
      activeSimulations.set(id, simulator);
    }

    await db.collection('world_states').updateOne(
      { simulationId: id },
      { $set: { status: 'RUNNING', updatedAt: new Date() } }
    );

    await simulator.start();

    res.json({ simulationId: id, status: 'RUNNING' });
  } catch (error) {
    console.error('❌ Error resuming simulation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get simulation state
 */
app.get('/api/simulation/:id/state', async (req, res) => {
  try {
    const { id } = req.params;
    const state = await db.collection('world_states').findOne({ simulationId: id });

    if (!state) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    res.json(state);
  } catch (error) {
    console.error('❌ Error fetching state:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get simulation logs
 */
app.get('/api/simulation/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const eventType = req.query.type;

    const query = { simulationId: id };
    if (eventType) {
      query.eventType = eventType;
    }

    const logs = await db.collection('event_logs')
      .find(query)
      .sort({ tick: -1 })
      .limit(limit)
      .toArray();

    res.json({ simulationId: id, count: logs.length, logs });
  } catch (error) {
    console.error('❌ Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get simulation report
 */
app.get('/api/simulation/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    
    const state = await db.collection('world_states').findOne({ simulationId: id });
    if (!state) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    const logs = await db.collection('event_logs')
      .find({ simulationId: id })
      .sort({ tick: 1 })
      .toArray();

    const majorEvents = logs.filter(l => 
      ['WAR', 'COLLAPSE', 'ALLIANCE', 'REBELLION', 'INNOVATION'].includes(l.eventType)
    );

    const survivors = state.countries.filter(c => c.stability > 20);
    const dominant = survivors.reduce((prev, curr) => 
      curr.power > prev.power ? curr : prev, 
      survivors[0] || null
    );

    const report = {
      simulationId: id,
      worldName: state.worldName,
      status: state.status,
      duration: {
        years: state.year,
        ticks: state.tick
      },
      finalState: {
        stabilityIndex: state.metrics.stabilityIndex,
        explanation: state.metrics.explanation,
        survivors: survivors.length,
        totalCountries: state.countries.length,
        dominantPower: dominant?.name || 'None',
        dominantIdeology: dominant?.ideology || 'None'
      },
      countries: state.countries.map(c => ({
        name: c.name,
        ideology: c.ideology,
        survived: c.stability > 20,
        finalPower: c.power,
        finalStability: c.stability,
        finalTechnology: c.technology
      })),
      majorEvents: majorEvents.slice(0, 20).map(e => ({
        year: e.year,
        type: e.eventType,
        description: e.description || e.content
      })),
      philosophicalSummary: logs
        .filter(l => l.philosophicalInsight)
        .slice(-5)
        .map(l => l.philosophicalInsight.moralAnalysis || l.philosophicalInsight.philosophicalQuestion)
    };

    res.json(report);
  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all simulations
 */
app.get('/api/simulations', async (req, res) => {
  try {
    const simulations = await db.collection('world_states')
      .find({})
      .project({
        simulationId: 1,
        worldName: 1,
        status: 1,
        year: 1,
        tick: 1,
        'metrics.stabilityIndex': 1,
        createdAt: 1,
        updatedAt: 1
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({ simulations });
  } catch (error) {
    console.error('❌ Error listing simulations:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================================================
// SERVER START
// =============================================================================

app.listen(PORT, () => {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🚀 World Simulation Backend Server`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(80)}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⏹️ SIGTERM received, shutting down gracefully...');
  
  // Pause all active simulations
  for (const [id, sim] of activeSimulations.entries()) {
    console.log(`⏸️ Pausing simulation ${id}`);
    sim.pause();
  }
  
  process.exit(0);
});
