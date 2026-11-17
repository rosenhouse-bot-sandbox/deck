import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { BUTTON, hold, installGamepads, press } from './gamepad.js';

const HUB = 'http://localhost:4173/';
const GAME = `${HUB}zoomies/`;
const LEVEL_IDS = ['circuit', 'dunes', 'lagoon', 'peaks', 'stars'];
let server;
let browser;

before(async () => {
  const vite = ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort', '--base', '/zoomies/'];
  server = spawn(process.execPath, vite, { stdio: 'ignore' });
  const up = () => fetch(GAME).then((response) => response.ok, () => false);
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(await up(), 'the preview server is up');
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
  await page.goto(GAME);
  await page.waitForSelector('body[data-screen=join]');
  return { page, errors };
}

const screenIs = (page, name) => page.waitForSelector(`body[data-screen=${name}]`);

// The level select ignores presses at first, so that a held throttle cannot start a race.
async function selectIsReady(page) {
  await screenIs(page, 'select');
  await page.waitForTimeout(3000);
}
const text = (page, selector) => page.locator(selector).first().textContent();

async function join(page, players) {
  for (let i = 0; i < players; i++) {
    await hold(page, i, []);
    await press(page, i, BUTTON.a);
  }
  await press(page, 0, BUTTON.start);
  await selectIsReady(page);
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

// Like the hub, this page opts in to view transitions.
const FAKE_HUB = `<!doctype html><title>Hub</title>
  <style>@view-transition { navigation: auto; }</style>
  <a href="zoomies/">Zoomies</a>`;
const recordTransition = () =>
  addEventListener('pagereveal', async (e) => {
    window.transitioned = (await e.viewTransition?.ready.then(() => true, () => false)) ?? false;
  });

test('arriving from the hub is a view transition', async () => {
  const page = await browser.newPage();
  await installGamepads(page);
  await page.addInitScript(recordTransition);
  await page.route(HUB, (route) => route.fulfill({ body: FAKE_HUB, contentType: 'text/html' }));
  await page.goto(HUB);
  await page.click('a');
  await page.waitForURL(GAME);
  await page.waitForFunction(() => window.transitioned !== undefined);
  assert.equal(await page.evaluate(() => window.transitioned), true);
  await page.close();
});

test('Y on the join screen goes back to the hub', async () => {
  const { page } = await open();
  await hold(page, 0, []);
  await page.addInitScript(recordTransition);
  await page.route(HUB, (route) => route.fulfill({ body: FAKE_HUB, contentType: 'text/html' }));
  await hold(page, 0, [BUTTON.y]);
  await page.waitForURL(HUB);
  await page.waitForFunction(() => window.transitioned !== undefined);
  assert.equal(await page.evaluate(() => window.transitioned), true);
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
  assert.deepEqual(await page.locator('.hud .banner').allTextContents(), ['3', '3']);

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
  await selectIsReady(page);
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
  assert.deepEqual(await page.locator('.rank').allTextContents(), ['1st', '2nd', '3rd', '4th', '5th', '6th']);

  // The throttle is still held, and must not skip the results.
  await page.waitForTimeout(500);
  await screenIs(page, 'results');
  await hold(page, 0, []);
  for (let i = 0; i < 60 && (await page.locator('body[data-screen=results]').count()); i++) await press(page, 0, BUTTON.a);
  await screenIs(page, 'select');
  assert.deepEqual(errors, []);
  await page.close();
});

test('only the player who paused can quit the race', async () => {
  const { page, errors } = await open();
  await join(page, 2);
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'race');
  await hold(page, 3, []);
  await press(page, 3, BUTTON.start);
  await page.waitForTimeout(300);
  await screenIs(page, 'race');
  await press(page, 1, BUTTON.start);
  await screenIs(page, 'pause');
  assert.equal(await text(page, '.title'), 'P2 paused');
  await press(page, 0, BUTTON.b);
  await page.waitForTimeout(300);
  await screenIs(page, 'pause');
  await press(page, 1, BUTTON.b);
  await screenIs(page, 'select');
  assert.deepEqual(errors, []);
  await page.close();
});

test('a race goes on with the bot driving when a controller drops out', async () => {
  const { page, errors } = await open();
  await join(page, 1);
  await press(page, 0, BUTTON.a);
  await screenIs(page, 'race');
  await page.evaluate(() => navigator.getGamepads().fill(null));
  await page.waitForFunction(() => document.querySelector('.notice').textContent === 'Controller lost');
  await page.waitForFunction(() => parseInt(document.querySelector('.speed').textContent) > 40, null, { timeout: 30000 });
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
