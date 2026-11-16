import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { catalog } from '../catalog.mjs';

function site(games) {
  const root = mkdtempSync(join(tmpdir(), 'site-'));
  for (const [dir, manifest] of Object.entries(games)) {
    mkdirSync(join(root, dir));
    if (manifest !== undefined) writeFileSync(join(root, dir, 'game.json'), JSON.stringify(manifest));
  }
  return root;
}

test('lists each folder with a game.json, by title, with addresses from the site root', () => {
  const root = site({
    zoomies: { title: 'Zoomies', url: './', cover: 'cover.png' },
    blocks: { title: 'Blocks', url: 'play/index.html' },
    assets: undefined,
  });
  assert.deepEqual(catalog(root), [
    { title: 'Blocks', url: 'blocks/play/index.html', cover: null },
    { title: 'Zoomies', url: 'zoomies/', cover: 'zoomies/cover.png' },
  ]);
});

test('the address defaults to the folder', () => {
  assert.equal(catalog(site({ maze: { title: 'Maze' } }))[0].url, 'maze/');
});

test('a game.json without a title fails the build', () => {
  assert.throws(() => catalog(site({ broken: { url: './' } })), /broken\/game.json: title/);
});

test('a game hosted elsewhere keeps its https address', () => {
  const url = 'https://science-viz.rosen.house/';
  assert.equal(catalog(site({ viz: { title: 'Viz', url } }))[0].url, url);
});

test('a relative path may not leave its folder', () => {
  assert.throws(() => catalog(site({ sneaky: { title: 'Sneaky', url: '../' } })), /sneaky\/game.json: url/);
  assert.throws(() => catalog(site({ far: { title: 'Far', cover: 'https://example.com/a.png' } })), /far\/game.json: cover/);
});
