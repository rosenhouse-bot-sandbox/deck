import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { BUTTON, hold, installGamepads, press } from './gamepad.js';

const HUB = 'http://localhost:4173/';
const URL = `${HUB}zoomies/`;
const LEVEL_IDS = ['circuit', 'dunes', 'lagoon', 'peaks', 'stars'];
let server;
let browser;

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort', '--base', '/zoomies/'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await fetch(URL).then((r) => r.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await installGamepads(page);
  await page.goto(URL);
  await page.waitForSelector('body[data-screen=join]');
  return { page, errors };
}

const screenIs = (page, name) => page.waitForSelector(`body[data-screen=${name}]`);
const text = (page, selector) => page.locator(selector).first().textContent();

async function join(page, players) {
  for (let i = 0; i < players; i++) {
    await hold(page, i, []);
    await press(page, i, BUTTON.a);
  }
  await press(page, 0, BUTTON.start);
  await screenIs(page, 'select');
}

// A coarse grid of [r, g, b] samples from the page, or from a `clip` of it.
async function pixels(page, clip) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const context = new OffscreenCanvas(64, 40).getContext('2d');
    context.drawImage(image, 0, 0, 64, 40);
    const { data: rgba } = context.getImageData(0, 0, 64, 40);
    return Array.from({ length: rgba.length / 4 }, (_, i) => [...rgba.slice(i * 4, i * 4 + 3)]);
  }, [...png]);
}

const share = (samples, matches) => samples.filter(matches).length / samples.length;
const differsFrom = ([r, g, b]) => (pixel) => Math.abs(pixel[0] - r) + Math.abs(pixel[1] - g) + Math.abs(pixel[2] - b) > 24;
const isAsphalt = (pixel) => pixel.every((channel) => channel < 110);

test('players join, leave and toggle steering help with their own pads', async () => {
  const { page, errors } = await open();
  await hold(page, 0, []);
  await hold(page, 2, []);
  await press(page, 2, BUTTON.a);
  assert.equal(await page.locator('.slot.joined').count(), 1);
  await press(page, 0, BUTTON.a);
  assert.equal(await page.locator('.slot.joined').count(), 2);
  await press(page, 0, BUTTON.x);
  assert.match(await text(page, '.slot:nth-child(2) .help'), /ON/);
  assert.match(await text(page, '.slot:nth-child(1) .help'), /OFF/);
  await press(page, 2, BUTTON.b);
  assert.equal(await page.locator('.slot.joined').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Y on the join screen goes back to the hub', async () => {
  const { page } = await open();
  await hold(page, 0, []);
  await page.route(HUB, (route) => route.fulfill({ body: 'hub' }));
  await hold(page, 0, [BUTTON.y]);
  await page.waitForURL(HUB);
  await page.close();
});

for (const [index, id] of LEVEL_IDS.entries()) {
  test(`two players race split-screen on ${id}`, async () => {
    const { page, errors } = await open();
    await join(page, 2);
    for (let i = 0; i < index; i++) await press(page, 1, BUTTON.right);
    assert.equal(await page.locator('.title').getAttribute('data-level'), id);
    await press(page, 0, BUTTON.a);
    await screenIs(page, 'race');
    assert.equal(await page.locator('.hud').count(), 2);

    await hold(page, 0, [BUTTON.rt]);
    await page.waitForFunction(() => parseInt(document.querySelector('.hud[data-player=P1] .speed').textContent) > 40, null, { timeout: 30000 });
    assert.equal(await text(page, '.hud[data-player=P2] .speed'), '0 km/h');
    assert.equal(await text(page, '.hud[data-player=P1] .lap'), 'Lap 1/3');
    const samples = await pixels(page);
    assert.ok(share(samples, differsFrom(samples[0])) > 0.2, 'the scene is drawn');
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('a one-lap race with steering help ends on the results, then returns to the menu', async () => {
  const { page, errors } = await open();
  await hold(page, 0, []);
  await press(page, 0, BUTTON.a);
  await press(page, 0, BUTTON.x);
  await press(page, 0, BUTTON.start);
  await screenIs(page, 'select');
  await press(page, 0, BUTTON.down);
  await press(page, 0, BUTTON.down);
  assert.match(await text(page, '.laps'), /1 lap /);
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'race');

  await press(page, 0, BUTTON.start);
  await screenIs(page, 'pause');
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'race');

  await hold(page, 0, [BUTTON.rt]);
  await page.waitForSelector('body[data-screen=results]', { timeout: 120000 });
  assert.equal(await page.locator('.place').count(), 6);
  assert.match(await text(page, '.place.human .time'), /^\d+\.\d s$/);
  await hold(page, 0, []);
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'select');
  assert.deepEqual(errors, []);
  await page.close();
});

test('three players get an overview in the fourth quarter', async () => {
  const { page, errors } = await open();
  await join(page, 3);
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'race');
  assert.equal(await page.locator('.hud').count(), 3);
  const overview = await pixels(page, { x: 800, y: 420, width: 460, height: 360 });
  assert.ok(share(overview, isAsphalt) > 0.01, 'the overview shows the track');
  assert.deepEqual(errors, []);
  await page.close();
});
