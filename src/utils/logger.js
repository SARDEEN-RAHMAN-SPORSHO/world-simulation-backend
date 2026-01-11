/**
 * Event logging and persistence utilities
 */

export class Logger {
  constructor(db, simulationId) {
    this.db = db;
    this.simulationId = simulationId;
  }

  async logEvent(tick, year, eventData) {
    try {
      const logEntry = {
        simulationId: this.simulationId,
        tick,
        year,
        timestamp: new Date(),
        ...eventData
      };

      await this.db.collection('event_logs').insertOne(logEntry);
      
      // Also log to console for debugging
      console.log(`[Year ${year}, Tick ${tick}] ${eventData.eventType}: ${eventData.description || eventData.content}`);
    } catch (error) {
      console.error('❌ Failed to log event:', error.message);
    }
  }

  async logTick(tick, year, events, overseerInsights, philosophicalInsight, worldStateBefore, worldStateAfter) {
    try {
      const tickLog = {
        simulationId: this.simulationId,
        tick,
        year,
        timestamp: new Date(),
        eventType: 'TICK_SUMMARY',
        events: events.map(e => ({
          type: e.type,
          actors: e.actors,
          description: e.description
        })),
        overseerInsights,
        philosophicalInsight,
        stabilityIndex: overseerInsights?.stabilityIndex || 50,
        survingCountries: worldStateAfter.countries.filter(c => c.stability > 20).length,
        totalCountries: worldStateAfter.countries.length
      };

      await this.db.collection('event_logs').insertOne(tickLog);
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📅 TICK ${tick} COMPLETE - Year ${year}`);
      console.log(`📊 Stability Index: ${overseerInsights?.stabilityIndex || '??'}/100`);
      console.log(`🏛️ Surviving Nations: ${tickLog.survingCountries}/${tickLog.totalCountries}`);
      console.log(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.error('❌ Failed to log tick summary:', error.message);
    }
  }

  async logSimulationStart() {
    await this.logEvent(0, 0, {
      eventType: 'SIMULATION_START',
      description: 'World simulation has begun',
      content: 'The world of Terra Novus awakens. Nations prepare their strategies.'
    });
  }

  async logSimulationEnd(finalState, reason) {
    const survivors = finalState.countries.filter(c => c.stability > 20);
    
    await this.logEvent(finalState.tick, finalState.year, {
      eventType: 'SIMULATION_END',
      description: `Simulation ended: ${reason}`,
      content: `After ${finalState.year} years, the simulation concludes. Surviving nations: ${survivors.map(c => c.name).join(', ')}`,
      finalState: {
        stabilityIndex: finalState.metrics?.stabilityIndex,
        survivors: survivors.length,
        totalYears: finalState.year,
        dominantIdeology: survivors.length > 0 
          ? survivors.reduce((prev, curr) => curr.power > prev.power ? curr : prev).ideology
          : 'None - Total Collapse'
      }
    });
  }

  async getRecentLogs(limit = 50) {
    try {
      const logs = await this.db.collection('event_logs')
        .find({ simulationId: this.simulationId })
        .sort({ tick: -1 })
        .limit(limit)
        .toArray();
      
      return logs;
    } catch (error) {
      console.error('❌ Failed to retrieve logs:', error.message);
      return [];
    }
  }

  async getEventsByType(eventType, limit = 20) {
    try {
      const logs = await this.db.collection('event_logs')
        .find({ 
          simulationId: this.simulationId,
          eventType 
        })
        .sort({ tick: -1 })
        .limit(limit)
        .toArray();
      
      return logs;
    } catch (error) {
      console.error('❌ Failed to retrieve events by type:', error.message);
      return [];
    }
  }
}
