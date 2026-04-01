# GitHub Data Pipeline

A data pipeline for fetching, analyzing, and scoring GitHub user profiles based on their open source contributions.

## Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables (see below)
cp .env.example .env

# Push database schema
pnpm db:push
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GITHUB_TOKENS` | Yes* | Comma-separated GitHub PATs |
| `GITHUB_TOKEN_1` ... `GITHUB_TOKEN_5` | Yes* | Individual GitHub PATs (alternative to `GITHUB_TOKENS`) |
| `REDIS_URL` | No | Redis connection string (falls back to in-memory) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash REST API token |

*At least one GitHub token is required via either `GITHUB_TOKENS` or `GITHUB_TOKEN_N`.

## Usage

### CLI

```bash
# Development mode (watch)
pnpm dev

# Production
pnpm build
pnpm start
```

### Bulk Discovery

Discover and analyze GitHub users by location:

```bash
# Basic usage - discovers users in Sydney
pnpm bulk-discover Sydney

# With pagination options
pnpm bulk-discover <location> <startRangeIndex> <startPage>

# Example: Start from range index 5, page 2
pnpm bulk-discover "San Francisco" 5 2
```

The bulk discovery process:
1. Searches GitHub users by location across follower ranges
2. Fetches detailed profile and contribution data via GraphQL
3. Computes scores based on contributions to starred repositories
4. Stores results in PostgreSQL

## Project Structure

```
src/
├── cli.ts              # Main CLI entry point
├── bulk-discover.ts    # Bulk user discovery script
│
├── db/
│   ├── dbClient.ts     # Drizzle ORM client
│   └── schema.ts       # Database schema (analyses, leaderboard)
│
├── queue/
│   └── queue.ts        # Redis connection + BullMQ worker
│
├── services/
│   ├── github.ts       # GitHub GraphQL API client
│   ├── pat-pool.ts     # GitHub token pool with rate limit tracking
│   └── scoring.ts      # User scoring algorithm
│
└── utils/
    └── config.ts       # Environment config with Zod validation
```

## Scoring Algorithm

Users are scored based on their contributions to repositories with 10+ stars:

```
repo_score = stars × (user_merged_prs / total_merged_prs)
```

- Individual repo scores are capped at 10,000
- Repos are categorized: AI, Backend, Frontend, DevOps, Data
- Categories are determined by topics and primary language

### Experience Levels

| Score | Level |
|-------|-------|
| 0-9 | Newcomer |
| 10-99 | Contributor |
| 100-499 | Active Contributor |
| 500-1999 | Core Contributor |
| 2000+ | Open Source Leader |

## Database Schema

### `analyses`
Cached user analysis data with scores and metadata.

### `leaderboard`
Aggregated leaderboard with user profiles and scores.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Run CLI in watch mode |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled CLI |
| `pnpm bulk-discover` | Run bulk discovery |
| `pnpm db:push` | Push schema to database |
| `pnpm test` | Run tests |
