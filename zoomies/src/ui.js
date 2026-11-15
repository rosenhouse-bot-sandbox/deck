import { lapOf } from './race.js';
import { angleDiff } from './track.js';

const ordinal = (place) => `${place}${['st', 'nd', 'rd'][place - 1] ?? 'th'}`;

const ITEM_LABELS = { turbo: 'TURBO', shield: 'SHIELD', goo: 'GOO', ball: 'BALL' };
const css = (color) => `#${color.toString(16).padStart(6, '0')}`;
const percent = (fraction) => `${fraction * 100}%`;

function element(parent, className, text = '') {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function screen(root, name) {
  root.replaceChildren();
  document.body.dataset.screen = name;
  return element(root, `screen ${name}`);
}

export function showJoin(root, slots) {
  const page = screen(root, 'join');
  element(page, 'title', 'ZOOMIES');
  const row = element(page, 'slots');
  slots.forEach((slot, i) => {
    const card = element(row, `slot ${slot.joined ? 'joined' : ''}`);
    card.style.setProperty('--player', css(slot.color));
    element(card, 'name', `P${i + 1}`);
    element(card, 'hint', slot.joined ? 'Ready!' : 'Press A to join');
    if (slot.joined) element(card, 'help', `Steering help: ${slot.assist ? 'ON' : 'OFF'} (X)`);
  });
  element(page, 'footer', slots.some((s) => s.joined) ? '☰ Start: pick a race   B: leave   Y: back to hub' : 'Y: back to hub');
}

export function showSelect(root, levels, index, laps) {
  const page = screen(root, 'select');
  const level = levels[index];
  element(page, 'arrows', '◀ ▶');
  element(page, 'title', level.name).dataset.level = level.id;
  element(page, 'blurb', level.blurb);
  element(page, 'dots', levels.map((_, i) => (i === index ? '●' : '○')).join(' '));
  element(page, 'laps', `▲ ${laps} ${laps === 1 ? 'lap' : 'laps'} ▼`);
  element(page, 'controls', 'RT or A: go   LT or B: brake   X: power-up   Y: back on track   ☰: pause');
  element(page, 'footer', 'A: race!   B: back');
}

export function showPause(root) {
  const page = screen(root, 'pause');
  element(page, 'title', 'Paused');
  element(page, 'footer', 'A: keep racing   B: quit race');
}

export function showResults(root, race) {
  const page = screen(root, 'results');
  element(page, 'title', 'Results');
  const list = element(page, 'places');
  for (const racer of [...race.racers].sort((a, b) => a.place - b.place)) {
    const row = element(list, `place ${racer.human ? 'human' : ''}`);
    row.style.setProperty('--player', css(racer.color));
    element(row, 'rank', ordinal(racer.place));
    element(row, 'name', racer.name);
    element(row, 'time', racer.finished ? `${racer.finishTime.toFixed(1)} s` : '');
  }
  element(page, 'footer', 'A: next race');
}

// Lays one panel per human racer over that racer's part of the screen.
export function createHud(root, race, rects) {
  root.replaceChildren();
  document.body.dataset.screen = 'race';
  const banner = element(root, 'banner');
  const panels = race.racers
    .filter((racer) => racer.human)
    .map((racer, i) => {
      const rect = rects[i];
      const panel = element(root, 'hud');
      panel.dataset.player = racer.name;
      Object.assign(panel.style, { left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) });
      panel.style.setProperty('--player', css(racer.color));
      return {
        racer,
        place: element(panel, 'place-badge'),
        lap: element(panel, 'lap'),
        speed: element(panel, 'speed'),
        item: element(panel, 'item'),
        notice: element(panel, 'notice'),
      };
    });

  const noticeFor = (racer, pads) => {
    const { tan } = race.track;
    const along = Math.atan2(tan[racer.index].x, tan[racer.index].z);
    if (racer.finished) return `Finished ${ordinal(racer.place)}!`;
    if (!pads.has(racer.pad)) return 'Controller lost';
    if (racer.speed > 5 && Math.abs(angleDiff(racer.slide, along)) > 2) return 'Turn around! (Y)';
    return '';
  };

  return {
    update(pads) {
      banner.textContent = race.phase === 'countdown' ? Math.ceil(race.countdown) : race.time < 1 ? 'GO!' : '';
      for (const { racer, place, lap, speed, item, notice } of panels) {
        place.textContent = ordinal(racer.place);
        lap.textContent = `Lap ${lapOf(race, racer)}/${race.laps}`;
        speed.textContent = `${Math.round(Math.abs(racer.speed) * 3.6)} km/h`;
        item.textContent = racer.item ? `${ITEM_LABELS[racer.item]} (X)` : '';
        item.dataset.item = racer.item ?? '';
        notice.textContent = noticeFor(racer, pads);
      }
    },
  };
}
