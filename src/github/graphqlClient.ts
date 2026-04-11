// src/github/graphqlClient.ts
// GitHub GraphQL client with caching and rate limit management

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { config } from '../utils/config.js';
import { redisConnection } from '../queue/queue.js';
import { getBestToken, updateTokenUsage, getTokenCount, TokenData } from './token-pool.js';

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_CACHE_KEY_PREFIX = 'github:cache';

interface GitHubGraphqlRequestOptions {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
  useCache?: boolean;
  cacheTTL?: number; // in seconds
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

class GitHubGraphqlClient {
  private axiosClient: AxiosInstance;

  constructor() {
    this.axiosClient = axios.create({
      baseURL: GITHUB_GRAPHQL_ENDPOINT,
      timeout: 10000,
    });

    if (getTokenCount() === 0) {
      throw new Error('No GitHub tokens found in environment variables. Please set GITHUB_TOKENS.');
    }
  }

  async request<T>(options: GitHubGraphqlRequestOptions): Promise<T> {
    const { query, variables, operationName, useCache = true, cacheTTL = 3600 } = options;

    // Caching logic
    let cacheKey = '';
    if (useCache) {
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ query, variables }))
        .digest('hex');
      cacheKey = `${GITHUB_CACHE_KEY_PREFIX}:${hash}`;

      try {
        const cachedResult = await redisConnection.get(cacheKey);
        if (cachedResult) {
          console.log(`Cache hit for query: ${operationName || 'unnamed'}`);
          return JSON.parse(cachedResult) as T;
        }
      } catch (error) {
        console.error('Error reading from Redis cache:', error);
      }
    }

    // Get best available token
    let tokenData: TokenData;
    try {
      tokenData = await getBestToken();
    } catch (error: any) {
      console.error('Error getting best GitHub token:', error.message);
      throw error;
    }

    this.axiosClient.defaults.headers.common['Authorization'] = `Bearer ${tokenData.token}`;

    try {
      const response: AxiosResponse<GraphQLResponse<T>> = await this.axiosClient.post('', {
        query,
        variables,
        operationName,
      });

      const responseHeaders = response.headers;
      const remaining = parseInt(responseHeaders['x-ratelimit-remaining'] || '0', 10);
      const resetTime = parseInt(responseHeaders['x-ratelimit-reset'] || '0', 10);
      const cost = parseInt(responseHeaders['x-ratelimit-cost'] || '1', 10);

      console.log(`GitHub API Request Cost: ${cost}, Remaining Rate Limit: ${remaining}`);

      // Update token usage in the unified token pool
      await updateTokenUsage(tokenData.token, remaining, resetTime);

      // Extract result
      let result: T;
      if (response.data && response.data.data) {
        result = response.data.data as T;
      } else {
        if (response.data.errors) {
          console.error('GitHub GraphQL API returned errors:', response.data.errors);
          throw new Error('GitHub GraphQL API errors: ' + JSON.stringify(response.data.errors));
        }
        result = response.data as unknown as T;
      }

      // Store in cache if enabled
      if (useCache && cacheKey) {
        try {
          await redisConnection.setex(cacheKey, cacheTTL, JSON.stringify(result));
          console.log(`Cached result for query: ${operationName || 'unnamed'} with TTL ${cacheTTL}s`);
        } catch (error) {
          console.error('Error writing to Redis cache:', error);
        }
      }

      return result;

    } catch (error: any) {
      console.error('GitHub GraphQL request failed:', error.message);

      if (error.response) {
        console.error('GitHub API Response Status:', error.response.status);
        console.error('GitHub API Response Data:', error.response.data);

        if (error.response.status === 403 && error.response.data?.message?.includes('rate limit exceeded')) {
          console.warn('Token is rate limited. Next request will use another token.');
          // Update this token as exhausted
          await updateTokenUsage(tokenData.token, 0, Math.floor(Date.now() / 1000) + 3600);
        } else if (error.response.status === 401) {
          console.error('GitHub authentication failed. Please check your token.');
        }
      }

      throw error;
    }
  }
}

// Instantiate the client
const gitHubGraphqlClient = new GitHubGraphqlClient();

export { gitHubGraphqlClient };
export type { GitHubGraphqlRequestOptions };
