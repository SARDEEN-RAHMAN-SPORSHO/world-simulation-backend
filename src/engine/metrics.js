import { clampValue } from '../db/models.js';

/**
 * Calculates world stability metrics
 */
export function calculateStabilityIndex(worldState) {
  const countries = worldState.countries;
  
  if (countries.length === 0) {
    return {
      stabilityIndex: 0,
      explanation: 'No countries exist',
      ideologicalDiversity: 0,
      conflictLevel: 0,
      survivalRate: 0
    };
  }

  // Calculate average stability
  const avgStability = countries.reduce((sum, c) => sum + c.stability, 0) / countries.length;
  
  // Calculate power variance (high variance = unstable power dynamics)
  const avgPower = countries.reduce((sum, c) => sum + c.power, 0) / countries.length;
  const powerVariance = countries.reduce((sum, c) => 
    sum + Math.pow(c.power - avgPower, 2), 0
  ) / countries.length;
  
  // Normalize power variance (0-100 scale)
  const normalizedPowerVariance = Math.min(100, (powerVariance / 400) * 100);
  
  // Calculate conflict level based on tensions
  let totalTensions = 0;
  let tensionCount = 0;
  
  countries.forEach(c => {
    Object.values(c.tensions || {}).forEach(tension => {
      if (tension < 0) {
        totalTensions += Math.abs(tension);
        tensionCount++;
      }
    });
  });
  
  const avgTension = tensionCount > 0 ? totalTensions / tensionCount : 0;
  const conflictLevel = clampValue(avgTension, 0, 100);
  
  // Calculate ideological diversity (unique ideologies)
  const uniqueIdeologies = new Set(countries.map(c => c.ideology)).size;
  const ideologicalDiversity = (uniqueIdeologies / countries.length) * 100;
  
  // Calculate survival rate
  const survivingCountries = countries.filter(c => c.stability > 20).length;
  const survivalRate = (survivingCountries / countries.length) * 100;
  
  // Overall stability index
  // Higher stability = good internal cohesion, but we penalize extreme power imbalance
  // and reward survival rate
  const stabilityIndex = clampValue(
    (avgStability * 0.4) +
    (survivalRate * 0.3) +
    ((100 - conflictLevel) * 0.2) +
    ((100 - normalizedPowerVariance) * 0.1),
    0,
    100
  );
  
  return {
    stabilityIndex: Math.round(stabilityIndex),
    ideologicalDiversity: Math.round(ideologicalDiversity),
    conflictLevel: Math.round(conflictLevel),
    survivalRate: Math.round(survivalRate),
    avgStability: Math.round(avgStability),
    powerImbalance: Math.round(normalizedPowerVariance)
  };
}

/**
 * Determines if simulation should terminate
 */
export function shouldTerminate(worldState, maxYears = 1000) {
  // End condition 1: Time limit reached
  if (worldState.year >= maxYears) {
    return { terminate: true, reason: 'TIME_LIMIT', message: `Reached ${maxYears} year limit` };
  }
  
  // End condition 2: Only 1 nation with significant power remains
  const powerfulNations = worldState.countries.filter(c => c.power > 50 && c.stability > 30);
  if (powerfulNations.length === 1 && worldState.countries.length > 1) {
    return { 
      terminate: true, 
      reason: 'HEGEMONY', 
      message: `${powerfulNations[0].name} has achieved global hegemony` 
    };
  }
  
  // End condition 3: Total collapse - all nations have very low stability
  const survivingNations = worldState.countries.filter(c => c.stability > 20);
  if (survivingNations.length === 0) {
    return { 
      terminate: true, 
      reason: 'TOTAL_COLLAPSE', 
      message: 'All nations have collapsed into chaos' 
    };
  }
  
  // End condition 4: Perfect stability maintained for extended period
  const recentStability = worldState.globalEvents
    .slice(-20)
    .filter(e => e.type === 'TICK_SUMMARY')
    .map(e => e.stabilityIndex || 0);
  
  if (recentStability.length >= 20 && recentStability.every(s => s >= 95)) {
    return { 
      terminate: true, 
      reason: 'PERFECT_ORDER', 
      message: 'Perfect stability achieved and maintained - but at what cost?' 
    };
  }
  
  return { terminate: false };
}

/**
 * Applies environmental random events
 */
export function generateRandomEvent(worldState, tick) {
  // 10% chance of random event each tick
  if (Math.random() > 0.1) {
    return null;
  }
  
  const eventTypes = [
    {
      type: 'NATURAL_DISASTER',
      severity: 'MAJOR',
      description: () => {
        const victim = worldState.countries[Math.floor(Math.random() * worldState.countries.length)];
        return {
          type: 'NATURAL_DISASTER',
          actors: [victim.id],
          description: `A catastrophic natural disaster strikes ${victim.name}, devastating infrastructure and economy`,
          impact: {
            [victim.id]: { stability: -15, resources: -20, power: -10 }
          }
        };
      }
    },
    {
      type: 'TECHNOLOGICAL_BREAKTHROUGH',
      severity: 'MAJOR',
      description: () => {
        const beneficiary = worldState.countries[Math.floor(Math.random() * worldState.countries.length)];
        return {
          type: 'INNOVATION',
          actors: [beneficiary.id],
          description: `Scientists in ${beneficiary.name} achieve a major technological breakthrough, advancing their capabilities`,
          impact: {
            [beneficiary.id]: { technology: 15, power: 10 }
          }
        };
      }
    },
    {
      type: 'POPULAR_UPRISING',
      severity: 'CRITICAL',
      description: () => {
        const unstableCountries = worldState.countries.filter(c => c.stability < 60);
        if (unstableCountries.length === 0) return null;
        
        const victim = unstableCountries[Math.floor(Math.random() * unstableCountries.length)];
        return {
          type: 'REBELLION',
          actors: [victim.id],
          description: `Popular uprising in ${victim.name}! Citizens demand change and challenge government authority`,
          impact: {
            [victim.id]: { stability: -25, power: -15 }
          }
        };
      }
    },
    {
      type: 'RESOURCE_DISCOVERY',
      severity: 'MINOR',
      description: () => {
        const lucky = worldState.countries[Math.floor(Math.random() * worldState.countries.length)];
        return {
          type: 'RESOURCE_DISCOVERY',
          actors: [lucky.id],
          description: `Major resource deposits discovered in ${lucky.name}, boosting their economic potential`,
          impact: {
            [lucky.id]: { resources: 20, power: 5 }
          }
        };
      }
    }
  ];
  
  const chosen = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const event = chosen.description();
  
  if (!event) return null;
  
  event.tick = tick;
  event.year = worldState.year;
  
  return event;
}
