// Sharing hub + merge workspaces, end to end with three browsers (Ann on a PC, Bo on a phone).
// Supabase is an in-memory PostgREST fake shared by both browsers (Playwright routes), with the RLS rules
// of migration 20261114000000: everyone signed in reads shared_workspaces, only the owner writes them;
// other tables are per user.
//
// Usage: VITE_SUPABASE_URL=http://fake.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite --host 127.0.0.1 --port 4173
//        npx tsx regression/sharing-merge.e2e.ts [baseUrl] [screenshotDir]
import { chromium, devices, type BrowserContext, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv[3] || '';
const API = 'http://fake.supabase.test';
const ANN = { id: '11111111-1111-1111-1111-111111111111', email: 'ann@example.com' };
const BO = { id: '22222222-2222-2222-2222-222222222222', email: 'bo@example.com' };
type User = typeof ANN;

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {
  workspaces: [], lessons: [], tests: [], roadmaps: [], workspace_structures: [], revision_records: [], shared_workspaces: [], shared_workspace_reactions: [], shared_workspace_reports: [],
};
const PK: Record<string, string[]> = {
  workspaces: ['user_id', 'key'],
  lessons: ['user_id', 'workspace_key', 'id'], tests: ['user_id', 'workspace_key', 'id'], roadmaps: ['user_id', 'workspace_key', 'id'],
  workspace_structures: ['user_id', 'workspace_key', 'kind'], revision_records: ['user_id', 'workspace_key', 'hash'],
  shared_workspaces: ['owner_id', 'source_workspace_key'],
  shared_workspace_reactions: ['user_id', 'shared_id'],
  shared_workspace_reports: ['reporter_id', 'shared_id'],
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

/** One fake backend, one signed-in user per browser. */
async function installFakeSupabase(context: BrowserContext, user: User) {
  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const match = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (match?.[1] === 'shared_workspace_stats') {
      // The view: counts only, readable by every signed-in user.
      const counts = new Map<string, { shared_id: unknown; upvotes: number; downvotes: number; stars: number }>();
      for (const row of db.shared_workspace_reactions) {
        const entry = counts.get(String(row.shared_id)) ?? { shared_id: row.shared_id, upvotes: 0, downvotes: 0, stars: 0 };
        if (row.vote === 1) entry.upvotes += 1;
        if (row.vote === -1) entry.downvotes += 1;
        if (row.starred) entry.stars += 1;
        counts.set(String(row.shared_id), entry);
      }
      return route.fulfill({ status: 200, headers, body: JSON.stringify([...counts.values()]) });
    }
    if (!match || !db[match[1]]) return route.fulfill({ status: 404, headers, body: '{}' });
    const table = match[1];
    const shared = table === 'shared_workspaces';
    const ownerColumn = shared ? 'owner_id' : table === 'shared_workspace_reports' ? 'reporter_id' : 'user_id';
    // RLS: shared snapshots are readable by every signed-in user, everything else only by its owner.
    // (migration 20261117000000: hidden shares are visible to their owner only.)
    const readable = db[table].filter((row) => (shared ? !row.hidden || row.owner_id === user.id : row[ownerColumn] === user.id));
    const writable = db[table].filter((row) => row[ownerColumn] === user.id);
    if (request.method() === 'GET') {
      let rows = filterRows(readable, url.searchParams);
      const select = url.searchParams.get('select');
      if (select && select !== '*') {
        const columns = select.split(',');
        rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
      }
      if (request.headers().accept?.includes('vnd.pgrst.object')) {
        return rows.length === 1
          ? route.fulfill({ status: 200, headers, body: JSON.stringify(rows[0]) })
          : route.fulfill({ status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'no rows', details: '', hint: '' }) });
      }
      return route.fulfill({ status: 200, headers, body: JSON.stringify(rows) });
    }
    if (request.method() === 'DELETE') {
      const doomed = new Set(filterRows(writable, url.searchParams));
      db[table] = db[table].filter((row) => !doomed.has(row));
      return route.fulfill({ status: 204, headers });
    }
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '[]') as Row | Row[];
      for (const row of Array.isArray(body) ? body : [body]) {
        if (row[ownerColumn] !== undefined && row[ownerColumn] !== user.id) {
          return route.fulfill({ status: 403, headers, body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
        }
        if (table === 'shared_workspace_reactions' && db.shared_workspaces.some((share) => share.id === row.shared_id && share.owner_id === user.id)) {
          return route.fulfill({ status: 403, headers, body: JSON.stringify({ message: 'cannot react to your own share' }) });
        }
        if (table === 'shared_workspace_reports') {
          if (db.shared_workspaces.some((share) => share.id === row.shared_id && share.owner_id === user.id)) {
            return route.fulfill({ status: 403, headers, body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
          }
          if (db[table].some((other) => other.reporter_id === user.id && other.shared_id === row.shared_id)) {
            return route.fulfill({ status: 409, headers, body: JSON.stringify({ message: 'duplicate key value violates unique constraint' }) });
          }
        }
        const full: Row = { [ownerColumn]: user.id, ...row };
        if (shared) full.published_at = new Date().toISOString();
        const same = (other: Row) => PK[table].every((col) => other[col] === full[col]);
        const index = db[table].findIndex(same);
        if (index >= 0) db[table][index] = { ...db[table][index], ...full, published_at: db[table][index].published_at ?? full.published_at };
        else db[table].push(shared ? { id: randomUUID(), ...full } : full);
        if (shared) db[table].find(same)!.updated_at = new Date().toISOString();
      }
      return route.fulfill({ status: 201, headers, body: '[]' });
    }
    return route.fulfill({ status: 405, headers, body: '{}' });
  });
}

async function seedSession(context: BrowserContext, user: User) {
  const session = {
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await context.addInitScript((value) => localStorage.setItem('sb-fake-auth-token', value), JSON.stringify(session));
}

const QUIZ = (title: string, question: string) => `quiz_title: ${title}\nquestions:\n  - question_number: 1\n    question: "${question}"\n    options: ["A", "B"]\n    correct_answer: "A"\n`;

/** lv1 and lv2 as two friends would have written them: lv2 reuses file names (same id, different content) and one identical lesson. */
const FOLDERS: Record<string, Record<string, Record<string, string>>> = {
  'spanish-evil': {
    lessons: { 'trap.md': '# Trap\n\n<img src=x onerror="alert(1)">\n\n[go](javascript:alert(2))\n' },
    tests: {},
    roadmaps: {},
  },
  'spanish-lv1': {
    lessons: { 'lesson-1.md': '# Spanish Greetings\n\nHola!\n', 'lesson-2.md': '# Spanish Numbers\n\nUno, dos.\n', 'lesson-private.md': '# Private Notes\n\nNot for sharing.\n' },
    tests: { 'quiz-1.yaml': QUIZ('Greetings Quiz', 'Hola means?') },
    roadmaps: { 'map-1.yaml': '- id: lv1\n  label: Spanish lv1 map\n  dependsOn: []\n  finished: true\n  lessons: [lesson-1]\n  tests: [quiz-1]\n' },
  },
  'spanish-lv2': {
    lessons: { 'lesson-1.md': '# Spanish Past Tense\n\nHablé.\n', 'lesson-2.md': '# Spanish Numbers\n\nUno, dos.\n', 'lesson-3.md': '# Spanish Food\n\nLa manzana.\n' },
    tests: { 'quiz-1.yaml': QUIZ('Past Tense Quiz', 'Hablé means?') },
    roadmaps: { 'map-1.yaml': '- id: lv2\n  label: Spanish lv2 map\n  dependsOn: []\n  lessons: [lesson-1, lesson-3]\n  tests: [quiz-1]\n' },
  },
};

async function seedOpfs(page: Page) {
  await page.evaluate(async (folders) => {
    const root = await navigator.storage.getDirectory();
    for (const [name, kinds] of Object.entries(folders)) {
      const ws = await root.getDirectoryHandle(name, { create: true });
      for (const [kind, files] of Object.entries(kinds)) {
        const dir = await ws.getDirectoryHandle(kind, { create: true });
        for (const [file, text] of Object.entries(files)) {
          const handle = await dir.getFileHandle(file, { create: true });
          const w = await handle.createWritable();
          await w.write(text);
          await w.close();
        }
      }
    }
  }, FOLDERS);
}

async function settle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('.top-bar-workspace-trigger')?.textContent?.includes('Loading'));
  await page.waitForTimeout(1800);
}

async function pickFolder(page: Page, name: string) {
  await page.evaluate((n) => { (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(n); }, name);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Browse from local' }).click();
  await settle(page);
}

/** On a phone the nav lives in the hamburger menu. */
async function openPage(page: Page, nav: string) {
  const hamburger = page.locator('.top-bar-hamburger');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.locator('button.top-bar-link', { hasText: nav }).click();
  await page.waitForTimeout(500);
}

const shot = async (page: Page, file: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${file}.png` }); };
const bodyText = (page: Page) => page.locator('body').innerText();
const rows = (table: string, userId: string, workspaceKey?: string) =>
  db[table].filter((row) => row.user_id === userId && (workspaceKey === undefined || row.workspace_key === workspaceKey));
const keyOf = (userId: string, name: string) => db.workspaces.find((row) => row.user_id === userId && row.name === name)?.key as string | undefined;

const contexts: BrowserContext[] = [];

async function newUserContext(user: User, phone: boolean) {
  // A persistent profile per user: OPFS (the fake "local folder") needs a real profile directory.
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'skillmap-share-e2e-'));
  const options = phone ? (({ defaultBrowserType: _ignored, ...rest }) => rest)(devices['iPhone 13']) : { viewport: { width: 1280, height: 800 } };
  const context = await chromium.launchPersistentContext(userDataDir, { ...options, headless: true, executablePath: process.env.CHROMIUM_PATH });
  contexts.push(context);
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  await installFakeSupabase(context, user);
  await seedSession(context, user);
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('crash', () => console.log(`  [${user.email} crash]`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('React Flow')) console.log(`  [${user.email} console.error] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (err) => console.log(`  [${user.email} pageerror] ${err.message}`));
  page.on('dialog', async (dialog) => { console.log(`  [${user.email} dialog:${dialog.type()}] ${dialog.message().slice(0, 100)}`); await dialog.accept(); });
  return { context, page };
}

/** Opens the "Publish new workspace" modal and fills it in. The caller clicks "Publish snapshot". */
async function publish(page: Page, workspaceName: string, title: string, untick: string[] = [], tags: string[] = []) {
  await openPage(page, 'Sharing hub');
  await page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await page.locator('button', { hasText: 'Publish new workspace' }).click();
  await page.waitForSelector('.publish-dialog');
  await page.locator('select[aria-label="Workspace to share"]').selectOption({ label: workspaceName });
  await page.waitForSelector('.sharing-checklists');
  await page.waitForTimeout(400);
  await fillDialog(page, title, untick);
  for (const tag of tags) {
    await page.locator('input[aria-label="Add tag"]').fill(tag);
    await page.keyboard.press('Enter');
  }
  await shot(page, 'desktop-1-publish-modal');
}

/** Opens the pencil modal of a published row and fills it in. The caller clicks "Update snapshot". */
async function editPublished(page: Page, currentTitle: string, title: string, untick: string[] = []) {
  await openPage(page, 'Sharing hub');
  await page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await page.locator('.published-row', { hasText: currentTitle }).locator('button[aria-label^="Edit published"]').click();
  await page.waitForSelector('.publish-dialog');
  await page.waitForSelector('.sharing-checklists');
  await page.waitForTimeout(400);
  await fillDialog(page, title, untick);
}

async function fillDialog(page: Page, title: string, untick: string[]) {
  for (const label of untick) await page.locator('.sharing-check', { hasText: label }).locator('input').uncheck();
  await page.locator('input[aria-label="Shared title"]').fill(title);
  await page.locator('textarea[aria-label="Shared description"]').fill(`${title}: greetings, numbers and a map.`);
  await page.locator('input[aria-label="Shown as"]').fill('Ann');
}

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // ---------------------------------------------------------------- Ann (PC): two folder workspaces, shares lv1
  const ann = await newUserContext(ANN, false);
  await ann.page.goto(BASE_URL);
  await ann.page.waitForSelector('.top-bar-workspace-trigger');
  await seedOpfs(ann.page);
  await pickFolder(ann.page, 'spanish-lv1');
  await pickFolder(ann.page, 'spanish-lv2');
  await pickFolder(ann.page, 'spanish-lv1');
  check('Ann: both workspaces are in her cloud account', Boolean(keyOf(ANN.id, 'spanish-lv1') && keyOf(ANN.id, 'spanish-lv2')));

  await publish(ann.page, 'spanish-lv1', 'Spanish lv1', ['Private Notes'], ['Spanish', ' #Beginner ', 'spanish']);
  await shot(ann.page, 'desktop-1-share-tab');
  await ann.page.locator('button', { hasText: 'Publish snapshot' }).click();
  await ann.page.waitForSelector('.sharing-ok');
  const lv1 = db.shared_workspaces.find((row) => row.name === 'Spanish lv1');
  check('Ann: lv1 published as a snapshot', Boolean(lv1) && lv1!.lesson_count === 2 && lv1!.test_count === 1 && lv1!.roadmap_count === 1, JSON.stringify(lv1 && [lv1.lesson_count, lv1.test_count, lv1.roadmap_count]));
  const snapshot = JSON.stringify(lv1?.content ?? {});
  check('Ann: the unticked lesson is not in the snapshot', !snapshot.includes('Private Notes'));
  check('Ann: no revision data in the snapshot', !snapshot.includes('revision_records') && !snapshot.includes('proficiency'));
  check('Ann: tags are saved normalised, lowercase and without duplicates', JSON.stringify(lv1?.tags) === JSON.stringify(['spanish', 'beginner']), JSON.stringify(lv1?.tags));
  check('Ann: her email is not in the shared row', !JSON.stringify(lv1).includes('ann@example.com'));
  await shot(ann.page, 'desktop-2-published');

  // Publishing lv2 as well (second snapshot), then lv1 again with fewer items updates instead of duplicating.
  await publish(ann.page, 'spanish-lv2', 'Spanish lv2', [], ['spanish', 'advanced']);
  await ann.page.locator('button', { hasText: 'Publish snapshot' }).click();
  await ann.page.waitForSelector('.sharing-ok');
  check('Ann: two published snapshots', db.shared_workspaces.length === 2);
  await shot(ann.page, 'desktop-2c-published-list-with-tags');
  check('Ann: the published list shows the tags', (await ann.page.locator('.published-row', { hasText: 'Spanish lv1' }).locator('.tag-chip').allInnerTexts()).join(',') === 'spanish,beginner');
  check('Ann: the publish modal closed after publishing', (await ann.page.locator('.publish-dialog').count()) === 0);
  const rowsText = await ann.page.locator('.published-row').allInnerTexts();
  check('Ann: the published list shows both with a date', rowsText.length === 2 && rowsText.every((text) => /Published .*2026/.test(text)), rowsText.join(' | '));
  await shot(ann.page, 'desktop-2b-published-list');
  check('Ann: published workspaces are not offered for a new publish', await (async () => {
    await ann.page.locator('button', { hasText: 'Publish new workspace' }).click();
    const none = await ann.page.locator('select[aria-label="Workspace to share"] option', { hasText: /^spanish-lv[12]$/ }).count();
    await ann.page.locator('.publish-dialog button', { hasText: 'Cancel' }).click();
    return none === 0;
  })());

  // ---------------------------------------------------------------- Bo (phone): browse, preview, clone
  const bo = await newUserContext(BO, true);
  await bo.page.goto(BASE_URL);
  await bo.page.waitForSelector('.top-bar-hamburger');
  await settle(bo.page);
  await openPage(bo.page, 'Sharing hub');
  await bo.page.waitForSelector('.sharing-row');
  check('Bo: sees both shared workspaces', (await bo.page.locator('.sharing-row').count()) === 2);
  check('Bo: sees the owner label, not the email', (await bodyText(bo.page)).includes('by Ann') && !(await bodyText(bo.page)).includes('ann@example.com'));
  await shot(bo.page, 'phone-1-browse');
  await bo.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).locator('button', { hasText: 'Preview' }).click();
  await bo.page.waitForSelector('.sharing-modal .sharing-preview li');
  check('Bo: preview opens as a pop-up modal', (await bo.page.locator('.modal-overlay .sharing-modal').count()) === 1);
  const preview = await bo.page.locator('.sharing-modal .sharing-preview').innerText();
  check('Bo: preview lists titles', preview.includes('Spanish Greetings') && preview.includes('Greetings Quiz') && !preview.includes('Private Notes'));
  await shot(bo.page, 'phone-2-preview');

  await bo.page.locator('.sharing-modal button', { hasText: 'Clone to new workspace' }).click();
  await bo.page.locator('input[aria-label="New workspace name"]').fill('Spanish (from Ann) lv1');
  await shot(bo.page, 'phone-3-clone-form');
  await bo.page.locator('.sharing-modal button', { hasText: /^Clone$/ }).click();
  await bo.page.waitForSelector('.sharing-ok');
  await settle(bo.page);
  const boLv1 = keyOf(BO.id, 'Spanish (from Ann) lv1');
  check('Bo: clone is a NEW workspace of his own', Boolean(boLv1) && boLv1!.startsWith('shared-'));
  check('Bo: clone has the lessons, test and roadmap', rows('lessons', BO.id, boLv1).length === 2 && rows('tests', BO.id, boLv1).length === 1 && rows('roadmaps', BO.id, boLv1).length === 1);
  check('Bo: clone starts with roadmap progress reset', !String(rows('roadmaps', BO.id, boLv1)[0]?.yaml).includes('finished: true'));
  check('Bo: nothing was written to Ann\'s rows', rows('lessons', ANN.id).every((row) => row.workspace_key !== boLv1));
  check('Bo: the opened workspace is the clone', (await bodyText(bo.page)).includes('Spanish (from Ann) lv1'));
  await shot(bo.page, 'phone-4-cloned');
  await openPage(bo.page, 'Lessons');
  check('Bo: Lessons page shows the cloned lessons', (await bodyText(bo.page)).includes('Spanish Greetings'));
  await shot(bo.page, 'phone-5-cloned-lessons');

  // Snapshot, not real time: Ann changes her lv1 afterwards and re-publishes; Bo's clone does not move.
  await editPublished(ann.page, 'Spanish lv1', 'Spanish lv1 (updated)', ['Spanish Numbers', 'Private Notes']);
  await ann.page.locator('button', { hasText: 'Update snapshot' }).click();
  await ann.page.waitForSelector('.sharing-ok');
  check('Ann: re-publishing updates the same snapshot', db.shared_workspaces.filter((row) => String(row.name).startsWith('Spanish lv1')).length === 1 && db.shared_workspaces.some((row) => row.name === 'Spanish lv1 (updated)' && row.lesson_count === 1));
  check('Bo: his clone is unchanged by the re-publish', rows('lessons', BO.id, boLv1).length === 2);
  // Put it back for the merge scenario.
  await editPublished(ann.page, 'Spanish lv1 (updated)', 'Spanish lv1', ['Private Notes']);
  await ann.page.locator('button', { hasText: 'Update snapshot' }).click();
  await ann.page.waitForSelector('.sharing-ok');

  // Bo clones lv2 as well (second friend)
  await openPage(bo.page, 'Sharing hub');
  await bo.page.waitForSelector('.sharing-row');
  await bo.page.locator('.sharing-row', { hasText: 'Spanish lv2' }).locator('button', { hasText: /^Clone$/ }).click();
  await bo.page.locator('input[aria-label="New workspace name"]').fill('Spanish (from Cy) lv2');
  await bo.page.locator('.sharing-modal button', { hasText: /^Clone$/ }).click();
  await bo.page.waitForSelector('.sharing-ok');
  await settle(bo.page);
  const boLv2 = keyOf(BO.id, 'Spanish (from Cy) lv2');
  check('Bo: second clone exists', Boolean(boLv2) && rows('lessons', BO.id, boLv2).length === 3);

  // ---------------------------------------------------------------- Votes and stars
  await openPage(bo.page, 'Sharing hub');
  await bo.page.waitForSelector('.sharing-row');
  const card = (title: string) => bo.page.locator('.sharing-row', { hasText: title });
  await card('Spanish lv2').locator('button[aria-label^="Upvote"]').click();
  await card('Spanish lv1').locator('button[aria-label$="(0)"]', { hasText: '☆' }).click();
  await bo.page.waitForTimeout(500);
  const lv1Id = db.shared_workspaces.find((row) => row.name === 'Spanish lv1')!.id;
  const lv2Id = db.shared_workspaces.find((row) => row.name === 'Spanish lv2')!.id;
  const boRows = db.shared_workspace_reactions.filter((row) => row.user_id === BO.id);
  check('Votes: upvote and star are saved for Bo only', boRows.length === 2 && boRows.some((r) => r.shared_id === lv2Id && r.vote === 1) && boRows.some((r) => r.shared_id === lv1Id && r.starred === true));
  check('Votes: the card shows the new totals at once', (await card('Spanish lv2').locator('button[aria-label^="Upvote"]').innerText()).includes('1') && (await card('Spanish lv1').locator('button[aria-pressed="true"]').count()) === 1);
  await shot(bo.page, 'phone-12-votes-stars');
  await card('Spanish lv2').locator('button[aria-label^="Downvote"]').click();
  await bo.page.waitForTimeout(400);
  check('Votes: the other direction switches the vote', db.shared_workspace_reactions.find((r) => r.user_id === BO.id && r.shared_id === lv2Id)?.vote === -1);
  await card('Spanish lv2').locator('button[aria-label^="Downvote"]').click();
  await bo.page.waitForTimeout(400);
  check('Votes: clicking the same vote again clears it', db.shared_workspace_reactions.find((r) => r.user_id === BO.id && r.shared_id === lv2Id)?.vote === 0);
  await bo.page.locator('button[aria-label="Sort"]').click();
  await shot(bo.page, 'phone-18-sort-popover');
  await bo.page.locator('.popover-panel label', { hasText: 'Most starred' }).click();
  await bo.page.keyboard.press('Escape');
  check('Votes: "Most starred" puts the starred one first', (await bo.page.locator('.sharing-row-title').first().innerText()) === 'Spanish lv1');
  await bo.page.locator('button[aria-label="Filter"]').click();
  await bo.page.locator('input[aria-label="Apply My starred only"]').check();
  await shot(bo.page, 'phone-19-filter-popover');
  await bo.page.keyboard.press('Escape');
  check('Filter icon shows a badge while a filter is on', (await bo.page.locator('button[aria-label="Filter"] .icon-badge').innerText()) === '1');
  check('Votes: "My starred only" shows just the starred one', (await bo.page.locator('.sharing-row').count()) === 1);
  await shot(bo.page, 'phone-13-starred-only');
  await bo.page.locator('button[aria-label="Filter"]').click();
  await bo.page.locator('input[aria-label="Apply My starred only"]').uncheck();
  await bo.page.keyboard.press('Escape');
  await bo.page.locator('button[aria-label="Sort"]').click();
  await bo.page.locator('.popover-panel label', { hasText: 'Newest published' }).click();
  await bo.page.keyboard.press('Escape');

  // Filters by title, author and publish date; paging with 10/20/50 and show more / hide.
  const rowCount = () => bo.page.locator('.sharing-row').count();
  await bo.page.locator('button[aria-label="Filter"]').click();
  await bo.page.locator('input[aria-label="Filter by title"]').fill('lv2');
  check('Filter: title "lv2" leaves one row', (await rowCount()) === 1);
  check('Filter: typing a value ticks its checkbox', await bo.page.locator('input[aria-label="Apply filter: Title contains"]').isChecked());
  await shot(bo.page, 'phone-21-filter-checkbox-on');
  await bo.page.locator('input[aria-label="Apply filter: Title contains"]').uncheck();
  check('Filter: unticking stops applying it but keeps the text', (await rowCount()) === 2 && (await bo.page.locator('input[aria-label="Filter by title"]').inputValue()) === 'lv2');
  await bo.page.locator('input[aria-label="Apply filter: Title contains"]').check();
  check('Filter: ticking it again applies it', (await rowCount()) === 1);
  await bo.page.locator('input[aria-label="Filter by title"]').fill('');
  await bo.page.locator('input[aria-label="Filter by tag"]').fill('begin');
  check('Filter: tag "begin" leaves only the beginner workspace and ticks its box', (await rowCount()) === 1 && await bo.page.locator('input[aria-label="Apply filter: Tag contains"]').isChecked());
  await bo.page.locator('input[aria-label="Filter by tag"]').fill('');
  await bo.page.locator('input[aria-label="Filter by author"]').fill('nobody');
  check('Filter: an author nobody has shows "No match"', (await rowCount()) === 0 && (await bodyText(bo.page)).includes('No match'));
  await bo.page.locator('input[aria-label="Filter by author"]').fill('ann');
  check('Filter: author "ann" (any case) finds Ann\'s rows', (await rowCount()) >= 2);
  await bo.page.locator('input[aria-label="Filter by author"]').fill('');
  await bo.page.locator('input[aria-label="Published after"]').fill('2999-01-01');
  check('Filter: published after a future day leaves nothing', (await rowCount()) === 0);
  await bo.page.locator('input[aria-label="Published after"]').fill('');
  await bo.page.locator('input[aria-label="Published before"]').fill('2000-01-01');
  check('Filter: published before 2000 leaves nothing', (await rowCount()) === 0);
  await bo.page.locator('.popover-panel button', { hasText: 'Clear filters' }).click();
  check('Filter: clearing brings every row back', (await rowCount()) === 2);
  await bo.page.keyboard.press('Escape');
  await bo.page.keyboard.press('Escape');
  check('Tags: rows show their tags', (await bo.page.locator('.sharing-row', { hasText: 'Spanish lv2' }).locator('.tag-chip').allInnerTexts()).join(',') === 'spanish,advanced');
  await bo.page.locator('.sharing-row', { hasText: 'Spanish lv2' }).locator('.tag-chip', { hasText: 'advanced' }).click();
  check('Tags: clicking a tag chip filters by it', (await rowCount()) === 1 && (await bo.page.locator('button[aria-label="Filter"] .icon-badge').innerText()) === '1');
  await shot(bo.page, 'phone-22-tag-chip-filter');
  await bo.page.locator('button[aria-label="Filter"]').click();
  check('Tags: the tag filter shows the picked tag, ticked', (await bo.page.locator('input[aria-label="Filter by tag"]').inputValue()) === 'advanced' && await bo.page.locator('input[aria-label="Apply filter: Tag contains"]').isChecked());
  await bo.page.locator('.popover-panel button', { hasText: 'Clear filters' }).click();
  await bo.page.keyboard.press('Escape');
  const filler = Array.from({ length: 12 }, (_, index) => ({
    id: randomUUID(), owner_id: ANN.id, source_workspace_key: `filler-${index}`, name: `Filler ${String(index).padStart(2, '0')}`, description: '', owner_label: 'Ann',
    lesson_count: 1, test_count: 0, roadmap_count: 0, published_at: new Date(Date.now() - (index + 1) * 60000).toISOString(), updated_at: new Date(Date.now() - (index + 1) * 60000).toISOString(),
  }));
  db.shared_workspaces.push(...filler);
  await openPage(bo.page, 'Sharing hub');
  await bo.page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await bo.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await bo.page.waitForSelector('.sharing-row');
  await bo.page.waitForTimeout(500);
  check('Paging: only the top 10 rows are drawn', (await rowCount()) === 10);
  await shot(bo.page, 'phone-20-top-10');
  await bo.page.locator('button', { hasText: /Show \d+ more/ }).click();
  check('Paging: "Show more" reveals the rest', (await rowCount()) === 14);
  await bo.page.locator('button', { hasText: 'Hide extra rows' }).click();
  check('Paging: "Hide extra rows" goes back to 10', (await rowCount()) === 10);
  await bo.page.locator('select[aria-label="Rows to show"]').selectOption('20');
  check('Paging: Top 20 draws all 14', (await rowCount()) === 14 && (await bo.page.locator('button', { hasText: /Show \d+ more/ }).count()) === 0);
  await bo.page.locator('select[aria-label="Rows to show"]').selectOption('10');
  db.shared_workspaces = db.shared_workspaces.filter((row) => !String(row.source_workspace_key).startsWith('filler-'));
  await openPage(ann.page, 'Sharing hub');
  await ann.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await ann.page.waitForSelector('.sharing-row');
  check('Votes: the owner cannot vote on or star her own share', (await ann.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).locator('button[aria-label^="Upvote"]').isDisabled()));
  check('Votes: the owner sees the star total but not who starred', (await ann.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).locator('button[aria-label$="(1)"]').count()) >= 1);
  await shot(ann.page, 'desktop-10-votes-owner-view');

  // Bo has revised some questions in each workspace.
  const rec = (hash: string, quiz: string, last: string) => ({ user_id: BO.id, hash, last_time: last, data: { question_name: `${quiz} q`, options: ['A', 'B'], correct_answer: 'A', last_time: last, next_revision_time: '2026-11-20T00:00:00.000Z', proficiency: '2', quiz_title: quiz, hash } });
  db.revision_records.push(
    { ...rec('h-greet', 'Greetings Quiz', '2026-11-01T00:00:00.000Z'), workspace_key: boLv1 },
    { ...rec('h-past', 'Past Tense Quiz', '2026-11-02T00:00:00.000Z'), workspace_key: boLv2 },
    { ...rec('h-common', 'Greetings Quiz', '2026-11-01T00:00:00.000Z'), workspace_key: boLv1 },
    { ...rec('h-common', 'Greetings Quiz', '2026-11-05T00:00:00.000Z'), workspace_key: boLv2 },
  );

  // ---------------------------------------------------------------- Merge (phone)
  await bo.page.locator('.top-bar-hamburger').click().catch(() => undefined);
  await bo.page.keyboard.press('Escape');
  await bo.page.locator('.top-bar-workspace-trigger').click();
  await shot(bo.page, 'phone-6-workspace-menu');
  await bo.page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Merge workspaces' }).click();
  await bo.page.waitForSelector('.merge-dialog');
  await bo.page.locator('.merge-list .sharing-check', { hasText: 'lv1' }).locator('input').check();
  await bo.page.locator('.merge-list .sharing-check', { hasText: 'lv2' }).locator('input').check();
  await bo.page.locator('input[aria-label="Merged workspace name"]').fill('Spanish lv1+lv2');
  await shot(bo.page, 'phone-7-merge-dialog');
  await bo.page.locator('button', { hasText: 'Merge 2 workspaces' }).click();
  await bo.page.waitForSelector('.merge-report');
  const report = await bo.page.locator('.merge-report').innerText();
  console.log('  report:', report.replace(/\n/g, ' | '));
  await shot(bo.page, 'phone-8-merge-report');
  const merged = keyOf(BO.id, 'Spanish lv1+lv2');
  check('Merge: a new merged workspace exists', Boolean(merged));
  const mergedLessons = rows('lessons', BO.id, merged).map((row) => String(row.title)).sort();
  check('Merge: 4 lessons (greetings, numbers once, past tense kept alongside, food)', mergedLessons.length === 4, mergedLessons.join(' / '));
  check('Merge: the identical lesson is kept once', mergedLessons.filter((t) => t === 'Spanish Numbers').length === 1);
  check('Merge: the same-id lesson with other content is kept, renamed', mergedLessons.some((t) => t.startsWith('Spanish Past Tense (')) && rows('lessons', BO.id, merged).some((row) => String(row.id).startsWith('lesson-1-')));
  check('Merge: both tests and both roadmaps are there', rows('tests', BO.id, merged).length === 2 && rows('roadmaps', BO.id, merged).length === 2);
  const lv2Map = rows('roadmaps', BO.id, merged).find((row) => String(row.yaml).includes('lv2'));
  check('Merge: lv2 roadmap links follow the renamed lesson and test', Boolean(lv2Map) && /lesson-1-/.test(String(lv2Map!.yaml)) && /quiz-1-/.test(String(lv2Map!.yaml)), String(lv2Map?.yaml).replace(/\n/g, ' '));
  const mergedRevision = rows('revision_records', BO.id, merged);
  check('Merge: revision records of both sources are carried over, one per question', mergedRevision.length === 3 && ['h-greet', 'h-past', 'h-common'].every((h) => mergedRevision.some((row) => row.hash === h)), mergedRevision.map((r) => r.hash).join(','));
  check('Merge: the newest answer wins for a shared question', mergedRevision.find((row) => row.hash === 'h-common')?.last_time === '2026-11-05T00:00:00.000Z');
  check('Merge: the sources are untouched', rows('lessons', BO.id, boLv1).length === 2 && rows('lessons', BO.id, boLv2).length === 3 && rows('revision_records', BO.id, boLv1).length === 2);
  check('Merge: Ann\'s data is untouched', rows('lessons', ANN.id).length === 6);
  await bo.page.locator('button', { hasText: 'Open merged workspace' }).click();
  await settle(bo.page);
  await openPage(bo.page, 'Lessons');
  const lessonsText = await bodyText(bo.page);
  check('Merge: the merged workspace opens with all lessons', lessonsText.includes('Spanish Food') && lessonsText.includes('Spanish Greetings'));
  await shot(bo.page, 'phone-9-merged-lessons');
  await openPage(bo.page, 'Revision');
  await bo.page.locator('.tests-page .sidebar-toggle').last().click();
  await bo.page.locator('button', { hasText: 'Learnt Summary' }).first().click();
  await bo.page.waitForTimeout(800);
  check('Merge: Revision shows the merged questions together', (await bodyText(bo.page)).includes('Past Tense Quiz'));
  await shot(bo.page, 'phone-10-merged-revision');

  // desktop view of the same screens (layout is width based)
  await bo.page.setViewportSize({ width: 1280, height: 800 });
  await openPage(bo.page, 'Sharing hub');
  await bo.page.waitForSelector('.sharing-row');
  await shot(bo.page, 'desktop-3-browse');
  await bo.page.locator('.top-bar-workspace-trigger').click();
  await bo.page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Merge workspaces' }).click();
  await bo.page.waitForSelector('.merge-dialog');
  await bo.page.locator('.merge-list .sharing-check', { hasText: 'lv1' }).first().locator('input').check();
  await bo.page.locator('.merge-list .sharing-check', { hasText: 'lv2' }).first().locator('input').check();
  await shot(bo.page, 'desktop-4-merge-dialog');
  // merge into an existing (cloud-only) workspace: lv1 absorbs lv2 again, nothing duplicates
  await bo.page.locator('label', { hasText: 'One of the selected workspaces' }).locator('input').check();
  await bo.page.locator('select[aria-label="Existing target workspace"]').selectOption({ label: 'Spanish (from Ann) lv1' });
  await bo.page.locator('button', { hasText: 'Merge 2 workspaces' }).click();
  await bo.page.waitForSelector('.merge-report');
  check('Merge into an existing workspace: lv1 now holds all 4 lessons', rows('lessons', BO.id, boLv1).length === 4);
  const again = await bo.page.locator('.merge-report').innerText();
  check('Merge into an existing workspace: report says duplicates were skipped', /duplicate/.test(again), again.replace(/\n/g, ' | '));
  await shot(bo.page, 'desktop-5-merge-into-existing');
  await bo.page.locator('button', { hasText: 'Close' }).click();

  // ---------------------------------------------------------------- Duplicate workspace
  const beforeLessons = rows('lessons', BO.id, merged).length;
  const beforeRevision = rows('revision_records', BO.id, merged).length;
  await bo.page.locator('.top-bar-workspace-trigger').click();
  await shot(bo.page, 'desktop-7-workspace-menu');
  await bo.page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Duplicate workspace' }).click();
  await bo.page.waitForSelector('.merge-dialog');
  await bo.page.locator('select[aria-label="Workspace to duplicate"]').selectOption({ label: 'Spanish lv1+lv2' });
  await bo.page.locator('input[aria-label="Name of the copy"]').fill('Spanish lv1+lv2 (sandbox)');
  await shot(bo.page, 'desktop-8-duplicate-dialog');
  await bo.page.locator('button', { hasText: /^Duplicate$/ }).click();
  await bo.page.waitForSelector('.merge-report');
  await shot(bo.page, 'desktop-9-duplicate-done');
  const copyKey = keyOf(BO.id, 'Spanish lv1+lv2 (sandbox)');
  check('Duplicate: a new workspace with its own key exists', Boolean(copyKey) && copyKey !== merged && copyKey!.startsWith('copy-'));
  check('Duplicate: every lesson, test, roadmap is copied exactly', rows('lessons', BO.id, copyKey).length === beforeLessons && rows('tests', BO.id, copyKey).length === 2 && rows('roadmaps', BO.id, copyKey).length === 2 && JSON.stringify(rows('lessons', BO.id, copyKey).map((r) => [r.id, r.content]).sort()) === JSON.stringify(rows('lessons', BO.id, merged).map((r) => [r.id, r.content]).sort()));
  check('Duplicate: revision progress is copied', rows('revision_records', BO.id, copyKey).length === beforeRevision);
  check('Duplicate: the original is unchanged', rows('lessons', BO.id, merged).length === beforeLessons && rows('revision_records', BO.id, merged).length === beforeRevision);
  await bo.page.locator('button', { hasText: 'Open the copy' }).click();
  await settle(bo.page);
  check('Duplicate: the copy opens', ((await bo.page.locator('.top-bar-workspace-label').textContent()) ?? '').includes('Spanish lv1+lv2 (sandbox)'));
  // Changing the copy (delete one lesson in the cloud copy) leaves the original alone.
  db.lessons = db.lessons.filter((row) => !(row.user_id === BO.id && row.workspace_key === copyKey && row.id === 'lesson-3'));
  check('Duplicate: editing the copy does not affect the original', rows('lessons', BO.id, merged).some((row) => row.id === 'lesson-3'));
  await bo.page.setViewportSize({ width: 390, height: 844 });
  await bo.page.locator('.top-bar-workspace-trigger').click();
  await bo.page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Duplicate workspace' }).click();
  await bo.page.waitForSelector('.merge-dialog');
  await shot(bo.page, 'phone-11-duplicate-dialog');
  await bo.page.locator('button', { hasText: 'Cancel' }).click();
  await bo.page.setViewportSize({ width: 1280, height: 800 });

  // ---------------------------------------------------------------- Hostile snapshot: cleaned on clone and never executed
  const evil = {
    lessons: [{ id: 'evil', title: 'Evil lesson', content: '# Evil lesson\n<script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">\n[click](javascript:window.__pwned=3)\n<iframe src="https://evil.example"></iframe>\nSafe text.' }],
    tests: [{ id: 'et', title: '<img src=x onerror=window.__pwned=4>', questions: [{ question_number: 1, question: '<b>Q</b>', options: ['A', 'B'], correct_answer: 'A' }] }],
    roadmaps: [{ id: 'er', name: 'Evil map', yaml: '- id: n\n  label: Node\n  url: "javascript:window.__pwned=5"\n  finished: true\n  secret: !!str x\n' }],
    lessonStructure: { folders: [], items: ['evil'] }, testsStructure: { revision: { folders: [], items: [] }, new_tests: { folders: [], items: ['et'] } },
  };
  db.shared_workspaces.push({ id: randomUUID(), owner_id: ANN.id, source_workspace_key: 'hostile', name: 'Totally safe', description: '<img src=x onerror=window.__pwned=6>', owner_label: 'Mallory', lesson_count: 1, test_count: 1, roadmap_count: 1, content: evil, published_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await openPage(bo.page, 'Sharing hub');
  await bo.page.locator('button', { hasText: 'Browse shared' }).first().click().catch(() => undefined);
  await bo.page.reload();
  await bo.page.waitForSelector('.top-bar-workspace-trigger');
  await settle(bo.page);
  await openPage(bo.page, 'Sharing hub');
  await bo.page.waitForSelector('.sharing-row');
  const hostile = bo.page.locator('.sharing-row', { hasText: 'Totally safe' });
  await hostile.locator('button', { hasText: 'Preview' }).click();
  await bo.page.locator('.sharing-modal button', { hasText: 'Clone to new workspace' }).click();
  await bo.page.locator('input[aria-label="New workspace name"]').fill('Hostile clone');
  await bo.page.locator('.sharing-modal button', { hasText: /^Clone$/ }).click();
  await bo.page.waitForSelector('.sharing-ok');
  await settle(bo.page);
  const hostileKey = keyOf(BO.id, 'Hostile clone');
  const storedLesson = String(rows('lessons', BO.id, hostileKey)[0]?.content);
  check('Hostile: script, handlers, javascript: links and iframes are stripped on clone', !/<script|onerror|javascript:|<iframe/i.test(storedLesson) && storedLesson.includes('Safe text.'), storedLesson.replace(/\n/g, ' '));
  const storedRoadmap = String(rows('roadmaps', BO.id, hostileKey)[0]?.yaml);
  check('Hostile: roadmap link dropped, unknown fields dropped, progress reset', !/javascript:|secret|finished: true/.test(storedRoadmap), storedRoadmap.replace(/\n/g, ' '));
  await openPage(bo.page, 'Lessons');
  await openPage(bo.page, 'Tests');
  await openPage(bo.page, 'Roadmap');
  await bo.page.waitForTimeout(800);
  const pwned = await bo.page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned);
  check('Hostile: nothing from the stranger executed in the page', pwned === undefined, String(pwned));

  // ---------------------------------------------------------------- Hardening: report, take-down, rejected publish
  await openPage(bo.page, 'Sharing hub');
  await bo.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await bo.page.waitForSelector('.sharing-row');
  const trap = bo.page.locator('.sharing-row', { hasText: 'Totally safe' });
  await trap.locator('button', { hasText: 'Report' }).click();
  await bo.page.waitForSelector('[aria-label="Report workspace"], .sharing-modal select[aria-label="Report reason"]');
  await bo.page.locator('select[aria-label="Report reason"]').selectOption('malicious');
  await bo.page.locator('textarea[aria-label="Report details"]').fill('Tries to run a script when previewed.');
  await shot(bo.page, 'hardening-phone-1-report-modal');
  await bo.page.locator('.sharing-modal button', { hasText: 'Send report' }).click();
  await bo.page.waitForSelector('.sharing-ok');
  check('Report: a report row is saved with the reason and note', db.shared_workspace_reports.length === 1 && db.shared_workspace_reports[0].reason === 'malicious' && db.shared_workspace_reports[0].reporter_id === BO.id && String(db.shared_workspace_reports[0].note).includes('script'));
  check('Report: Bo sees a thank-you message', (await bodyText(bo.page)).includes('Your report was sent'));
  await shot(bo.page, 'hardening-phone-2-report-sent');
  await trap.locator('button', { hasText: 'Report' }).click();
  await bo.page.locator('.sharing-modal button', { hasText: 'Send report' }).click();
  await bo.page.waitForSelector('.sharing-modal .tree-error');
  check('Report: reporting the same share twice is refused politely', (await bo.page.locator('.sharing-modal .tree-error').innerText()).includes('already reported'));
  await bo.page.locator('.sharing-modal button', { hasText: 'Cancel' }).click();
  check('Report: Ann cannot report her own share (no button)', await (async () => {
    await openPage(ann.page, 'Sharing hub');
    await ann.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
    await ann.page.waitForSelector('.sharing-row');
    return (await ann.page.locator('.sharing-row', { hasText: 'Totally safe' }).locator('button', { hasText: 'Report' }).count()) === 0;
  })());

  // The server hides a share after 3 reports or on your say-so (hidden = true): others stop seeing it, the owner sees a badge.
  db.shared_workspaces.find((row) => row.name === 'Totally safe')!.hidden = true;
  await bo.page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await bo.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await bo.page.waitForSelector('.sharing-row');
  check('Take-down: a hidden share disappears for other users', (await bo.page.locator('.sharing-row', { hasText: 'Totally safe' }).count()) === 0);
  await ann.page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await ann.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await ann.page.waitForSelector('.sharing-row');
  check('Take-down: the owner still sees it, marked "Taken down"', (await ann.page.locator('.sharing-row', { hasText: 'Totally safe' }).innerText()).includes('Taken down'));
  await shot(ann.page, 'hardening-desktop-1-owner-sees-taken-down');
  db.shared_workspaces = db.shared_workspaces.filter((row) => row.name !== 'Totally safe');

  // Publishing content that is not plain Markdown is refused with a reason (the database refuses it too).
  await pickFolder(ann.page, 'spanish-evil');
  await publish(ann.page, 'spanish-evil', 'Evil', []);
  await ann.page.locator('button', { hasText: 'Publish snapshot' }).click();
  await ann.page.waitForSelector('.publish-dialog .tree-error');
  const refusal = await ann.page.locator('.publish-dialog .tree-error').innerText();
  check('Publish: raw HTML, images and script links are refused with a clear reason', /Cannot publish/.test(refusal) && /raw HTML/.test(refusal) && /image/.test(refusal) && /http/.test(refusal), refusal.replace(/\n/g, ' | '));
  check('Publish: nothing was stored for the refused workspace', !db.shared_workspaces.some((row) => row.source_workspace_key === 'spanish-evil'));
  await shot(ann.page, 'hardening-desktop-2-publish-refused');
  await ann.page.locator('.publish-dialog button', { hasText: 'Cancel' }).click();
  await pickFolder(ann.page, 'spanish-lv1');

  // ---------------------------------------------------------------- Unpublish
  await openPage(ann.page, 'Sharing hub');
  await ann.page.locator('.sharing-tab', { hasText: 'Browse shared' }).click();
  await ann.page.waitForSelector('.sharing-row');
  check('Ann: her own cards say "Yours" and have no Clone', (await ann.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).innerText()).includes('Yours') && (await ann.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).locator('button', { hasText: 'Clone' }).count()) === 0);
  await shot(ann.page, 'desktop-6-browse-own');
  await ann.page.locator('.sharing-row', { hasText: 'Spanish lv1' }).locator('button', { hasText: 'Unpublish' }).click();
  await ann.page.locator('[aria-label="Unpublish workspace"] button', { hasText: /^Unpublish$/ }).click();
  await ann.page.waitForTimeout(800);
  check('Ann: unpublished lv1 is gone from the hub', !db.shared_workspaces.some((row) => row.name === 'Spanish lv1'));
  check('Bo: his clone survives the unpublish', rows('lessons', BO.id, boLv1).length === 4);

  // The same screens on a phone-sized viewport.
  await openPage(ann.page, 'Sharing hub');
  await ann.page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await ann.page.setViewportSize({ width: 390, height: 844 });
  await ann.page.waitForTimeout(300);
  await shot(ann.page, 'phone-14-published-list');
  await ann.page.locator('button', { hasText: 'Publish new workspace' }).click();
  await ann.page.waitForSelector('.publish-dialog');
  await shot(ann.page, 'phone-15-publish-modal');
  await ann.page.locator('.publish-dialog button', { hasText: 'Cancel' }).click();
  await ann.page.locator('.published-row', { hasText: 'Spanish lv2' }).locator('button[aria-label^="Edit published"]').click();
  await ann.page.waitForSelector('.sharing-checklists');
  await ann.page.waitForTimeout(400);
  await shot(ann.page, 'phone-16-edit-modal');
  await ann.page.locator('.publish-dialog button', { hasText: 'Cancel' }).click();
  await ann.page.locator('.published-row', { hasText: 'Spanish lv2' }).locator('button[aria-label^="Unpublish"]').click();
  await shot(ann.page, 'phone-17-unpublish-confirm');
  await ann.page.locator('[aria-label="Unpublish workspace"] button', { hasText: 'Cancel' }).click();
  await ann.page.setViewportSize({ width: 1280, height: 800 });

  // Unpublish from the published list: the bin asks first, Cancel keeps it, confirming removes it.
  await openPage(ann.page, 'Sharing hub');
  await ann.page.locator('.sharing-tab', { hasText: 'Share my workspace' }).click();
  await ann.page.locator('.published-row', { hasText: 'Spanish lv2' }).locator('button[aria-label^="Unpublish"]').click();
  await ann.page.waitForSelector('[aria-label="Unpublish workspace"]');
  await shot(ann.page, 'desktop-11-unpublish-confirm');
  await ann.page.locator('[aria-label="Unpublish workspace"] button', { hasText: 'Cancel' }).click();
  check('Ann: cancelling the confirmation keeps lv2 published', db.shared_workspaces.some((row) => row.name === 'Spanish lv2'));
  await ann.page.locator('.published-row', { hasText: 'Spanish lv2' }).locator('button[aria-label^="Unpublish"]').click();
  await ann.page.locator('[aria-label="Unpublish workspace"] button', { hasText: /^Unpublish$/ }).click();
  await ann.page.waitForTimeout(800);
  check('Ann: confirming unpublishes lv2 and its row disappears', !db.shared_workspaces.some((row) => row.name === 'Spanish lv2') && (await ann.page.locator('.published-row', { hasText: 'Spanish lv2' }).count()) === 0);
  await shot(ann.page, 'desktop-12-list-empty');

  await Promise.all(contexts.map((context) => context.close()));
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void run();
