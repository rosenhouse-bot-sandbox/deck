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
const TITLES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
const A = 0;
const RIGHT = 15;
const DOWN = 13;

// A site like the deployed one: the hub at the root and one folder per game.
function buildSite() {
  const root = mkdtempSync(join(tmpdir(), 'hub-site-'));
  cpSync(HUB, root, { recursive: true });
  for (const title of TITLES) {
    const dir = join(root, title.toLowerCase());
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
  await page.addInitScript((initial) => {
    const pad = { index: 0, connected: true, axes: [0, 0], buttons: [] };
    const set = (buttons, axes = [0, 0]) => {
      pad.axes = axes;
      pad.buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: +buttons.includes(i) }));
    };
    set(initial);
    navigator.getGamepads = () => [pad, null, null, null];
    window.fakePad = set;
  }, held);
  await page.goto(origin);
  await page.waitForSelector('#games a');
  return { page, errors };
}

const hold = (page, buttons, axes) => page.evaluate(([b, a]) => window.fakePad(b, a), [buttons, axes]);
// Headless Chromium can draw as few as 25 frames a second, so a press lasts several frames.
async function press(page, button) {
  await hold(page, [button]);
  await page.waitForTimeout(150);
  await hold(page, []);
  await page.waitForTimeout(150);
}
const selected = (page) => page.evaluate(() => document.activeElement.textContent);

test('lists every game by title, with the first selected', async () => {
  const { page, errors } = await open();
  assert.deepEqual(await page.locator('#games .title').allTextContents(), TITLES);
  assert.equal(await selected(page), 'AAlpha');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.equal(scrollWidth, 1280);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the d-pad moves across and down the grid', async () => {
  const { page } = await open();
  await press(page, RIGHT);
  assert.equal(await selected(page), 'BBravo');
  await press(page, DOWN);
  assert.equal(await selected(page), 'EEcho');
  await page.close();
});

test('holding the stick keeps moving', async () => {
  const { page } = await open();
  await hold(page, [], [1, 0]);
  await page.waitForTimeout(700);
  await hold(page, []);
  assert.equal(await selected(page), 'CCharlie');
  await page.close();
});

test('A opens the selected game, and the hub remembers it on return', async () => {
  const { page, errors } = await open();
  await press(page, RIGHT);
  await press(page, A);
  await page.waitForURL(`${origin}bravo/`);
  await page.click('a');
  await page.waitForSelector('#games a');
  assert.equal(await selected(page), 'BBravo');
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
  await page.waitForURL(`${origin}alpha/`);
  await page.close();
});

test('arrow keys and Enter work too', async () => {
  const { page } = await open();
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected(page), 'DDelta');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${origin}delta/`);
  await page.close();
});
