import 'dotenv/config';
import { db } from '../src/db/dbClient.js';
import { leaderboard } from '../src/db/schema.js';
import { sql, desc } from 'drizzle-orm';

const APIFY_BASE_URL = 'https://api.apify.com/v2/acts/bestscrapers~linkedin-open-to-work-status/run-sync-get-dataset-items';
const MAX_RETRIES = 2;
const DELAY_MS = 1500;

const getApifyToken = () => process.env.APIFY_TOKEN ?? (() => { throw new Error('APIFY_TOKEN not set'); })();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ApifyResult { isOpenToWork: boolean; }
type LeaderboardUser = { username: string; linkedin: string; totalScore: number };

const apify = {
  async fetch(linkedinUrl: string): Promise<boolean | null> {
    const token = getApifyToken();
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${APIFY_BASE_URL}?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileUrls: [linkedinUrl] }),
        });
        if (!res.ok) {
          const msg = await res.text();
          if (res.status === 401 || res.status === 403) throw new Error(`Auth failed: ${msg}`);
          if (attempt < MAX_RETRIES) { await sleep(DELAY_MS * (attempt + 1)); continue; }
          throw new Error(`API ${res.status}`);
        }
        const data = (await res.json()) as ApifyResult[];
        return data[0]?.isOpenToWork ?? null;
      } catch (e: any) {
        if (attempt === MAX_RETRIES) throw e;
        await sleep(DELAY_MS * (attempt + 1));
      }
    }
    return null;
  },
};

const db_ = {
  async ensureColumns() {
    await db.execute(sql`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS is_open_to_work BOOLEAN`);
    await db.execute(sql`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS otw_scraped_at TIMESTAMP`);
  },
  async fetchTopUsers(limit: number = 5): Promise<LeaderboardUser[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db.select({
      username: leaderboard.username,
      linkedin: leaderboard.linkedin,
      totalScore: leaderboard.totalScore,
    }).from(leaderboard)
      .where(sql`${leaderboard.linkedin} IS NOT NULL`)
      .orderBy(desc(leaderboard.totalScore))
      .limit(limit) as Promise<LeaderboardUser[]>;
  },
  async update(username: string, isOpenToWork: boolean | null) {
    await db.execute(sql`UPDATE leaderboard SET is_open_to_work = ${isOpenToWork}, otw_scraped_at = NOW() WHERE username = ${username}`);
  },
};

const log = {
  progress: (n: number, total: number, username: string) => console.log(`[${n}/${total}] ${username}`),
  success: (result: boolean | null) => console.log(`  ✓ OpenToWork: ${result}`),
  error: (msg: string) => console.log(`  ✗ ${msg}`),
  summary: (total: number, success: number, failed: number) => console.log(`\n--- Summary ---\nTotal: ${total}\nSuccess: ${success}\nFailed: ${failed}`),
};

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) { console.error('Error: APIFY_TOKEN not set'); process.exit(1); }

  await db_.ensureColumns();
  const users = await db_.fetchTopUsers(5);
  if (!users.length) { console.log('No users to process'); return; }

  console.log(`Found ${users.length} users to process\n`);

  let processed = 0, success = 0, failed = 0;
  for (const user of users) {
    processed++;
    log.progress(processed, users.length, user.username);
    try {
      const result = await apify.fetch(user.linkedin!);
      await db_.update(user.username, result);
      log.success(result);
      success++;
    } catch (e: any) {
      log.error(e.message);
      failed++;
    }
    if (processed < users.length) await sleep(DELAY_MS);
  }
  log.summary(processed, success, failed);
}

main().catch(console.error);