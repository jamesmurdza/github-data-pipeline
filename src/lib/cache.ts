// src/lib/cache.ts
import { redisConnection } from '../queue/queue.js';

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 30
): Promise<T> {
  try {
    const cached = await redisConnection.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis read failed, fall through to fetcher
  }

  const data = await fetcher();

  try {
    await redisConnection.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Redis write failed, continue without caching
  }

  return data;
}
