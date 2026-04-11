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
pnpm bulk-discover [location] [rangeIndex] [page]
```

- `location` - GitHub user location to search (default: "Sydney")
- `rangeIndex` - Follower range index 0-15 to resume from (default: 0)
- `page` - API page 1-10 within the range (default: 1)

Follower ranges: `10..20`, `21..30`, `31..40`, `41..50`, `51..75`, `76..100`, `101..150`, `151..200`, `201..300`, `301..500`, `501..1000`, `1001..2000`, `2001..5000`, `5001..10000`, `>10000`, `0..9`

```bash
# Examples
pnpm bulk-discover                 # Sydney, all ranges
pnpm bulk-discover "San Francisco" # San Francisco, all ranges
pnpm bulk-discover London 5 2      # London, resume from range 5 (51..75), page 2
```

### Push database schema

Syncs the Drizzle ORM schema to your PostgreSQL database.

```bash
pnpm db:push
```
