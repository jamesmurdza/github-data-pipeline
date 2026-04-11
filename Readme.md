# GitHub Data Pipeline

Analyze GitHub users and score their skills across AI, Backend, Frontend, DevOps, and Data domains.

## Setup

```bash
pnpm install
```

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GITHUB_TOKENS=token1,token2,token3
```

Or use individual token variables:

```env
GITHUB_TOKEN_1=...
GITHUB_TOKEN_2=...
```

## Usage

### Start the worker

Starts a BullMQ worker that processes GitHub usernames from the job queue, fetches their data via the GitHub API, computes skill scores, and stores results in the database.

```bash
pnpm dev        # Development mode with hot reload
pnpm start      # Production mode (requires pnpm build first)
```

### Bulk discover users

Searches GitHub for users by location and follower count, then analyzes and scores them. Processes users in batches with automatic rate limit handling.

```bash
pnpm bulk-discover [location] [startRangeIndex] [startPage]

# Examples:
pnpm bulk-discover                 # Default: Sydney
pnpm bulk-discover "San Francisco"
pnpm bulk-discover London 5 2      # Resume from range index 5, page 2
```

### Push database schema

Syncs the Drizzle ORM schema to your PostgreSQL database.

```bash
pnpm db:push
```
