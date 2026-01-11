import { clampValue } from '../db/models.js';

/**
 * Manages and applies changes to world state
 */
export class WorldState {
  constructor(db, simulationId) {
    this.db = db;
    this.simulationId = simulationId;
  }

  async load() {
    const state = await this.db.collection('world_states')
      .findOne({ simulationId: this.simulationId });
    
    if (!state) {
      throw new Error(`No world state found for simulation ${this.simulationId}`);
    }
    
    return state;
  }

  async save(worldState) {
    worldState.updatedAt = new Date();
    
    await this.db.collection('world_states').updateOne(
      { simulationId: this.simulationId },
      { $set: worldState },
      { upsert: true }
    );
  }

  applyChanges(worldState, changes) {
    const newState = JSON.parse(JSON.stringify(worldState)); // Deep clone
    
    for (const [countryId, deltas] of Object.entries(changes)) {
      const country = newState.countries.find(c => c.id === countryId);
      
      if (!country) {
        console.warn(`⚠️ Country ${countryId} not found when applying changes`);
        continue;
      }

      // Apply deltas with clamping
      if (deltas.power !== undefined) {
        country.power = clampValue(country.power + deltas.power, 0, 100);
      }
      if (deltas.stability !== undefined) {
        country.stability = clampValue(country.stability + deltas.stability, 0, 100);
      }
      if (deltas.technology !== undefined) {
        country.technology = clampValue(country.technology + deltas.technology, 0, 100);
      }
      if (deltas.resources !== undefined) {
        country.resources = clampValue(country.resources + deltas.resources, 0, 100);
      }
      if (deltas.population !== undefined) {
        country.population = Math.max(0, country.population + deltas.population);
      }

      // Check for critical states
      if (country.stability < 20 && country.power < 30) {
        if (!country.collapsing) {
          country.collapsing = true;
          console.log(`⚠️ ${country.name} is on the brink of collapse!`);
        }
      } else {
        country.collapsing = false;
      }

      // Absolute collapse
      if (country.stability < 5) {
        console.log(`💥 ${country.name} has completely collapsed!`);
        country.power = Math.min(country.power, 20);
      }
    }

    return newState;
  }

  applyTensionChanges(worldState, tensionChanges) {
    for (const [countryId, tensions] of Object.entries(tensionChanges)) {
      const country = worldState.countries.find(c => c.id === countryId);
      
      if (!country) continue;

      for (const [targetId, delta] of Object.entries(tensions)) {
        if (!country.tensions) country.tensions = {};
        
        const currentTension = country.tensions[targetId] || 0;
        country.tensions[targetId] = clampValue(currentTension + delta, -100, 100);

        // Reciprocal tension (if A hates B more, B hates A more too, but not always equally)
        const target = worldState.countries.find(c => c.id === targetId);
        if (target) {
          if (!target.tensions) target.tensions = {};
          const reciprocalDelta = delta * 0.7; // 70% reciprocal
          const currentReciprocal = target.tensions[countryId] || 0;
          target.tensions[countryId] = clampValue(currentReciprocal + reciprocalDelta, -100, 100);
        }
      }
    }

    return worldState;
  }

  addEvent(worldState, event) {
    if (!worldState.globalEvents) {
      worldState.globalEvents = [];
    }

    event.tick = worldState.tick;
    event.year = worldState.year;
    
    worldState.globalEvents.push(event);

    // Keep only last 100 events in memory
    if (worldState.globalEvents.length > 100) {
      worldState.globalEvents = worldState.globalEvents.slice(-100);
    }

    return worldState;
  }

  addCountryHistory(worldState, countryId, historyEntry) {
    const country = worldState.countries.find(c => c.id === countryId);
    
    if (country) {
      if (!country.history) country.history = [];
      country.history.push(historyEntry);
      
      // Keep only last 10 history entries
      if (country.history.length > 10) {
        country.history = country.history.slice(-10);
      }
    }
  }

  updateAlliances(worldState, country1Id, country2Id, action) {
    const country1 = worldState.countries.find(c => c.id === country1Id);
    const country2 = worldState.countries.find(c => c.id === country2Id);

    if (!country1 || !country2) return worldState;

    if (action === 'FORM') {
      if (!country1.alliances.includes(country2Id)) {
        country1.alliances.push(country2Id);
      }
      if (!country2.alliances.includes(country1Id)) {
        country2.alliances.push(country1Id);
      }
      console.log(`🤝 Alliance formed: ${country1.name} ↔ ${country2.name}`);
    } else if (action === 'BREAK') {
      country1.alliances = country1.alliances.filter(id => id !== country2Id);
      country2.alliances = country2.alliances.filter(id => id !== country1Id);
      console.log(`💔 Alliance broken: ${country1.name} ✗ ${country2.name}`);
    }

    return worldState;
  }

  getCountryByName(worldState, name) {
    return worldState.countries.find(c => 
      c.name.toLowerCase() === name.toLowerCase() ||
      c.id.toLowerCase() === name.toLowerCase()
    );
  }

  getSurvivingCountries(worldState) {
    return worldState.countries.filter(c => c.stability > 20);
  }

  getDominantPower(worldState) {
    if (worldState.countries.length === 0) return null;
    
    return worldState.countries.reduce((prev, curr) => 
      (curr.power > prev.power) ? curr : prev
    );
  }

  getAverageStat(worldState, stat) {
    if (worldState.countries.length === 0) return 0;
    
    const sum = worldState.countries.reduce((acc, c) => acc + (c[stat] || 0), 0);
    return sum / worldState.countries.length;
  }
}
