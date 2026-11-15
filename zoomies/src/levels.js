import { buildTrack } from './track.js';

// Tracks are given as radii around the origin, so a loop can never cross itself.
function loop(radii, height = () => 0) {
  return radii.map((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    return { x: Math.cos(a) * r, y: height(a), z: Math.sin(a) * r };
  });
}

const flat = () => 0;
const dunes = (x, z) => 4 * Math.sin(x / 37) * Math.cos(z / 29) + 2 * Math.sin((x + z) / 17);
const peaks = (x, z) => 7 * Math.sin(x / 55) * Math.sin(z / 47) + 2.5 * Math.cos((x - z) / 23);

// Speeds are metres per second, turn rates radians per second.
export const LEVELS = [
  {
    id: 'circuit',
    name: 'Turbo Raceway',
    vehicle: 'car',
    blurb: 'Race cars on a smooth, grippy circuit',
    points: loop([200, 215, 205, 165, 150, 185, 220, 200, 160, 150, 190, 225, 195, 165]),
    terrain: flat,
    halfWidth: 11,
    shoulder: 9,
    offroad: 0.55,
    handling: { maxSpeed: 42, accel: 24, brake: 50, coast: 10, turnRate: 2.0, grip: 12 },
  },
  {
    id: 'dunes',
    name: 'Dusty Dunes',
    vehicle: 'atv',
    blurb: 'ATVs over bumpy sand',
    points: loop([190, 215, 180, 150, 175, 220, 205, 165, 150, 185, 225, 200, 160, 170]),
    terrain: dunes,
    halfWidth: 10,
    shoulder: 9,
    offroad: 0.6,
    handling: { maxSpeed: 36, accel: 22, brake: 45, coast: 10, turnRate: 1.9, grip: 8 },
  },
  {
    id: 'lagoon',
    name: 'Splash Lagoon',
    vehicle: 'boat',
    blurb: 'Speed boats that love to drift',
    points: loop([210, 230, 205, 175, 195, 225, 190, 170, 200, 235, 215, 185]),
    terrain: flat,
    halfWidth: 13,
    shoulder: 9,
    offroad: 0.7,
    handling: { maxSpeed: 38, accel: 18, brake: 30, coast: 8, turnRate: 1.6, grip: 3.5 },
  },
  {
    id: 'peaks',
    name: 'Frosty Peaks',
    vehicle: 'sled',
    blurb: 'Snowmobiles on slippery hills',
    points: loop([180, 210, 220, 180, 155, 190, 225, 190, 155, 170, 215, 205, 165]),
    terrain: peaks,
    halfWidth: 11,
    shoulder: 9,
    offroad: 0.65,
    handling: { maxSpeed: 34, accel: 20, brake: 35, coast: 7, turnRate: 1.8, grip: 4 },
  },
  {
    id: 'stars',
    name: 'Star Loop',
    vehicle: 'ship',
    blurb: 'Spaceships on a roller coaster in the sky',
    points: loop(
      [200, 225, 190, 160, 195, 225, 180, 155, 190, 230, 205, 170],
      (a) => 18 * Math.sin(2 * a) + 8 * Math.sin(3 * a),
    ),
    floating: true,
    halfWidth: 11,
    shoulder: 3,
    offroad: 0.8,
    handling: { maxSpeed: 44, accel: 26, brake: 45, coast: 9, turnRate: 2.0, grip: 6 },
  },
];

const tracks = new Map();

export function trackFor(level) {
  if (!tracks.has(level.id)) {
    const track = buildTrack(level.points);
    if (!level.floating) for (const p of track.pos) p.y = level.terrain(p.x, p.z);
    tracks.set(level.id, track);
  }
  return tracks.get(level.id);
}
