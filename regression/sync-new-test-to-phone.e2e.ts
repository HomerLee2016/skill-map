// A test added to the PC folder reaches the phone: PC "Sync now" uploads it (even untouched), phone "Sync now" pulls it in.
// Supabase is an in-memory PostgREST fake (Playwright routes).
//
// Usage: VITE_SUPABASE_URL=http://fake.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite --host 127.0.0.1 --port 4173
//        npx tsx regression/sync-new-test-to-phone.e2e.ts [baseUrl]
import { chromium, devices, type Page } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/';
const API = 'http://fake.supabase.test';
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'homer@example.com' };
const NEW_TEST = 'Brand New Untouched Quiz';

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
      if (table === 'workspaces') {
        const gone = new Set([...doomed].map((row) => row.key));
        for (const child of Object.keys(db)) if (child !== 'workspaces') db[child] = db[child].filter((row) => !gone.has(row.workspace_key as string));
      }
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
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle('ws-spanish', { create: true });
    const write = async (dir: FileSystemDirectoryHandle, name: string, text: string) => {
      const file = await dir.getFileHandle(name, { create: true });
      const w = await file.createWritable();
      await w.write(text);
      await w.close();
    };
    await write(await ws.getDirectoryHandle('lessons', { create: true }), 'lesson-1.md', '# Spanish Lesson Unique\n\nBody text.\n');
    await write(await ws.getDirectoryHandle('tests', { create: true }), 'quiz-1.yaml', 'quiz_title: Spanish Quiz Unique\nquestions:\n  - question_number: 1\n    question: "Q?"\n    options: ["A", "B"]\n    correct_answer: "A"\n');
    await write(await ws.getDirectoryHandle('roadmaps', { create: true }), 'map-1.yaml', '- id: root\n  label: Spanish roadmap\n  dependsOn: []\n');
  });
}

async function addTestFile(page: Page) {
  await page.evaluate(async (title) => {
    const ws = await (await navigator.storage.getDirectory()).getDirectoryHandle('ws-spanish');
    const file = await (await ws.getDirectoryHandle('tests')).getFileHandle('quiz-2.yaml', { create: true });
    const w = await file.createWritable();
    await w.write(`quiz_title: ${title}\nquestions:\n  - question_number: 1\n    question: "Q2?"\n    options: ["A", "B"]\n    correct_answer: "B"\n`);
    await w.close();
  }, NEW_TEST);
}

async function selectOnPc(page: Page, name: string) {
  await page.evaluate((n) => {
    (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(n);
  }, name);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Browse from local' }).click();
  await page.waitForFunction(() => !document.querySelector('.top-bar-workspace-trigger')?.textContent?.includes('Loading'));
  await page.waitForTimeout(1800);
}

const body = (page: Page) => page.locator('body').innerText();
const shot = async (page: Page, file: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${file}.png` }); };

async function openMenu(page: Page) {
  await page.locator('.top-bar-workspace-trigger').click();
  await page.waitForTimeout(600);
}

async function nav(page: Page, label: string, mobile: boolean) {
  if (mobile) await page.locator('.top-bar-hamburger').click();
  await page.locator('button.top-bar-link', { hasText: label }).click();
  await page.waitForTimeout(400);
}


async function syncNow(page: Page, mobile: boolean) {
  if (mobile) await page.locator('.top-bar-hamburger').click();
  else await page.locator('.top-bar-user-icon').click();
  await page.getByRole('menuitem', { name: /Sync now/ }).or(page.locator('button', { hasText: /^Sync now$/ })).first().click();
  await page.waitForTimeout(2500);
}

async function openTests(page: Page, mobile: boolean) {
  const link = page.locator('button.top-bar-link', { hasText: 'Tests' });
  if (mobile && !(await link.isVisible())) await page.locator('.top-bar-hamburger').click();
  await link.click();
  await page.waitForTimeout(500);
}

async function run() {
  const chromiumPath = process.env.CHROMIUM_PATH;
  const pc = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'skillmap-pc-')), { headless: true, executablePath: chromiumPath });
  await pc.addInitScript('globalThis.__name = (fn) => fn;');
  const pcPage = pc.pages()[0] ?? (await pc.newPage());
  pcPage.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  await installFakeSupabase(pcPage);
  await seedSession(pcPage);
  await pcPage.goto(BASE_URL);
  await pcPage.waitForSelector('.top-bar-workspace-trigger');
  await seedOpfs(pcPage);
  await selectOnPc(pcPage, 'ws-spanish');
  check('PC import uploaded the first test', db.tests.length === 1, String(db.tests.length));

  const browser = await chromium.launch({ executablePath: chromiumPath });
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  await phone.addInitScript('globalThis.__name = (fn) => fn; delete window.showDirectoryPicker;');
  const page = await phone.newPage();
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  await installFakeSupabase(page);
  await seedSession(page);
  await page.goto(BASE_URL);
  await page.waitForSelector('.top-bar-workspace-trigger');
  await page.waitForTimeout(1500);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item', { hasText: 'ws-spanish' }).first().click();
  await page.waitForTimeout(1500);
  await openTests(page, true);
  check('phone starts without the new test', !(await body(page)).includes(NEW_TEST));

  // Desktop: drop a new, never-answered test into the folder, then Sync now (no reload)
  await addTestFile(pcPage);
  await syncNow(pcPage, false);
  check('PC Sync now uploaded the new untouched test', db.tests.some((row) => row.title === NEW_TEST), db.tests.map((r) => r.title).join(','));
  check('no revision records were needed', db.revision_records.length === 0);

  // Phone: Sync now (no reload) pulls it in
  await syncNow(page, true);
  await openTests(page, true);
  check('phone Sync now shows the new test without reload', (await body(page)).includes(NEW_TEST));

  await page.reload();
  await page.waitForTimeout(2000);
  await openTests(page, true);
  check('phone shows the new test after reload', (await body(page)).includes(NEW_TEST));

  await browser.close();
  await pc.close();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
