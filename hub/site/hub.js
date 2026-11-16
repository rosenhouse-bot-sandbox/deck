import { BUTTON, createButtons, createRepeat, direction, neighbor } from './nav.js';

const list = document.querySelector('#games');
const status = document.querySelector('#status');
const SELECTED = 'hub.selected';

const remembered = () => {
  try {
    return sessionStorage.getItem(SELECTED);
  } catch {
    return null;
  }
};
const remember = (url) => {
  try {
    sessionStorage.setItem(SELECTED, url);
  } catch {}
};

function card(game) {
  const link = document.createElement('a');
  link.href = game.url;
  let cover;
  if (game.cover) {
    cover = document.createElement('img');
    cover.src = game.cover;
    cover.alt = '';
  } else {
    cover = document.createElement('span');
    cover.textContent = game.title[0];
  }
  cover.className = 'cover';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = game.title;
  link.append(cover, title);
  link.addEventListener('focus', () => remember(link.getAttribute('href')));
  const item = document.createElement('li');
  item.append(link);
  return item;
}

const links = () => [...list.querySelectorAll('a')];

function select(link) {
  link?.focus({ focusVisible: true });
  link?.scrollIntoView({ block: 'nearest' });
}

function move(dir) {
  const all = links();
  if (!all.length) return;
  const from = Math.max(0, all.indexOf(document.activeElement));
  if (!all.includes(document.activeElement)) return select(all[from]);
  select(all[neighbor(all.map((a) => a.getBoundingClientRect()), from, dir)]);
}

function play(pad) {
  const link = links().includes(document.activeElement) ? document.activeElement : links()[0];
  if (!link) return;
  pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 80, strongMagnitude: 0.3, weakMagnitude: 0.5 })?.catch(() => {});
  location.href = link.href;
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
addEventListener('keydown', (e) => {
  if (!ARROWS[e.key]) return;
  e.preventDefault();
  move(ARROWS[e.key]);
});

// One reader per pad index, so each pad's held buttons are tracked separately.
let readers = new Map();
const repeat = createRepeat();

function poll(now) {
  const pads = [...navigator.getGamepads()].filter((p) => p?.connected);
  let dir = null;
  let launcher = null;
  for (const pad of pads) {
    if (!readers.has(pad.index)) readers.set(pad.index, createButtons());
    const pressed = readers.get(pad.index)(pad);
    dir ??= direction(pad);
    if (pressed.includes(BUTTON.a) || pressed.includes(BUTTON.start)) launcher ??= pad;
  }
  const step = repeat(dir, now);
  if (launcher) play(launcher);
  else if (step) move(step);
  requestAnimationFrame(poll);
}

// Coming back to a cached page, buttons held from the game must not count.
addEventListener('pageshow', (e) => {
  if (e.persisted) readers = new Map();
});

async function load() {
  try {
    const response = await fetch('games.json');
    if (!response.ok) throw new Error(response.statusText);
    const games = await response.json();
    list.append(...games.map(card));
    if (!games.length) status.textContent = 'No games yet.';
    select(links().find((a) => a.getAttribute('href') === remembered()) ?? links()[0]);
  } catch {
    status.textContent = 'Could not load the list of games.';
  }
  requestAnimationFrame(poll);
}

load();
