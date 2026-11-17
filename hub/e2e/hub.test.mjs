import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { catalog } from '../catalog.mjs';

const HUB = fileURLToPath(new URL('../site', import.meta.url));
// In title order, three to a row at 1280×800. Five rows are more than fit on screen.
const TITLES = ['🏎️ Racer', 'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike'];
const folder = (title) => title.toLowerCase().replace(/[^a-z]/g, '');
const A = 0;
const START = 9;
const RIGHT = 15;
const DOWN = 13;

// A site like the deployed one: the hub at the root and one folder per game.
function buildSite() {
  const root = mkdtempSync(join(tmpdir(), 'hub-site-'));
  cpSync(HUB, root, { recursive: true });
  for (const title of TITLES) {
    const dir = join(root, folder(title));
    mkdirSync(dir);
    writeFileSync(join(dir, 'game.json'), JSON.stringify({ title }));
    writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${title}</title><a href="../">Hub</a>`);
  }
  writeFileSync(join(root, 'games.json'), JSON.stringify(catalog(root)));
  return root;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let server;
let browser;
let origin;

before(async () => {
  const root = buildSite();
  server = createServer((req, res) => {
    let path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = readFileSync(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open({ held = [] } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  // The pad's state lives in localStorage, so that a button held on one page is still held on the next.
  await page.addInitScript((initial) => {
    const KEY = 'fakePad';
    const set = (buttons, axes = [0, 0]) => localStorage.setItem(KEY, JSON.stringify({ buttons, axes }));
    if (!localStorage.getItem(KEY)) set(initial);
    navigator.getGamepads = () => {
      const { buttons, axes } = JSON.parse(localStorage.getItem(KEY));
      const button = (i) => ({ pressed: buttons.includes(i), value: +buttons.includes(i) });
      return [{ index: 0, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => button(i)) }, null, null, null];
    };
    window.fakePad = set;
  }, held);
  await page.goto(origin);
  await page.waitForSelector('#games a');
  return { page, errors };
}

const hold = (page, buttons, axes) => page.evaluate(([b, a]) => window.fakePad(b, a), [buttons, axes]);
// Headless Chromium can draw as few as 25 frames a second, so a press lasts several frames.
async function press(page, button, times = 1) {
  for (let i = 1; i < times; i++) await press(page, button);
  await hold(page, [button]);
  await page.waitForTimeout(150);
  await hold(page, []);
  await page.waitForTimeout(150);
}
const selected = (page) =>
  page.evaluate(() => {
    const focused = document.activeElement;
    return focused.matches('#games a') ? focused.querySelector('.title').textContent : focused.tagName;
  });

test('lists every game by title, with the first selected', async () => {
  const { page, errors } = await open();
  assert.deepEqual(await page.locator('#games .title').allTextContents(), TITLES);
  assert.equal(await selected(page), '🏎️ Racer');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.equal(scrollWidth, 1280);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the d-pad moves across and down the grid', async () => {
  const { page } = await open();
  await press(page, RIGHT);
  assert.equal(await selected(page), 'Alpha');
  await press(page, DOWN);
  assert.equal(await selected(page), 'Delta');
  await page.close();
});

test('holding the stick keeps moving', async () => {
  const { page } = await open();
  await hold(page, [], [1, 0]);
  await page.waitForTimeout(700);
  await hold(page, []);
  assert.equal(await selected(page), 'Bravo');
  await page.close();
});

test('A opens the selected game, and the hub remembers it on return', async () => {
  const { page, errors } = await open();
  await press(page, RIGHT);
  await press(page, A);
  await page.waitForURL(`${origin}alpha/`);
  await page.click('a');
  await page.waitForSelector('#games a');
  assert.equal(await selected(page), 'Alpha');
  assert.deepEqual(errors, []);
  await page.close();
});

test('an A held since the page opened does nothing until released', async () => {
  const { page } = await open({ held: [A] });
  await page.waitForTimeout(300);
  assert.equal(page.url(), origin);
  await hold(page, []);
  await page.waitForTimeout(150);
  await press(page, A);
  await page.waitForURL(`${origin}racer/`);
  await page.close();
});

test('arrow keys and Enter work too', async () => {
  const { page } = await open();
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected(page), 'Charlie');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${origin}charlie/`);
  await page.close();
});

test('an arrow key with no card that way is left to the browser', async () => {
  const { page } = await open();
  const prevented = (key) =>
    page.evaluate((key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    }, key);
  assert.equal(await prevented('ArrowUp'), false);
  assert.equal(await selected(page), '🏎️ Racer');
  assert.equal(await prevented('ArrowRight'), true);
  assert.equal(await selected(page), 'Alpha');
  await page.close();
});

test('Start opens a game too', async () => {
  const { page } = await open();
  await press(page, START);
  await page.waitForURL(`${origin}racer/`);
  await page.close();
});

test('the selected card and its glow stay in view while scrolling', async () => {
  const { page } = await open();
  const visible = () =>
    page.evaluate(() => {
      const outlineAndGlow = 20;
      const card = document.activeElement.getBoundingClientRect();
      const view = document.querySelector('main').getBoundingClientRect();
      return card.top - outlineAndGlow >= view.top && card.bottom + outlineAndGlow <= view.bottom;
    });
  assert.ok(await visible(), 'first row');
  await press(page, DOWN, 4);
  assert.equal(await selected(page), 'Lima');
  assert.ok(await visible(), 'last row');
  await page.close();
});

test('a game without a cover shows its first character', async () => {
  const { page } = await open();
  assert.equal(await page.locator('#games a', { hasText: 'Racer' }).locator('.cover').textContent(), '🏎');
  await page.close();
});

test('after a tap on the background, the d-pad moves from the last selected game', async () => {
  const { page } = await open();
  await press(page, RIGHT);
  await page.mouse.click(1200, 30);
  assert.equal(await selected(page), 'BODY');
  await press(page, DOWN);
  assert.equal(await selected(page), 'Delta');
  await page.close();
});

// Chrome may restore the hub from its back-forward cache, with the poll loop's old state.
test('an A held when the hub is restored from the back-forward cache does nothing', async () => {
  const { page } = await open();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.fakePad([0]);
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.waitForTimeout(300);
  assert.equal(page.url(), origin);
  await page.close();
});
