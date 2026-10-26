// Workspaces follow the user: imported on a PC (folder picker), they are listed and opened on a phone
// (no folder picker) from the cloud; folder-input and zip import work there; removing needs the typed name
// and only deletes the cloud copy when asked. Supabase is an in-memory PostgREST fake (Playwright routes).
//
// Usage: VITE_SUPABASE_URL=http://fake.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite --host 127.0.0.1 --port 4173
//        npx tsx regression/workspace-cloud-mobile.e2e.ts [baseUrl] [screenshotDir]
import { chromium, devices, type Page } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
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


async function selectOnPc(page: Page, name: Name) {
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

function writeFolder(root: string, name: string, lesson: string, test: string) {
  const base = path.join(root, name);
  for (const sub of ['lessons', 'tests', 'roadmaps']) mkdirSync(path.join(base, sub), { recursive: true });
  writeFileSync(path.join(base, 'lessons', 'l1.md'), `# ${lesson}\n\nBody.\n`);
  writeFileSync(path.join(base, 'tests', 'q1.yaml'), `quiz_title: ${test}\nquestions:\n  - question_number: 1\n    question: "Q?"\n    options: ["A", "B"]\n    correct_answer: "A"\n`);
  writeFileSync(path.join(base, 'roadmaps', 'm1.yaml'), `- id: root\n  label: ${name} roadmap\n  dependsOn: []\n`);
  return base;
}

async function run() {
  const chromiumPath = process.env.CHROMIUM_PATH;
  // ---- PC: import two workspaces with the directory picker; signing in uploads them
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
  await selectOnPc(pcPage, 'ws-japanese');
  const uploaded = new Set(db.workspaces.map((row) => row.name));
  check('PC import created cloud workspaces rows', uploaded.has('ws-spanish') && uploaded.has('ws-japanese'), [...uploaded].join(','));
  check('PC import uploaded lessons for both', db.lessons.length === 2, String(db.lessons.length));
  await openMenu(pcPage);
  await shot(pcPage, 'pc-menu');
  await pc.close();

  // ---- Phone: no folder picker, nothing stored locally
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
  check('phone has no directory picker', await page.evaluate(() => typeof (window as any).showDirectoryPicker === 'undefined'));
  await openMenu(page);
  let menu = await page.locator('.top-bar-workspace-menu').innerText();
  check('phone lists the workspaces imported on the PC', menu.includes('ws-spanish') && menu.includes('ws-japanese'), menu.replace(/\n/g, ' | '));
  check('phone menu offers folder and zip import', menu.includes('Browse from local') && menu.includes('Import .zip'));
  await shot(page, 'phone-menu');

  await page.locator('.top-bar-workspace-menu-item', { hasText: 'ws-japanese' }).first().click();
  await page.waitForTimeout(1500);
  await nav(page, 'Lessons', true);
  let text = await body(page);
  check('phone opens japanese lesson from the cloud', text.includes(WORKSPACES['ws-japanese'].lesson) && !text.includes(WORKSPACES['ws-spanish'].lesson));
  await shot(page, 'phone-lessons');
  await nav(page, 'Tests', true);
  check('phone opens japanese test from the cloud', (await body(page)).includes('Tests'));
  await page.reload();
  await page.waitForTimeout(2000);
  await nav(page, 'Lessons', true);
  text = await body(page);
  check('phone keeps the workspace after reload', text.includes(WORKSPACES['ws-japanese'].lesson));
  await nav(page, 'Roadmap', true);
  const roadmapSidebar = await page.locator('.sidebar').first().innerText();
  check('phone roadmaps come from the cloud', roadmapSidebar.includes(WORKSPACES['ws-japanese'].roadmap), roadmapSidebar.replace(/\n/g, ' | '));

  // ---- Phone: folder input import (browsers without the picker)
  const tmp = mkdtempSync(path.join(tmpdir(), 'skillmap-files-'));
  const folder = writeFolder(tmp, 'ws-french', 'French Lesson Unique', 'French Quiz Unique');
  await page.locator('input[webkitdirectory]').setInputFiles(folder);
  await page.waitForTimeout(2500);
  await nav(page, 'Lessons', true);
  text = await body(page);
  check('folder input import opens the workspace', text.includes('French Lesson Unique'));
  check('folder input import was uploaded to the cloud', db.workspaces.some((row) => row.name === 'ws-french') && db.lessons.some((row) => row.title === 'French Lesson Unique'));

  // ---- Phone: zip import
  const zipPath = path.join(tmp, 'ws-german.zip');
  writeFileSync(zipPath, zipSync({
    'lessons/l1.md': strToU8('# German Lesson Unique\n\nBody.\n'),
    'tests/q1.yaml': strToU8('quiz_title: German Quiz Unique\nquestions: []\n'),
  }));
  await page.locator('input[type=file][accept*=zip]').setInputFiles(zipPath);
  await page.waitForTimeout(2500);
  await nav(page, 'Lessons', true);
  text = await body(page);
  check('zip import opens the workspace', text.includes('German Lesson Unique'));
  check('zip import named the workspace after the file', db.workspaces.some((row) => row.name === 'ws-german'));

  // ---- Remove: typed name required; keeps the cloud copy unless asked
  await openMenu(page);
  await page.locator('button[aria-label="Remove ws-german"]').click();
  await page.waitForTimeout(300);
  await shot(page, 'phone-remove-dialog');
  const dialog = page.locator('.modal-dialog');
  const confirm = dialog.locator('.remove-confirm');
  check('cloud-only removal warns it deletes everywhere', (await dialog.innerText()).includes('permanently deletes'));
  check('confirm is disabled until the name is typed', await confirm.isDisabled());
  await dialog.locator('input.modal-input').fill('ws-germ');
  check('partial name keeps confirm disabled', await confirm.isDisabled());
  await dialog.locator('input.modal-input').fill('ws-german');
  check('typed name enables confirm', await confirm.isEnabled());
  await confirm.click();
  await page.waitForTimeout(1500);
  check('cloud workspace row and its content were deleted', !db.workspaces.some((row) => row.name === 'ws-german') && !db.lessons.some((row) => row.title === 'German Lesson Unique'));
  check('other cloud workspaces are untouched', db.workspaces.some((row) => row.name === 'ws-japanese') && db.lessons.some((row) => row.title === WORKSPACES['ws-japanese'].lesson));
  check('removed active workspace falls back to the default', (await page.locator('.top-bar-workspace-trigger').innerText()).length > 0 && !(await body(page)).includes('German Lesson Unique'));

  await browser.close();

  // ---- PC: removing a local entry keeps the cloud copy by default
  const pc2 = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'skillmap-pc2-')), { headless: true, executablePath: chromiumPath });
  await pc2.addInitScript('globalThis.__name = (fn) => fn;');
  const p2 = pc2.pages()[0] ?? (await pc2.newPage());
  await installFakeSupabase(p2);
  await seedSession(p2);
  await p2.goto(BASE_URL);
  await p2.waitForSelector('.top-bar-workspace-trigger');
  await seedOpfs(p2);
  await selectOnPc(p2, 'ws-spanish');
  await openMenu(p2);
  await p2.locator('button[aria-label="Remove ws-spanish"]').click();
  const d2 = p2.locator('.modal-dialog');
  await shot(p2, 'pc-remove-dialog');
  check('local removal says the folder and cloud copy stay', (await d2.innerText()).includes('cloud copy stays'));
  check('cloud checkbox is off by default', !(await d2.locator('input[type=checkbox]').isChecked()));
  await d2.locator('input.modal-input').fill('ws-spanish');
  await d2.locator('.remove-confirm').click();
  await p2.waitForTimeout(1500);
  check('removing from this device keeps the cloud copy', db.workspaces.some((row) => row.name === 'ws-spanish') && db.lessons.some((row) => row.title === WORKSPACES['ws-spanish'].lesson));
  await openMenu(p2);
  const menu2 = await p2.locator('.top-bar-workspace-menu').innerText();
  check('the workspace is still listed (cloud only)', menu2.includes('ws-spanish'));
  await p2.locator('button[aria-label="Remove ws-spanish"]').click();
  await p2.locator('.modal-dialog input.modal-input').fill('ws-spanish');
  await p2.locator('.modal-dialog .remove-confirm').click();
  await p2.waitForTimeout(1500);
  check('second removal deletes the cloud copy', !db.workspaces.some((row) => row.name === 'ws-spanish'));
  await pc2.close();

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
