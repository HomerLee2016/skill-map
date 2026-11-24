// Adding, editing and deleting lessons and tests in the app, and what that does to the folder and the cloud copy.
// PC = a folder workspace (an OPFS directory), phone = no folder, cloud copy only. Supabase is an in-memory PostgREST fake.
//
// Usage: VITE_SUPABASE_URL=http://fake.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite --host 127.0.0.1 --port 4173
//        SHOTS=/some/dir npx tsx regression/content-editing.e2e.ts [baseUrl]
import { chromium, devices, type BrowserContext, type Page } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveWorkspaceStorageKey } from '../src/services/workspaceKey';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS;
const API = 'http://fake.supabase.test';
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'homer@example.com' };

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { workspaces: [], lessons: [], tests: [], roadmaps: [], workspace_structures: [], revision_records: [], content_tombstones: [] };
const PK: Record<string, string[]> = {
  workspaces: ['key'], lessons: ['workspace_key', 'id'], tests: ['workspace_key', 'id'], roadmaps: ['workspace_key', 'id'],
  workspace_structures: ['workspace_key', 'kind'], revision_records: ['workspace_key', 'hash'], content_tombstones: ['workspace_key', 'kind', 'id'],
};
let clock = Date.parse('2026-11-24T10:00:00Z');
const stamp = () => new Date((clock += 1000)).toISOString();

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
    const prefer = request.headers()['prefer'] ?? '';
    const wantsRows = prefer.includes('return=representation');
    const timestamped = ['lessons', 'tests', 'roadmaps'].includes(table);
    if (request.method() === 'GET') return route.fulfill({ status: 200, headers, body: JSON.stringify(filterRows(db[table], url.searchParams)) });
    if (request.method() === 'DELETE') {
      const doomed = new Set(filterRows(db[table], url.searchParams));
      db[table] = db[table].filter((row) => !doomed.has(row));
      if (table === 'workspaces') {
        const gone = new Set([...doomed].map((row) => row.key));
        for (const child of Object.keys(db)) if (child !== 'workspaces') db[child] = db[child].filter((row) => !gone.has(row.workspace_key as string));
      }
      return route.fulfill({ status: wantsRows ? 200 : 204, headers, body: wantsRows ? JSON.stringify([...doomed]) : '' });
    }
    if (request.method() === 'PATCH') {
      const hits = filterRows(db[table], url.searchParams);
      const patch = JSON.parse(request.postData() || '{}') as Row;
      for (const row of hits) { Object.assign(row, patch); if (timestamped) row.updated_at = stamp(); }
      return route.fulfill({ status: wantsRows ? 200 : 204, headers, body: wantsRows ? JSON.stringify(hits) : '' });
    }
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '[]') as Row | Row[];
      const merge = prefer.includes('resolution=merge-duplicates');
      const written: Row[] = [];
      for (const row of Array.isArray(body) ? body : [body]) {
        const full: Row = { user_id: USER.id, ...row };
        if (timestamped) full.updated_at = stamp();
        const same = (other: Row) => PK[table].every((col) => other[col] === full[col]);
        const index = db[table].findIndex(same);
        if (index >= 0 && !merge) return route.fulfill({ status: 409, headers, body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }) });
        if (index >= 0) db[table][index] = { ...db[table][index], ...full }; else db[table].push(full);
        written.push(full);
      }
      return route.fulfill({ status: 201, headers, body: wantsRows ? JSON.stringify(written) : '' });
    }
    return route.fulfill({ status: 405, headers, body: '{}' });
  });
}

async function seedSession(context: BrowserContext) {
  const session = {
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    user: { id: USER.id, email: USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await context.addInitScript((value) => localStorage.setItem('sb-fake-auth-token', value), JSON.stringify(session));
}

const LESSON_MD = '# Konnichiwa Lesson\n\nBody text.\n';
const QUIZ_YAML = 'quiz_title: Starter Quiz\nquestions:\n  - question_number: 1\n    question: "Q?"\n    options: ["A", "B", "C", "D"]\n    correct_answer: "A"\n';
const ROADMAP = '# my map\n- id: root\n  label: Root\n  lessons:\n    - l1\n  tests:\n    - t1\n';

async function seedOpfs(page: Page, name: string, files: Record<string, string>) {
  await page.evaluate(async ({ name, files }) => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle(name, { create: true });
    for (const [file, text] of Object.entries(files)) {
      const [folder, fileName] = file.split('/');
      const dir = await ws.getDirectoryHandle(folder, { create: true });
      const handle = await dir.getFileHandle(fileName, { create: true });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    }
  }, { name, files });
}

const readOpfs = (page: Page, name: string, file: string) => page.evaluate(async ({ name, file }) => {
  try {
    const [folder, fileName] = file.split('/');
    const ws = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    const dir = await ws.getDirectoryHandle(folder);
    return await (await (await dir.getFileHandle(fileName)).getFile()).text();
  } catch { return null; }
}, { name, file });

const writeOpfs = (page: Page, name: string, file: string, text: string) => seedOpfs(page, name, { [file]: text });

async function selectOnPc(page: Page, name: string) {
  await page.evaluate((n) => {
    (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(n);
  }, name);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item--action', { hasText: 'Browse from local' }).click();
  await page.waitForFunction(() => !document.querySelector('.top-bar-workspace-trigger')?.textContent?.includes('Loading'));
  await page.waitForTimeout(1800);
}

const shot = async (page: Page, dir: string, file: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dir}-${file}.png` }); };

async function go(page: Page, label: string, mobile: boolean) {
  const link = page.locator('button.top-bar-link', { hasText: label });
  if (mobile && !(await link.isVisible())) await page.locator('.top-bar-hamburger').click();
  await link.click();
  await page.waitForTimeout(500);
}

async function syncNow(page: Page, mobile: boolean) {
  if (mobile) await page.locator('.top-bar-hamburger').click();
  else if (!(await page.locator('button:visible', { hasText: /^Sync now$/ }).count())) await page.locator('.top-bar-user-icon').click();
  await page.locator('button:visible', { hasText: /^Sync now$/ }).first().click();
  await page.waitForTimeout(2500);
}

async function openSidebar(page: Page, mobile: boolean) {
  if (!mobile) return;
  const toggle = page.locator('.sidebar-toggle:visible').first();
  if ((await toggle.count()) && (await toggle.innerText()).includes('❯')) await toggle.click();
  await page.waitForTimeout(300);
}

async function closeSidebar(page: Page) {
  const toggle = page.locator('.sidebar-toggle:visible').first();
  if ((await toggle.count()) && (await toggle.innerText()).includes('❮')) await toggle.click();
  await page.waitForTimeout(300);
}

async function addLesson(page: Page, mobile: boolean, shots: string, markdown: string) {
  await go(page, 'Lessons', mobile);
  await openSidebar(page, mobile);
  await page.getByRole('button', { name: /Add lesson/ }).first().click();
  await page.waitForSelector('.ce-dialog');
  await shot(page, shots, '1-add-lesson-guide');
  await page.locator('textarea[aria-label="Lesson markdown"]').fill(markdown);
  await shot(page, shots, '2-add-lesson-pasted');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await shot(page, shots, '3-add-lesson-preview');
  await page.getByRole('tab', { name: 'Markdown' }).click();
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(500);
}

const STAR_YAML = `quiz_title: "1日目のテスト"
questions:
  - question_number: 1
    question: "折り紙を図（ ）折りましょう。"
    options: ["っぽく", "みたい", "らしく", "のように"]
    correct_answer: "のように"
    explanation: "正解: 図のように"
  - question_number: 2
    question: |
      ここで ____ ____ ★ ____ されています。

      1: 多くの国に
      2: 車は
      3: 輸出
      4: 作られた
    options: ["1", "2", "3", "4"]
    correct_answer: "1"
    explanation: "★に入るのは1"
`;

async function runDevice(label: 'desktop' | 'phone') {
  const mobile = label === 'phone';
  const chromiumPath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({ executablePath: chromiumPath });
  const context = mobile
    ? await browser.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] })
    : await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  await seedSession(context);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  await installFakeSupabase(page);
  await page.goto(BASE_URL);
  await page.waitForSelector('.top-bar-workspace-trigger');
  return { page, context, browser, mobile };
}

async function pcFlow() {
  const wsName = 'ws-japanese';
  const key = deriveWorkspaceStorageKey(wsName);
  const { page, context, browser } = await runDevice('desktop');
  const chromium = null; void chromium;
  await seedOpfs(page, wsName, { 'lessons/l1.md': LESSON_MD, 'tests/t1.yaml': QUIZ_YAML, 'roadmaps/map-1.yaml': ROADMAP });
  await selectOnPc(page, wsName);
  check('PC: folder workspace uploaded on first sync', db.lessons.length === 1 && db.tests.length === 1, `${db.lessons.length}/${db.tests.length}`);

  // --- add a lesson, with the Japanese guide shown for copying
  await go(page, 'Lessons', false);
  await page.getByRole('button', { name: /Add lesson/ }).first().click();
  await page.waitForSelector('.ce-dialog');
  const guideText = await page.locator('.ce-guide-preview').innerText();
  check('Japanese workspace shows the Japanese guide', guideText.includes('Japanese Content Generator Prompt Guide') && !guideText.includes('Spanish Learning Content Generator'));
  await page.getByRole('button', { name: /Copy guide/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('Copy button puts the whole guide on the clipboard', copied === guideText || copied.includes('JLPT Star Questions'), String(copied.length));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ce-dialog', { state: 'detached' });

  await addLesson(page, false, 'desktop', '# Week 1 Greetings\n\nこんにちは\n\n<audio controls src="https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ja&q=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF"></audio>\n');
  check('new lesson is in the cloud', db.lessons.some((row) => row.id === 'week-1-greetings' && String(row.content).includes('こんにちは')), db.lessons.map((r) => r.id).join(','));
  check('new lesson is in the folder', (await readOpfs(page, wsName, 'lessons/week-1-greetings.md'))?.includes('こんにちは') === true);
  check('lesson id came from its title', db.lessons.some((row) => row.id === 'week-1-greetings'));
  await shot(page, 'desktop', '4-lesson-added');

  // --- add a test by pasting YAML (JLPT star format)
  await go(page, 'Tests', false);
  await page.getByRole('button', { name: /Add test/ }).first().click();
  await page.waitForSelector('.ce-dialog');
  await page.locator('textarea[aria-label="Test YAML"]').fill('quiz_title: [');
  await shot(page, 'desktop', '5-add-test-yaml-error');
  check('bad YAML blocks saving with a readable error', (await page.locator('.ce-footer .modal-btn-save').isDisabled()) && (await page.locator('.ce-error').first().innerText()).includes('YAML'));
  await page.locator('textarea[aria-label="Test YAML"]').fill(STAR_YAML);
  await page.locator('input[aria-label="Test id"]').fill('jp-w1-d1-test');
  await shot(page, 'desktop', '6-add-test-yaml');
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(400);
  const cloudTest = db.tests.find((row) => row.id === 'jp-w1-d1-test');
  const q2 = (cloudTest?.questions as Array<Record<string, unknown>> | undefined)?.[1];
  check('YAML test saved to the cloud with the JLPT star question intact', Boolean(q2) && String(q2!.question).includes('\n1: 多くの国に') && JSON.stringify(q2!.options) === '["1","2","3","4"]' && q2!.correct_answer === '1');
  const folderYaml = await readOpfs(page, wsName, 'tests/jp-w1-d1-test.yaml');
  check('YAML test written to the folder as a multi-line block', Boolean(folderYaml?.match(/question: \|-?\n\s+ここで/)));

  // --- edit it in UI mode: the star question opens as sentence + four choices
  await page.getByRole('button', { name: /Edit test/ }).click();
  await page.waitForSelector('.ce-dialog');
  check('editing opens UI mode', (await page.getByRole('tab', { name: 'UI mode' }).getAttribute('aria-selected')) === 'true');
  check('star question is recognised in UI mode', (await page.locator('select[aria-label="Question 2 type"]').inputValue()) === 'star');
  await shot(page, 'desktop', '7-edit-test-ui-mode');
  await page.locator('input[aria-label="Option 3 text"]').nth(1).fill('輸出される');
  await page.locator('input[type=radio][aria-label="Option 2 is correct"]').nth(1).check();
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(400);
  const edited = (db.tests.find((row) => row.id === 'jp-w1-d1-test')?.questions as Array<Record<string, unknown>>)[1];
  check('UI edit of a star question keeps the guide format', String(edited.question).includes('3: 輸出される') && edited.correct_answer === '2' && JSON.stringify(edited.options) === '["1","2","3","4"]');

  // --- add a test in UI mode only (multi-line question, four answers, no YAML)
  await page.getByRole('button', { name: /Add test/ }).first().click();
  await page.waitForSelector('.ce-dialog');
  await page.getByRole('tab', { name: 'UI mode' }).click();
  await page.locator('input[aria-label="Test title"]').fill('UI only quiz');
  await page.locator('textarea[aria-label="Question 1 text"]').fill('Line one\nLine two');
  for (const [index, text] of ['alpha', 'beta', 'gamma', 'delta'].entries()) await page.locator(`input[aria-label="Option ${index + 1} text"]`).first().fill(text);
  await page.locator('input[type=radio][aria-label="Option 3 is correct"]').first().check();
  await shot(page, 'desktop', '8-add-test-ui-mode');
  await page.getByRole('tab', { name: 'YAML mode' }).click();
  check('switching UI to YAML shows the same test as YAML', (await page.locator('textarea[aria-label="Test YAML"]').inputValue()).includes('correct_answer: gamma'));
  await shot(page, 'desktop', '9-ui-to-yaml');
  await page.getByRole('tab', { name: 'UI mode' }).click();
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(400);
  const uiTest = db.tests.find((row) => row.title === 'UI only quiz');
  const uq = (uiTest?.questions as Array<Record<string, unknown>> | undefined)?.[0];
  check('UI-mode test saved with multi-line question and chosen answer', uq?.question === 'Line one\nLine two' && uq?.correct_answer === 'gamma' && JSON.stringify(uq?.options) === '["alpha","beta","gamma","delta"]');
  check('the test id came from its title', uiTest?.id === 'ui-only-quiz', String(uiTest?.id));

  // --- delete the starter lesson l1: cloud + folder + tombstone + roadmap link
  await go(page, 'Lessons', false);
  await page.locator('.lessons-item', { hasText: 'Konnichiwa Lesson' }).click();
  await page.getByRole('button', { name: /Delete/ }).first().click();
  await page.waitForSelector('.ce-confirm');
  await shot(page, 'desktop', '10-delete-confirm');
  check('delete dialog warns about the roadmap link', (await page.locator('.ce-confirm').innerText()).includes('linked from 1 roadmap'));
  await page.locator('.ce-confirm .ce-danger').click();
  await page.waitForSelector('.ce-confirm', { state: 'detached' });
  await page.waitForTimeout(600);
  check('delete removes the lesson from the cloud', !db.lessons.some((row) => row.id === 'l1'));
  check('delete leaves a tombstone', db.content_tombstones.some((row) => row.id === 'l1' && row.kind === 'lessons'));
  check('delete removes the lesson file from the folder', (await readOpfs(page, wsName, 'lessons/l1.md')) === null);
  const cloudRoadmap = String(db.roadmaps.find((row) => row.id === 'map-1')?.yaml ?? '');
  check('roadmap link is removed in the cloud and the comment survives', !cloudRoadmap.includes('l1') && cloudRoadmap.includes('# my map') && cloudRoadmap.includes('t1'));
  check('roadmap file in the folder is updated too', !(await readOpfs(page, wsName, 'roadmaps/map-1.yaml'))?.includes('- l1'));

  // --- Sync now must not resurrect the deleted lesson
  await syncNow(page, false);
  check('Sync now does not bring the deleted lesson back', !db.lessons.some((row) => row.id === 'l1') && (await readOpfs(page, wsName, 'lessons/l1.md')) === null);
  return { page, context, browser, key, wsName };
}

async function phoneFlow(wsName: string, pc: Page) {
  const { page, browser } = await runDevice('phone');
  await page.evaluate(() => { delete (window as any).showDirectoryPicker; });
  await page.reload();
  await page.waitForSelector('.top-bar-workspace-trigger');
  await page.waitForTimeout(1200);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item', { hasText: wsName }).first().click();
  await page.waitForTimeout(1500);
  await go(page, 'Lessons', true);
  await openSidebar(page, true);
  check('phone sees the lesson added on the PC', (await page.locator('body').innerText()).includes('Week 1 Greetings'));
  await shot(page, 'phone', '0-lessons');

  // add a lesson from the phone, Spanish guide not shown here (Japanese workspace)
  await addLesson(page, true, 'phone', '# Phone Lesson\n\nWritten on the phone.\n');
  check('phone-added lesson is in the cloud', db.lessons.some((row) => row.id === 'phone-lesson'));
  await shot(page, 'phone', '4-lesson-added');

  // add a test via the UI on the phone
  await go(page, 'Tests', true);
  await openSidebar(page, true);
  await page.getByRole('button', { name: /Add test/ }).first().click();
  await page.waitForSelector('.ce-dialog');
  await shot(page, 'phone', '5-add-test-guide');
  await page.getByRole('tab', { name: 'UI mode' }).click();
  await page.locator('input[aria-label="Test title"]').fill('Phone quiz');
  await page.locator('textarea[aria-label="Question 1 text"]').fill('Which one?\nChoose carefully');
  for (const [index, text] of ['one', 'two', 'three', 'four'].entries()) await page.locator(`input[aria-label="Option ${index + 1} text"]`).first().fill(text);
  await page.locator('input[type=radio][aria-label="Option 2 is correct"]').first().check();
  await shot(page, 'phone', '6-add-test-ui-mode');
  await page.getByRole('button', { name: /Add JLPT star question/ }).click();
  await page.locator('select[aria-label="Question 2 type"]').scrollIntoViewIfNeeded();
  await shot(page, 'phone', '7-add-star-question');
  await page.locator('textarea[aria-label="Question 2 text"]').fill('ここで ____ ____ ★ ____ ます。');
  for (const [index, text] of ['a', 'b', 'c', 'd'].entries()) await page.locator(`input[aria-label="Option ${index + 1} text"]`).nth(1).fill(text);
  await page.locator('input[type=radio][aria-label="Option 1 is correct"]').nth(1).check();
  await page.getByRole('tab', { name: 'YAML mode' }).click();
  await shot(page, 'phone', '8-yaml-mode');
  const yaml = await page.locator('textarea[aria-label="Test YAML"]').inputValue();
  check('phone YAML shows the star question in the guide format', /question: \|-?\n\s+ここで[^\n]*\n\n\s+1: a/.test(yaml) && yaml.includes('- "1"'));
  await page.getByRole('tab', { name: 'UI mode' }).click();
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(500);
  const phoneTest = db.tests.find((row) => row.title === 'Phone quiz');
  check('phone saved a two-question test to the cloud', (phoneTest?.questions as unknown[] | undefined)?.length === 2);

  // edit a lesson on the phone, then the PC must pull it instead of overwriting it
  await go(page, 'Lessons', true);
  await openSidebar(page, true);
  await page.locator('.lessons-item', { hasText: 'Week 1 Greetings' }).click();
  await page.waitForTimeout(300);
  await closeSidebar(page);
  await page.getByRole('button', { name: /Edit lesson/ }).click();
  await page.waitForSelector('.ce-dialog');
  const area = page.locator('textarea[aria-label="Lesson markdown"]');
  await area.fill((await area.inputValue()) + '\nEdited on the phone.\n');
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-dialog', { state: 'detached' });
  await page.waitForTimeout(500);
  check('phone edit reached the cloud', String(db.lessons.find((row) => row.id === 'week-1-greetings')?.content).includes('Edited on the phone.'));
  await shot(page, 'phone', '9-lesson-edited');

  await syncNow(pc, false);
  check('PC Sync now pulls the phone edit into the folder instead of overwriting it', (await readOpfs(pc, wsName, 'lessons/week-1-greetings.md'))?.includes('Edited on the phone.') === true);
  check('PC folder got the phone-made lesson and test', (await readOpfs(pc, wsName, 'lessons/phone-lesson.md')) !== null && (await readOpfs(pc, wsName, 'tests/phone-quiz.yaml')) !== null);
  if (process.env.DEBUG_DB) console.log(JSON.stringify(db.lessons.map((r) => [r.id, r.content, r.updated_at])), '\nFOLDER', JSON.stringify(await readOpfs(pc, wsName, 'lessons/week-1-greetings.md')));
  check('the cloud copy still has the phone edit after the PC sync', String(db.lessons.find((row) => row.id === 'week-1-greetings')?.content).includes('Edited on the phone.'));

  // delete from the phone: the PC folder drops its copy on the next sync
  await go(page, 'Lessons', true);
  await openSidebar(page, true);
  await page.locator('.lessons-item', { hasText: 'Phone Lesson' }).click();
  await closeSidebar(page);
  await page.getByRole('button', { name: /Delete/ }).first().click();
  await page.waitForSelector('.ce-confirm');
  await shot(page, 'phone', '10-delete-confirm');
  await page.locator('.ce-confirm .ce-danger').click();
  await page.waitForSelector('.ce-confirm', { state: 'detached' });
  await page.waitForTimeout(500);
  check('phone delete removed the cloud row and wrote a tombstone', !db.lessons.some((row) => row.id === 'phone-lesson') && db.content_tombstones.some((row) => row.id === 'phone-lesson'));
  await syncNow(pc, false);
  check('PC folder drops the lesson that was deleted on the phone', (await readOpfs(pc, wsName, 'lessons/phone-lesson.md')) === null);
  check('and it was not uploaded again', !db.lessons.some((row) => row.id === 'phone-lesson'));

  // both sides edit the same lesson: nothing is overwritten and the user decides
  await writeOpfs(pc, wsName, 'lessons/week-1-greetings.md', '# Week 1 Greetings\n\nPC folder edit.\n');
  const row = db.lessons.find((r) => r.id === 'week-1-greetings')!;
  row.content = '# Week 1 Greetings\n\nCloud edit from phone.\n';
  row.updated_at = stamp();
  await syncNow(pc, false);
  check('both-sides edit is not overwritten in the folder', (await readOpfs(pc, wsName, 'lessons/week-1-greetings.md'))?.includes('PC folder edit.') === true);
  check('both-sides edit is not overwritten in the cloud', String(db.lessons.find((r) => r.id === 'week-1-greetings')?.content).includes('Cloud edit from phone.'));
  await pc.waitForSelector('.ce-confirm');
  await shot(pc, 'desktop', '11-conflict-dialog');
  await pc.getByRole('button', { name: 'Use account version' }).first().click();
  await pc.waitForTimeout(1200);
  check('choosing the account version writes it into the folder', (await readOpfs(pc, wsName, 'lessons/week-1-greetings.md'))?.includes('Cloud edit from phone.') === true);

  // saving something another device changed is refused, not merged blindly
  await go(page, 'Lessons', true);
  await openSidebar(page, true);
  await page.locator('.lessons-item', { hasText: 'Week 1 Greetings' }).click();
  await closeSidebar(page);
  await page.getByRole('button', { name: /Edit lesson/ }).click();
  await page.waitForSelector('.ce-dialog');
  const stale = db.lessons.find((r) => r.id === 'week-1-greetings')!;
  stale.content = `${stale.content}\nChanged elsewhere meanwhile.\n`;
  stale.updated_at = stamp();
  const staleArea = page.locator('textarea[aria-label="Lesson markdown"]');
  await staleArea.fill(`${await staleArea.inputValue()}\nMy late edit.\n`);
  await page.locator('.ce-footer .modal-btn-save').click();
  await page.waitForSelector('.ce-error[role=alert]');
  await shot(page, 'phone', '11-stale-save-refused');
  check('a stale save is refused with a clear message', (await page.locator('.ce-error[role=alert]').innerText()).includes('changed on another device'));
  check('and the other device\'s change is intact', String(db.lessons.find((r) => r.id === 'week-1-greetings')?.content).includes('Changed elsewhere meanwhile.') && !String(db.lessons.find((r) => r.id === 'week-1-greetings')?.content).includes('My late edit'));
  await page.keyboard.press('Escape');

  await browser.close();
}

async function spanishAndBadge() {
  // Spanish workspace: its own guide, and a due-count badge on cloud-only workspaces in the menu
  const wsName = 'ws-spanish';
  const key = deriveWorkspaceStorageKey(wsName);
  db.workspaces.push({ user_id: USER.id, key, name: wsName });
  db.lessons.push({ user_id: USER.id, workspace_key: key, id: 'es1', title: 'Hola', content: '# Hola\n', updated_at: stamp() });
  db.tests.push({ user_id: USER.id, workspace_key: key, id: 'es-t1', title: 'Spanish quiz', questions: [{ question_number: 1, question: '¿Hola?', options: ['a', 'b', 'c', 'd'], correct_answer: 'a' }], updated_at: stamp() });
  const { page, browser } = await runDevice('phone');
  await page.evaluate(() => { delete (window as any).showDirectoryPicker; });
  await page.reload();
  await page.waitForSelector('.top-bar-workspace-trigger');
  await page.waitForTimeout(1200);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item', { hasText: wsName }).first().click();
  await page.waitForTimeout(1500);
  await go(page, 'Tests', true);
  await openSidebar(page, true);
  await page.locator('.tests-item', { hasText: 'Spanish quiz' }).click();
  await page.waitForTimeout(300);
  await closeSidebar(page);
  await page.locator('.option-box').first().click();
  await page.waitForTimeout(600);
  // Make whatever was answered due now.
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(dbName);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('completed_questions', 'readwrite');
        const store = tx.objectStore('completed_questions');
        store.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) { cursor.update({ ...cursor.value, next_revision_time: '2020-01-01T00:00:00.000Z' }); cursor.continue(); }
        };
        tx.oncomplete = () => resolve();
      };
    });
  }, `skill-map-revision-db-${key}`);
  // Open the Spanish editor: Spanish guide
  await page.getByRole('button', { name: /Add test/ }).first().click().catch(async () => { await openSidebar(page, true); await page.getByRole('button', { name: /Add test/ }).first().click(); });
  await page.waitForSelector('.ce-dialog');
  const guideText = await page.locator('.ce-guide-preview').innerText();
  check('Spanish workspace shows the Spanish guide', guideText.includes('Spanish Learning Content Generator') && !guideText.includes('JLPT'));
  await shot(page, 'phone', '12-spanish-guide');
  await page.keyboard.press('Escape');

  // switch to the Japanese workspace, then look at the menu: the Spanish (cloud-only) row has a badge
  await page.locator('.top-bar-workspace-trigger').click();
  await page.locator('.top-bar-workspace-menu-item', { hasText: 'ws-japanese' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('.top-bar-workspace-trigger').click();
  await page.waitForTimeout(800);
  const spanishRow = page.locator('.top-bar-workspace-menu-item-row', { hasText: wsName });
  const badge = await spanishRow.locator('.top-bar-workspace-badge').innerText();
  check('cloud-only workspace shows its due-count bubble in the Change Workspace menu', badge === '1', badge);
  await shot(page, 'phone', '13-workspace-bubble');
  await browser.close();
}

async function run() {
  const pc = await pcFlow();
  await phoneFlow(pc.wsName, pc.page);
  await spanishAndBadge();
  await pc.browser.close();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
