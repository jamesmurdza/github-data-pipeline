// src/lib/redis.ts
import { redisConnection } from '../queue/queue.js';

/**
 * Standardized Redis client instance.
 * Re-exports the connection from the queue module which handles
 * both TCP (ioredis) and REST (Upstash) fallbacks automatically.
 */
export const redis = redisConnection;
