import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const CONFIG = {
  apiUrl: 'https://api.apify.com/v2/acts/bestscrapers~linkedin-open-to-work-status/run-sync-get-dataset-items',
  retries: 2,
  delayMs: 1500,
};

const getEnv = (key: string) => process.env[key] ?? (() => { throw new Error(`${key} not set`); })();
const sql = neon(getEnv('DATABASE_URL'));

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const backoff = (attempt: number) => CONFIG.delayMs * (attempt + 1);

const apify = {
  async fetch(linkedinUrl: string): Promise<boolean | null> {
    for (let attempt = 0; attempt <= CONFIG.retries; attempt++) {
      try {
        const res = await fetch(`${CONFIG.apiUrl}?token=${getEnv('APIFY_TOKEN')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileUrls: [linkedinUrl] }),
        });
        if (!res.ok) {
          const msg = await res.text();
          if (res.status === 401 || res.status === 403) throw new Error(`Auth failed: ${msg}`);
          if (attempt < CONFIG.retries) { await sleep(backoff(attempt)); continue; }
          throw new Error(`API ${res.status}`);
        }
        const data = (await res.json()) as Array<{ isOpenToWork: boolean }>;
        return data[0]?.isOpenToWork ?? null;
      } catch (e: unknown) {
        if (attempt === CONFIG.retries) throw e;
        await sleep(backoff(attempt));
      }
    }
    return null;
  },
};

const db = {
  async ensureColumns() {
    try { await sql`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS is_open_to_work BOOLEAN`; } catch { /* ignore */ }
    try { await sql`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS otw_scraped_at TIMESTAMP`; } catch { /* ignore */ }
  },
  async fetchTopUsers(limit = 5) {
    return sql`
      SELECT username, linkedin, total_score FROM leaderboard
      WHERE linkedin IS NOT NULL
      ORDER BY total_score DESC
      LIMIT ${limit}
    ` as unknown as Promise<Array<{ username: string; linkedin: string; total_score: number }>>;
  },
  async update(username: string, isOpenToWork: boolean | null) {
    await sql`UPDATE leaderboard SET is_open_to_work = ${isOpenToWork}, otw_scraped_at = NOW() WHERE username = ${username}`;
  },
};

const log = {
  progress: (n: number, total: number, u: string) => console.log(`[${n}/${total}] ${u}`),
  success: (r: boolean | null) => console.log(`  ✓ OpenToWork: ${r}`),
  error: (m: string) => console.log(`  ✗ ${m}`),
  summary: (t: number, s: number, f: number) => console.log(`\n--- Summary ---\nTotal: ${t}\nSuccess: ${s}\nFailed: ${f}`),
};

async function main() {
  await db.ensureColumns();
  const users = await db.fetchTopUsers(5);
  if (!users.length) { console.log('No users to process'); return; }
  console.log(`Found ${users.length} users to process\n`);

  let processed = 0, success = 0, failed = 0;
  for (const user of users) {
    processed++;
    log.progress(processed, users.length, user.username);
    try {
      const result = await apify.fetch(user.linkedin!);
      await db.update(user.username, result);
      log.success(result);
      success++;
    } catch (e: unknown) {
      log.error(e instanceof Error ? e.message : String(e));
      failed++;
    }
    if (processed < users.length) await sleep(CONFIG.delayMs);
  }
  log.summary(processed, success, failed);
}

main().catch(console.error);