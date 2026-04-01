import { describe, it, expect } from 'vitest';
import { computeScore, deriveExperienceLevel } from './scoring';
import type { UserAnalysis, User, Repository } from './github';

// Helper to create a mock user
function createMockUser(overrides: Partial<User> = {}): User {
  return {
    login: 'testuser',
    name: 'Test User',
    avatarUrl: 'https://github.com/testuser.png',
    url: 'https://github.com/testuser',
    followers: 100,
    following: 50,
    createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// Helper to create a mock repository
function createMockRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'test-repo',
    ownerLogin: 'owner',
    stargazerCount: 100,
    primaryLanguage: 'TypeScript',
    pushedAt: '2024-01-01T00:00:00Z',
    isFork: false,
    mergedPrCount: 50,
    mergedPrsByUserCount: 5,
    topics: [],
    languages: ['TypeScript', 'JavaScript'],
    ...overrides,
  };
}

// Helper to create a mock UserAnalysis
function createMockAnalysis(repos: Repository[] = [], userOverrides: Partial<User> = {}): UserAnalysis {
  return {
    user: createMockUser(userOverrides),
    repos,
    languageBreakdown: {},
    contributionCount: repos.reduce((sum, r) => sum + r.mergedPrsByUserCount, 0),
    uniqueSkills: [],
  };
}

describe('deriveExperienceLevel', () => {
  it('returns "Newcomer" for score < 10', () => {
    expect(deriveExperienceLevel(0)).toBe('Newcomer');
    expect(deriveExperienceLevel(5)).toBe('Newcomer');
    expect(deriveExperienceLevel(9.9)).toBe('Newcomer');
  });

  it('returns "Contributor" for score 10-99', () => {
    expect(deriveExperienceLevel(10)).toBe('Contributor');
    expect(deriveExperienceLevel(50)).toBe('Contributor');
    expect(deriveExperienceLevel(99)).toBe('Contributor');
  });

  it('returns "Active Contributor" for score 100-499', () => {
    expect(deriveExperienceLevel(100)).toBe('Active Contributor');
    expect(deriveExperienceLevel(250)).toBe('Active Contributor');
    expect(deriveExperienceLevel(499)).toBe('Active Contributor');
  });

  it('returns "Core Contributor" for score 500-1999', () => {
    expect(deriveExperienceLevel(500)).toBe('Core Contributor');
    expect(deriveExperienceLevel(1000)).toBe('Core Contributor');
    expect(deriveExperienceLevel(1999)).toBe('Core Contributor');
  });

  it('returns "Open Source Leader" for score >= 2000', () => {
    expect(deriveExperienceLevel(2000)).toBe('Open Source Leader');
    expect(deriveExperienceLevel(10000)).toBe('Open Source Leader');
  });
});

describe('computeScore', () => {
  it('returns zero score for user with no repos', () => {
    const analysis = createMockAnalysis([]);
    const result = computeScore(analysis);

    expect(result.totalScore).toBe(0);
    expect(result.aiScore).toBe(0);
    expect(result.backendScore).toBe(0);
    expect(result.frontendScore).toBe(0);
    expect(result.devopsScore).toBe(0);
    expect(result.dataScore).toBe(0);
    expect(result.experienceLevel).toBe('Newcomer');
  });

  it('ignores repos with < 10 stars', () => {
    const repos = [
      createMockRepo({ stargazerCount: 5, mergedPrsByUserCount: 10, mergedPrCount: 20 }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.totalScore).toBe(0);
  });

  it('ignores repos with 0 total PRs', () => {
    const repos = [
      createMockRepo({ stargazerCount: 1000, mergedPrsByUserCount: 5, mergedPrCount: 0 }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.totalScore).toBe(0);
  });

  it('calculates score based on stars * (userPRs / totalPRs)', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 1000,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    // Expected: 1000 * (10 / 100) = 100
    expect(result.totalScore).toBe(100);
    expect(result.experienceLevel).toBe('Active Contributor');
  });

  it('caps individual repo score at 10,000', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 100000,
        mergedPrsByUserCount: 50,
        mergedPrCount: 100,
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    // Raw: 100000 * (50/100) = 50000, capped at 10000
    expect(result.totalScore).toBe(10000);
  });

  it('categorizes AI repos correctly via topics', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 100,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
        topics: ['machine-learning', 'tensorflow'],
        primaryLanguage: 'Python',
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.aiScore).toBe(10); // 100 * (10/100) = 10
    expect(result.backendScore).toBe(0);
  });

  it('categorizes Frontend repos via topics', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 200,
        mergedPrsByUserCount: 20,
        mergedPrCount: 100,
        topics: ['react', 'frontend'],
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.frontendScore).toBe(40); // 200 * (20/100) = 40
  });

  it('categorizes via language hints when no topics match', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 100,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
        topics: [],
        primaryLanguage: 'Go',
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    // Go maps to Backend
    expect(result.backendScore).toBe(10);
  });

  it('categorizes Shell/Dockerfile as DevOps', () => {
    const repos = [
      createMockRepo({
        stargazerCount: 100,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
        topics: [],
        primaryLanguage: 'Shell',
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.devopsScore).toBe(10);
  });

  it('returns top 10 repositories sorted by score', () => {
    const repos = Array.from({ length: 15 }, (_, i) =>
      createMockRepo({
        name: `repo-${i}`,
        stargazerCount: (i + 1) * 100,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
      })
    );
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.topRepositories.length).toBe(10);
    // Highest score first (repo-14 has 1500 stars -> score 150)
    expect(result.topRepositories[0].name).toBe('repo-14');
    expect(result.topRepositories[0].score).toBe(150);
  });

  it('aggregates scores from multiple repos', () => {
    const repos = [
      createMockRepo({
        name: 'repo-1',
        stargazerCount: 100,
        mergedPrsByUserCount: 10,
        mergedPrCount: 100,
      }),
      createMockRepo({
        name: 'repo-2',
        stargazerCount: 200,
        mergedPrsByUserCount: 20,
        mergedPrCount: 100,
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    // repo-1: 100 * (10/100) = 10
    // repo-2: 200 * (20/100) = 40
    // total: 50
    expect(result.totalScore).toBe(50);
  });

  it('collects unique skills from contributing repos', () => {
    const repos = [
      createMockRepo({
        mergedPrsByUserCount: 5,
        primaryLanguage: 'TypeScript',
        languages: ['TypeScript', 'JavaScript'],
        topics: ['react', 'frontend'],
      }),
    ];
    const analysis = createMockAnalysis(repos);
    const result = computeScore(analysis);

    expect(result.uniqueSkills).toContain('typescript');
    expect(result.uniqueSkills).toContain('javascript');
    expect(result.uniqueSkills).toContain('react');
    expect(result.uniqueSkills).toContain('frontend');
  });

  it('preserves original user data in result', () => {
    const analysis = createMockAnalysis([], { login: 'myuser', name: 'My User' });
    const result = computeScore(analysis);

    expect(result.user.login).toBe('myuser');
    expect(result.user.name).toBe('My User');
  });
});
