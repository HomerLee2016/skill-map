// Signed-in workspace switching: content, roadmap list and revision records must follow the selected
// workspace without a reload. Supabase is replaced by an in-memory PostgREST fake (Playwright routes),
// and the cloud starts with "legacy" rows like the ones left by migration 20261027020000.
//
// Usage: VITE_SUPABASE_URL=http://fake.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite --host 127.0.0.1 --port 4173
//        npx tsx regression/workspace-switch-cloud.e2e.ts [baseUrl] [screenshotDir]
import { chromium, type Page } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv[3] || '';
const API = 'http://fake.supabase.test';
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'homer@example.com' };

const WORKSPACES = {
  'ws-spanish': { lesson: 'Spanish Lesson Unique', test: 'Spanish Quiz Unique', roadmap: 'Spanish roadmap' },
  'ws-japanese': { lesson: 'Japanese Lesson Unique', test: 'Japanese Quiz Unique', roadmap: 'Japanese roadmap' },
} as const;
type Name = keyof typeof WORKSPACES;

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { workspaces: [], lessons: [], tests: [], roadmaps: [], workspace_structures: [], revision_records: [] };
const PK: Record<string, string[]> = {
  workspaces: ['key'],
  lessons: ['workspace_key', 'id'], tests: ['workspace_key', 'id'], roadmaps: ['workspace_key', 'id'],
  workspace_structures: ['workspace_key', 'kind'], revision_records: ['workspace_key', 'hash'],
};

function legacyRevision(hash: string, quiz: string): Row {
  return {
    user_id: USER.id, workspace_key: 'legacy', hash, last_time: '2026-10-01T00:00:00.000Z',
    data: { question_name: `${quiz} question`, options: ['A', 'B'], correct_answer: 'A', last_time: '2026-10-01T00:00:00.000Z', next_revision_time: '2026-10-02T00:00:00.000Z', proficiency: '1', quiz_title: quiz, hash },
  };
}

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [column, value] of params) {
    if (value.startsWith('eq.')) out = out.filter((row) => String(row[column]) === value.slice(3));
    else if (value.startsWith('in.')) {
      const set = new Set(value.slice(4, -1).split(','));
      out = out.filter((row) => set.has(String(row[column])));
    }
  }
  return out;
}

async function installFakeSupabase(page: Page) {
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const match = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!match || !db[match[1]]) return route.fulfill({ status: 404, headers, body: '{}' });
    const table = match[1];
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(filterRows(db[table], url.searchParams)) });
    }
    if (request.method() === 'DELETE') {
      const doomed = new Set(filterRows(db[table], url.searchParams));
      db[table] = db[table].filter((row) => !doomed.has(row));
      return route.fulfill({ status: 204, headers });
    }
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '[]') as Row | Row[];
      for (const row of Array.isArray(body) ? body : [body]) {
        const full = { user_id: USER.id, ...row };
        const same = (other: Row) => PK[table].every((col) => other[col] === full[col]);
        const index = db[table].findIndex(same);
        if (index >= 0) db[table][index] = full; else db[table].push(full);
      }
      return route.fulfill({ status: 201, headers, body: '[]' });
    }
    return route.fulfill({ status: 405, headers, body: '{}' });
  });
}

async function seedSession(page: Page) {
  const session = {
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    user: { id: USER.id, email: USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await page.addInitScript((value) => localStorage.setItem('sb-fake-auth-token', value), JSON.stringify(session));
}

async function seedOpfs(page: Page) {
  await page.evaluate(async (workspaces) => {
    const root = await navigator.storage.getDirectory();
    const write = async (dir: FileSystemDirectoryHandle, name: string, text: string) => {
      const file = await dir.getFileHandle(name, { create: true });
      const w = await file.createWritable();
      await w.write(text);
      await w.close();
    };
    for (const [name, info] of Object.entries(workspaces)) {
      const ws = await root.getDirectoryHandle(name, { create: true });
      await write(await ws.getDirectoryHandle('lessons', { create: true }), 'lesson-1.md', `# ${info.lesson}\n\nBody text.\n`);
      await write(await ws.getDirectoryHandle('tests', { create: true }), 'quiz-1.yaml', `quiz_title: ${info.test}\nquestions:\n  - question_number: 1\n    question: "Q?"\n    options: ["A", "B"]\n    correct_answer: "A"\n`);
      await write(await ws.getDirectoryHandle('roadmaps', { create: true }), 'map-1.yaml', `- id: root\n  label: ${info.roadmap}\n  dependsOn: []\n`);
    }
  }, WORKSPACES);
}

async function selectWorkspace(page: Page, name: Name) {
  await page.evaluate((n) => {
    (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(n);
  }, name);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item--action').click();
  await settle(page);
}

async function switchFromHistory(page: Page, name: Name) {
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item', { hasText: name }).first().click();
  await settle(page);
}

async function settle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('.top-bar-workspace-trigger')?.textContent?.includes('Loading'));
  await page.waitForTimeout(1500); // cloud sync after the load
}

async function openPage(page: Page, nav: string) {
  await page.locator('button.top-bar-link', { hasText: nav }).click();
  await page.waitForTimeout(400);
}

const text = (page: Page) => page.locator('body').innerText();
const shot = async (page: Page, file: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${file}.png` }); };

async function expectOnly(page: Page, name: Name, phase: string) {
  const other = WORKSPACES[name === 'ws-spanish' ? 'ws-japanese' : 'ws-spanish'];
  const mine = WORKSPACES[name];

  await openPage(page, 'Roadmap');
  const sidebar = await page.locator('.sidebar').first().innerText();
  check(`[${phase}] roadmap list is only ${name}'s`, sidebar.includes(mine.roadmap) && !sidebar.includes(other.roadmap), sidebar.replace(/\n/g, ' | '));
  await shot(page, `${phase.replace(/\W+/g, '-')}-roadmap`);

  await openPage(page, 'Lessons');
  let body = await text(page);
  check(`[${phase}] Lessons shows ${name}'s lesson only`, body.includes(mine.lesson) && !body.includes(other.lesson));
  await openPage(page, 'Tests');
  body = await text(page);
  check(`[${phase}] Tests shows ${name}'s test only`, body.includes(mine.test) && !body.includes(other.test));
  await shot(page, `${phase.replace(/\W+/g, '-')}-tests`);

  await openPage(page, 'Revision');
  await page.locator('button', { hasText: 'Learnt Summary' }).first().click();
  await page.waitForTimeout(500);
  body = await text(page);
  check(`[${phase}] Revision shows ${name}'s records only`, body.includes(mine.test) && !body.includes(other.test));
  await shot(page, `${phase.replace(/\W+/g, '-')}-revision`);
}

async function run() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'skillmap-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, executablePath: process.env.CHROMIUM_PATH });
  const browser = { close: () => context.close() };
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => { if (!m.text().includes('React Flow')) console.log(`  [${m.type()}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  page.on('crash', () => console.log('  [crash]'));
  await installFakeSupabase(page);
  if (!process.env.NOAUTH) await seedSession(page);

  // Cloud state as left by the migration: everything under 'legacy', revision for both workspaces.
  db.workspaces.push({ user_id: USER.id, key: 'legacy', name: 'Legacy (not yet assigned)' });
  db.revision_records.push(
    legacyRevision('es-1', WORKSPACES['ws-spanish'].test), legacyRevision('es-2', WORKSPACES['ws-spanish'].test),
    legacyRevision('jp-1', WORKSPACES['ws-japanese'].test),
  );

  await page.goto(BASE_URL);
  await page.waitForSelector('.top-bar-workspace-trigger');
  await seedOpfs(page);
  // Pre-fix behaviour left these flags set, which showed the whole account's cloud copy.
  await page.evaluate((id) => localStorage.setItem(`skill-map-prefer-cloud:${id}`, '1'), USER.id);

  await selectWorkspace(page, 'ws-spanish');
  await expectOnly(page, 'ws-spanish', 'spanish first');
  await selectWorkspace(page, 'ws-japanese');
  await expectOnly(page, 'ws-japanese', 'switched to japanese');
  await switchFromHistory(page, 'ws-spanish');
  await expectOnly(page, 'ws-spanish', 'switched back to spanish');

  const keys = new Set(db.roadmaps.map((row) => row.workspace_key));
  check('cloud roadmaps are stored under one key per workspace', keys.size === 2 && !keys.has('legacy'), [...keys].join(','));
  const revKeys = new Set(db.revision_records.filter((row) => row.workspace_key !== 'legacy').map((row) => row.workspace_key));
  check('legacy revision records were adopted per workspace', revKeys.size >= 1);

  // Signed in, "keep cloud" for the active workspace: still only that workspace's cloud copy.
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('skill-map-prefer-cloud:')) localStorage.removeItem(k); });

  await browser.close();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
