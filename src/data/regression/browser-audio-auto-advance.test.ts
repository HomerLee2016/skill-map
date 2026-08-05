import { chromium } from 'playwright';
import path from 'node:path';

async function run() {
  //const browser = await chromium.launch();
  const browser = await chromium.launch({ 
    headless: false,  // Shows the actual browser window
    devtools: true,   // Automatically opens Chrome DevTools
    slowMo: 500       // Slows down actions by 500ms so you can watch what happens
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/');

  async function clickTopBarButton(label: string) {
    await page.waitForSelector('button.top-bar-link');
    const buttons = await page.$$('button.top-bar-link');
    for (const btn of buttons) {
      const text = (await btn.innerText()).trim();
      if (text === label) {
        await btn.click();
        await page.waitForTimeout(500);
        return true;
      }
    }
    return false;
  }

  async function clickTreeItem(label: string) {
    const clicked = await page.evaluate((targetLabel) => {
      const buttons = Array.from(document.querySelectorAll('button.tree-item-button.tests-item'));
      for (const btn of buttons) {
        const titleEl = btn.querySelector('.tree-item-title');
        if (titleEl?.textContent?.trim() === targetLabel) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, label);
    if (!clicked) {
      throw new Error(`Could not find tree item with label ${label}`);
    }
    await page.waitForTimeout(500);
    return true;
  }

  async function answerCurrentQuestion(answer: string) {
    await page.waitForSelector('.option-box');
    const options = await page.$$('.option-box');
    for (const opt of options) {
      const text = (await opt.innerText()).trim();
      if (text === answer) {
        await opt.click();
        await page.waitForTimeout(250);
        return true;
      }
    }
    return false;
  }

  async function getQuestionNumber() {
    return page.evaluate(() => {
      const prompt = document.querySelector('.test-question__legend .test-question__prompt, .test-question__prompt');
      return prompt?.textContent?.trim() || null;
    });
  }

  async function getQuestionPrompt() {
    return page.evaluate(() => {
      const prompt = document.querySelector('.test-question__legend, .test-question__prompt, .test-question__legend .test-question__prompt');
      return prompt?.textContent?.trim() || null;
    });
  }

  async function getAudioSrc() {
    return page.evaluate(() => {
      const audio = document.querySelector('audio');
      return audio?.getAttribute('src') || null;
    });
  }

  async function waitForNextQuestion(timeout = 8000) {
    const start = Date.now();
    const initialPrompt = await getQuestionPrompt();
    while (Date.now() - start < timeout) {
      await page.waitForTimeout(200);
      const currentPrompt = await getQuestionPrompt();
      if (currentPrompt && currentPrompt !== initialPrompt) {
        return currentPrompt;
      }
    }
    return null;
  }

  const results: Array<{ questionLabel: string; audioSrc: string | null; nextPrompt: string | null; }> = [];

  await clickTopBarButton('Tests');
  await page.waitForSelector('button.tree-item-button.tests-item', { state: 'attached', timeout: 30000 });
  await clickTreeItem('Spanish Numbers 1-10');
  await page.waitForSelector('button.question-tracker__box', { state: 'visible', timeout: 30000 });

  const sequence = [
    { question: 1, answer: 'Uno' },
    { question: 6, answer: 'Six' },
  ];

  // Ensure we are on the Tests page and the correct test selection.
  await clickTopBarButton('Tests');
  await page.waitForSelector('.test-question__legend, .test-question__prompt');

  for (const step of sequence) {
    const trackerButton = await page.$(`button.question-tracker__box[aria-label="Question ${step.question}"]`);
    if (!trackerButton) {
      throw new Error(`Could not find tracker button for question ${step.question}`);
    }
    await trackerButton.click();
    await page.waitForTimeout(500);

    const prompt = await getQuestionPrompt();
    const audioSrc = await getAudioSrc();
    const answered = await answerCurrentQuestion(step.answer);
    if (!answered) {
      throw new Error(`Could not answer question ${step.question} with ${step.answer}`);
    }

    const nextPrompt = await waitForNextQuestion(10000);
    results.push({ questionLabel: `Question ${step.question}`, audioSrc, nextPrompt });
  }

  await browser.close();
  return results;
}

if (import.meta.main) {
  run()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
