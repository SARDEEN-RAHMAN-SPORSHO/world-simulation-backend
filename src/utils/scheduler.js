import cron from 'node-cron';

export class SimulationScheduler {
  constructor() {
    this.jobs = new Map();
  }

  scheduleSimulation(simulationId, simulator, tickIntervalMinutes = 5) {
    // Create cron expression for the interval
    // For intervals less than 60 minutes, use minute-based scheduling
    const cronExpression = tickIntervalMinutes < 60
      ? `*/${tickIntervalMinutes} * * * *`  // Every N minutes
      : '0 * * * *';  // Every hour if 60+ minutes

    console.log(`📅 Scheduling simulation ${simulationId} with interval: ${tickIntervalMinutes} minutes`);
    console.log(`📅 Cron expression: ${cronExpression}`);

    const job = cron.schedule(cronExpression, async () => {
      try {
        await simulator.executeTick();
      } catch (error) {
        console.error(`❌ Scheduled tick execution failed for ${simulationId}:`, error.message);
      }
    }, {
      scheduled: false // Don't start immediately
    });

    this.jobs.set(simulationId, job);
    return job;
  }

  startSimulation(simulationId) {
    const job = this.jobs.get(simulationId);
    if (job) {
      job.start();
      console.log(`▶️ Started simulation ${simulationId}`);
      return true;
    }
    console.warn(`⚠️ No scheduled job found for simulation ${simulationId}`);
    return false;
  }

  pauseSimulation(simulationId) {
    const job = this.jobs.get(simulationId);
    if (job) {
      job.stop();
      console.log(`⏸️ Paused simulation ${simulationId}`);
      return true;
    }
    return false;
  }

  stopSimulation(simulationId) {
    const job = this.jobs.get(simulationId);
    if (job) {
      job.stop();
      job.destroy();
      this.jobs.delete(simulationId);
      console.log(`⏹️ Stopped and removed simulation ${simulationId}`);
      return true;
    }
    return false;
  }

  isRunning(simulationId) {
    return this.jobs.has(simulationId);
  }

  getAllActiveSimulations() {
    return Array.from(this.jobs.keys());
  }
}

export const scheduler = new SimulationScheduler();
