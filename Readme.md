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

**Start the worker:**

```bash
pnpm dev        # Development mode
pnpm start      # Production mode
```

**Bulk discover users:**

```bash
pnpm bulk-discover
```

**Push database schema:**

```bash
pnpm db:push
```
