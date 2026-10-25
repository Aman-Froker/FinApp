import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info('mongodb connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export async function dbReady(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}
