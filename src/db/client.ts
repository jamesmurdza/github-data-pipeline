// src/db/client.ts
// Consolidated database client - single source of truth

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { config } from '../utils/config.js';
import * as schema from './schema.js';

// --- Standard PostgreSQL client (for scripts, CLI, workers) ---
const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Drizzle ORM with schema
export const db = drizzle(pool, { schema });

// Export pool if direct access is needed
export { pool };

// Export the schema object for migrations or other tools
export { schema };

// --- Neon Serverless client (for Next.js server actions, edge functions) ---
// This uses HTTP-based queries, ideal for serverless environments
export const sql: NeonQueryFunction<false, false> = neon(config.databaseUrl);
