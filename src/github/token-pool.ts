// src/github/token-pool.ts
// Unified GitHub token pool management - single source of truth

import { config } from '../utils/config.js';
import { redisConnection } from '../queue/queue.js';

export interface TokenData {
  token: string;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
}

const RATE_LIMIT_KEY_PREFIX = 'github:rate_limit:';
const DEFAULT_RATE_LIMIT = 5000; // GitHub's default for authenticated requests

// In-memory token state (hydrated from Redis on first access)
const tokens: TokenData[] = config.githubTokens.map((token: string) => ({
  token,
  remaining: DEFAULT_RATE_LIMIT,
  resetTime: 0,
}));

let initialized = false;

// Get a consistent Redis key for a token (using index for predictability)
function getRedisKey(tokenIndex: number): string {
  return `${RATE_LIMIT_KEY_PREFIX}${tokenIndex}`;
}

// Load token data from Redis on startup
async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  try {
    for (let i = 0; i < tokens.length; i++) {
      const key = getRedisKey(i);
      const data = await redisConnection.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        const tokenEntry = tokens[i];
        if (tokenEntry) {
          tokenEntry.remaining = parsed.remaining;
          tokenEntry.resetTime = parsed.resetTime;
        }
      }
    }
  } catch (error) {
    console.warn('Redis not available for token persistence, using in-memory only');
  }

  initialized = true;
}

// Save token data to Redis
async function saveTokenToRedis(tokenIndex: number, tokenData: TokenData): Promise<void> {
  try {
    const key = getRedisKey(tokenIndex);
    const ttl = Math.max(3600, tokenData.resetTime - Math.floor(Date.now() / 1000) + 60);
    await redisConnection.setex(key, ttl, JSON.stringify({
      remaining: tokenData.remaining,
      resetTime: tokenData.resetTime,
    }));
  } catch (error) {
    // Redis write failed, continue with in-memory only
  }
}

/**
 * Get the best available token (highest remaining quota)
 * Resets tokens that have passed their reset time
 */
export async function getBestToken(): Promise<TokenData> {
  await ensureInitialized();

  const now = Math.floor(Date.now() / 1000);

  // Reset tokens that have passed their reset time
  for (let i = 0; i < tokens.length; i++) {
    const tokenEntry = tokens[i];
    if (tokenEntry && tokenEntry.resetTime > 0 && tokenEntry.resetTime < now) {
      tokenEntry.remaining = DEFAULT_RATE_LIMIT;
      tokenEntry.resetTime = 0;
      await saveTokenToRedis(i, tokenEntry);
    }
  }

  // Find token with most remaining requests
  let bestIndex = 0;
  let highestRemaining = -1;

  for (let i = 0; i < tokens.length; i++) {
    const tokenEntry = tokens[i];
    if (tokenEntry && tokenEntry.remaining > highestRemaining) {
      highestRemaining = tokenEntry.remaining;
      bestIndex = i;
    }
  }

  const bestToken = tokens[bestIndex];

  if (!bestToken || bestToken.remaining <= 0) {
    throw new Error('rate-limited');
  }

  return {
    token: bestToken.token,
    remaining: bestToken.remaining,
    resetTime: bestToken.resetTime,
  };
}

/**
 * Get a token by index with its current rate limit info
 */
export async function getTokenByIndex(index: number): Promise<TokenData | null> {
  await ensureInitialized();

  if (index < 0 || index >= tokens.length) {
    return null;
  }

  const tokenEntry = tokens[index];
  if (!tokenEntry) {
    return null;
  }

  return {
    token: tokenEntry.token,
    remaining: tokenEntry.remaining,
    resetTime: tokenEntry.resetTime,
  };
}

/**
 * Update token usage after an API call
 * @param token - The token string
 * @param remaining - Remaining requests from API response headers
 * @param resetTime - Reset time from API response headers (Unix timestamp)
 */
export async function updateTokenUsage(
  token: string,
  remaining: number,
  resetTime: number
): Promise<void> {
  await ensureInitialized();

  const index = tokens.findIndex(t => t.token === token);
  if (index === -1) return;

  const tokenEntry = tokens[index];
  if (!tokenEntry) return;

  tokenEntry.remaining = remaining;
  tokenEntry.resetTime = resetTime;

  await saveTokenToRedis(index, tokenEntry);
}

/**
 * Update token usage by index (for GraphQL client)
 */
export async function updateTokenUsageByIndex(
  index: number,
  remaining: number,
  resetTime: number
): Promise<void> {
  await ensureInitialized();

  if (index < 0 || index >= tokens.length) return;

  const tokenEntry = tokens[index];
  if (!tokenEntry) return;

  tokenEntry.remaining = remaining;
  tokenEntry.resetTime = resetTime;

  await saveTokenToRedis(index, tokenEntry);
}

/**
 * Get the total number of configured tokens
 */
export function getTokenCount(): number {
  return tokens.length;
}
