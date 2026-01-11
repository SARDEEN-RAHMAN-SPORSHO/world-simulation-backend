import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client = null;
let db = null;

export async function connectDB() {
  if (db) return db;

  try {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db('world_simulation');

    console.log('✅ Connected to MongoDB');

    // Create indexes for better performance
    await db.collection('world_states').createIndex({ simulationId: 1 });
    await db.collection('agent_configs').createIndex({ simulationId: 1 });
    await db.collection('event_logs').createIndex({ simulationId: 1, tick: -1 });

    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

export async function closeDB() {
  if (client) {
    await client.close();
    console.log('🔒 MongoDB connection closed');
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});
