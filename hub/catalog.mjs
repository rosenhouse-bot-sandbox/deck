// Writes `games.json` for the hub from every `<folder>/game.json` in a built site.
// Usage: node hub/catalog.mjs <site>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

// Resolves `path` from the game's folder to the site root, and checks the file is there.
function local(root, dir, path, field) {
  const fail = (why) => new Error(`${dir}/game.json: ${field} ${why}`);
  if (typeof path !== 'string') throw fail('must be a string');
  let resolved = posix.join(dir, path);
  if (resolved === dir) resolved = `${dir}/`;
  if (/^[a-z]+:|^\//i.test(path) || !resolved.startsWith(`${dir}/`)) throw fail(`must stay inside ${dir}/`);
  const file = resolved.endsWith('/') ? `${resolved}index.html` : resolved;
  if (!existsSync(join(root, file))) throw fail(`names ${file}, which the build did not produce`);
  return resolved;
}

function entry(root, dir) {
  const game = JSON.parse(readFileSync(join(root, dir, 'game.json'), 'utf8'));
  if (typeof game.title !== 'string' || !game.title.trim()) throw new Error(`${dir}/game.json: title is required`);
  const url = game.url ?? './';
  return {
    title: game.title,
    url: url.startsWith?.('https://') ? url : local(root, dir, url, 'url'),
    cover: game.cover ? local(root, dir, game.cover, 'cover') : null,
  };
}

export function catalog(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'game.json')))
    .map((d) => entry(root, d.name))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  const games = catalog(argv[2]);
  if (!games.length) throw new Error(`no game.json under ${argv[2]}`);
  writeFileSync(join(argv[2], 'games.json'), `${JSON.stringify(games, null, 2)}\n`);
  console.log(games.map((g) => `${g.title} -> ${g.url}`).join('\n'));
}
