import { eq, lt, desc } from 'drizzle-orm';
import { db } from '../db/dbClient.js';
import { githubUsers, githubRepos } from '../db/schema.js';
import type { UserAnalysis, Repository } from '../types/github.js';

const CACHE_STALE_TIME_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000;

const inFlightRequests = new Map<string, Promise<UserAnalysis>>();

export const cacheStats = {
  hits: 0,
  misses: 0,
};

function isFresh(lastFetched: Date | null): boolean {
  if (!lastFetched) return false;
  const now = new Date();
  const diff = now.getTime() - lastFetched.getTime();
  return diff < CACHE_STALE_TIME_MS;
}

export async function getCachedUser(username: string): Promise<UserAnalysis | null> {
  const normalizedUsername = username.toLowerCase();

  try {
    const userRows = await db
      .select()
      .from(githubUsers)
      .where(eq(githubUsers.username, normalizedUsername))
      .limit(1);

    if (userRows.length === 0) {
      return null;
    }

    const userRow = userRows[0]!;

    if (!isFresh(userRow.scrapedAt)) {
      return null;
    }

    // For now, just return a simple cached indicator
    // Full repo analysis would require joining githubRepos by ownerLogin
    cacheStats.hits++;
    return {
      user: {
        login: userRow.username,
        name: userRow.name ?? undefined,
        avatarUrl: userRow.avatarUrl ?? undefined,
        url: `https://github.com/${userRow.username}`,
        company: userRow.company ?? undefined,
        blog: userRow.blog ?? undefined,
        location: userRow.location ?? undefined,
        email: userRow.email ?? undefined,
        bio: userRow.bio ?? undefined,
        twitterUsername: userRow.twitterUsername ?? undefined,
        linkedin: undefined,
        isHireable: userRow.hireable ?? undefined,
        websiteUrl: userRow.blog ?? undefined,
        followers: userRow.followers,
        following: userRow.following,
        createdAt: userRow.createdAt?.toISOString() ?? '',
        updatedAt: new Date().toISOString(),
      },
      repos: [],
      languageBreakdown: {},
      contributionCount: 0,
      uniqueSkills: [],
    };
  } catch (error: any) {
    console.error(`[CACHE] Error reading cached user ${username}: ${error.message}`);
    return null;
  }
}

export async function setCachedUser(username: string, analysis: UserAnalysis): Promise<void> {
  // This function is deprecated - pipeline now writes directly to githubUsers
  // Keeping it for compatibility but it's a no-op
  console.log(`[CACHE] setCachedUser called for ${username} (no-op, use githubUsers instead)`);
}

export async function getOrSetCache(
  username: string,
  fetcher: () => Promise<UserAnalysis>
): Promise<UserAnalysis> {
  const normalizedUsername = username.toLowerCase();

  const existingPromise = inFlightRequests.get(normalizedUsername);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = fetcher();
  inFlightRequests.set(normalizedUsername, promise);

  promise
    .then(() => {
      inFlightRequests.delete(normalizedUsername);
    })
    .catch(() => {
      inFlightRequests.delete(normalizedUsername);
    });

  return promise;
}

export async function cleanupStaleUsers(): Promise<number> {
  const threshold = new Date(Date.now() - CLEANUP_THRESHOLD_MS);

  // Cleanup is now a no-op since we write to githubUsers
  console.log(`[CACHE] Cleanup stale users (no-op, use githubUsers instead)`);
  return 0;
}

export function getCacheStats() {
  return { ...cacheStats };
}

export function resetCacheStats() {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
}
