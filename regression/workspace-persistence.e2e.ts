// End-to-end check that local workspaces are selected, loaded, and restored after a reload
// and a full browser restart. Uses OPFS directories as real FileSystemDirectoryHandles, so
// the app's IndexedDB handle persistence is exercised without a native folder picker.
//
// Usage: start the dev server, then `npx tsx regression/workspace-persistence.e2e.ts [baseUrl]`
import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/';

const WORKSPACES = {
  'ws-alpha': { lesson: 'Alpha Lesson Unique', test: 'Alpha Quiz Unique' },
  'ws-beta': { lesson: 'Beta Lesson Unique', test: 'Beta Quiz Unique' },
};

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
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
      const lessons = await ws.getDirectoryHandle('lessons', { create: true });
      await write(lessons, 'lesson-1.md', `# ${info.lesson}\n\nBody text.\n`);
      const tests = await ws.getDirectoryHandle('tests', { create: true });
      await write(tests, 'quiz-1.yaml', `quiz_title: ${info.test}\nquestions:\n  - question_number: 1\n    question: "Q?"\n    options: ["A", "B"]\n    correct_answer: "A"\n`);
      const roadmaps = await ws.getDirectoryHandle('roadmaps', { create: true });
      await write(roadmaps, 'map-1.yaml', `- id: root\n  label: ${name} roadmap\n  dependsOn: []\n`);
    }
  }, WORKSPACES);
}

// Make the "Browse from local" button return the named OPFS directory.
async function stubPicker(page: Page, workspaceName: string) {
  await page.evaluate((name) => {
    (window as any).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name);
    };
  }, workspaceName);
}

async function label(page: Page) {
  // textContent, not innerText: the label is CSS-uppercased.
  return ((await page.locator('.top-bar-workspace-label').textContent()) ?? '').trim();
}

async function openPage(page: Page, nav: string) {
  await page.locator('button.top-bar-link', { hasText: nav }).click();
  await page.waitForTimeout(400);
}

async function pageText(page: Page) {
  return page.locator('body').innerText();
}

async function waitIdle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('.top-bar-workspace-trigger')?.textContent?.includes('Loading'));
  await page.waitForTimeout(500);
}

async function expectWorkspaceContent(page: Page, name: keyof typeof WORKSPACES, phase: string) {
  const info = WORKSPACES[name];
  check(`[${phase}] label shows ${name}`, (await label(page)) === name, await label(page));
  await openPage(page, 'Lessons');
  check(`[${phase}] Lessons shows "${info.lesson}"`, (await pageText(page)).includes(info.lesson));
  await openPage(page, 'Tests');
  check(`[${phase}] Tests shows "${info.test}"`, (await pageText(page)).includes(info.test));
}

async function newContext(userDataDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  // tsx/esbuild wraps named functions in __name(), which does not exist inside page.evaluate.
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  await page.goto(BASE_URL);
  await page.waitForSelector('.top-bar-workspace-trigger');
  await waitIdle(page);
  return { context, page };
}

async function run() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'skillmap-e2e-'));
  try {
    let { context, page } = await newContext(userDataDir);
    await seedOpfs(page);

    // 1. Select ws-alpha via the real menu flow.
    await stubPicker(page, 'ws-alpha');
    await page.locator('.top-bar-workspace-trigger').click();
    await page.locator('.top-bar-workspace-menu-item--action').click();
    await waitIdle(page);
    await expectWorkspaceContent(page, 'ws-alpha', 'after select');

    // 2. Select ws-beta too, so history has two entries.
    await stubPicker(page, 'ws-beta');
    await page.locator('.top-bar-workspace-trigger').click();
    await page.locator('.top-bar-workspace-menu-item--action').click();
    await waitIdle(page);
    await expectWorkspaceContent(page, 'ws-beta', 'after second select');

    const history = await page.evaluate(() => localStorage.getItem('skill-map.workspace-history'));
    check('history persisted in localStorage with 2 entries', (JSON.parse(history || '[]') as unknown[]).length === 2, history || 'null');

    // 3. Reload: the last selection must be restored.
    await page.reload();
    await page.waitForSelector('.top-bar-workspace-trigger');
    await waitIdle(page);
    await expectWorkspaceContent(page, 'ws-beta', 'after reload');

    // 4. Full browser restart.
    await context.close();
    ({ context, page } = await newContext(userDataDir));
    await expectWorkspaceContent(page, 'ws-beta', 'after browser restart');

    // 5. Switch back to ws-alpha from the Recent workspaces list.
    await page.locator('.top-bar-workspace-trigger').click();
    const recent = page.locator('.top-bar-workspace-menu-item', { hasText: 'ws-alpha' });
    check('[after restart] Recent list contains ws-alpha', (await recent.count()) > 0);
    if ((await recent.count()) > 0) {
      await recent.first().click();
      await waitIdle(page);
      await expectWorkspaceContent(page, 'ws-alpha', 'after switch from history');
    }

    // 6. Roadmap page renders the workspace roadmap.
    await openPage(page, 'Roadmap');
    await page.waitForTimeout(800);
    check('[roadmap] canvas shows ws-alpha roadmap node', (await pageText(page)).includes('ws-alpha roadmap'));

    await context.close();
  } finally {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // The browser may still hold a lock on the profile directory; leave it for the OS to clean.
    }
  }

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
