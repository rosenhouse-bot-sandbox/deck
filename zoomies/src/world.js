import * as THREE from 'three';
import { padsFor } from './race.js';
import { pointAt } from './track.js';

const THEMES = {
  circuit: { sky: 0x8fd3ff, ground: 0x5cb85c, road: 0x4a505c, kerbs: [0xe63946, 0xffffff], fence: [0x2b6cb0, 0xffffff], fog: 650 },
  dunes: { sky: 0xffdfae, ground: 0xe2b96b, road: 0xb07a45, kerbs: [0x8a5a2b, 0x9c6a38], fence: [0x7a4f2a, 0xf2dca0], fog: 600 },
  lagoon: { sky: 0x9be7ff, ground: 0x1e90c8, road: 0x7fe3ee, kerbs: null, fence: [0xffd23d, 0xff7a1a], fog: 650 },
  peaks: { sky: 0xd6ecff, ground: 0xf4f8ff, road: 0xa9d3ee, kerbs: [0x6fa8d6, 0xe8f4ff], fence: [0xe63946, 0xffffff], fog: 550 },
  stars: { sky: 0x070720, ground: null, road: 0x2a1a5e, kerbs: [0x00ffe1, 0xff3df2], fence: [0x00ffe1, 0xff3df2], fog: null },
};

const WATER_LEVEL = 0;
const ROAD_LIFT = 0.3;
const KERB = 1.2;
const FENCE_HEIGHT = 1.1;

function seededRandom(text) {
  let seed = [...text].reduce((hash, character) => hash * 31 + character.charCodeAt(0), 7) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a strip of quads along the track between samples `from` and `to`,
// with one quad per sample for each pair of neighbouring `offsets`.
// `colorAt(row, column)` returns a hex colour, or null to leave a gap.
function ribbon(track, { from = 0, to = track.n, offsets, yAt, colorAt }) {
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const corner = (row, offset) => {
    const p = pointAt(track, row, offset);
    return [p.x, yAt(p), p.z];
  };
  for (let row = from; row < to; row++) {
    for (let column = 0; column < offsets.length - 1; column++) {
      const hex = colorAt(row, column);
      if (hex === null) continue;
      color.setHex(hex);
      const a = corner(row, offsets[column]);
      const b = corner(row, offsets[column + 1]);
      const c = corner(row + 1, offsets[column + 1]);
      const d = corner(row + 1, offsets[column]);
      positions.push(...a, ...d, ...c, ...a, ...c, ...b);
      for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Builds a low fence along the track at `offset`, in two alternating colours.
function fence(track, offset, yAt, colors) {
  const positions = [];
  const tints = [];
  const color = new THREE.Color();
  for (let row = 0; row < track.n; row++) {
    const a = pointAt(track, row, offset);
    const b = pointAt(track, row + 1, offset);
    const [ya, yb] = [yAt(a), yAt(b)];
    positions.push(a.x, ya, a.z, b.x, yb, b.z, b.x, yb + FENCE_HEIGHT, b.z);
    positions.push(a.x, ya, a.z, b.x, yb + FENCE_HEIGHT, b.z, a.x, ya + FENCE_HEIGHT, a.z);
    color.setHex(colors[Math.floor(row / 3) % 2]);
    for (let i = 0; i < 6; i++) tints.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// Adds instanced copies of a prop made of several parts.
// `spots` are { x, y, z, scale, turn }.
function scatter(scene, parts, spots) {
  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, new THREE.MeshLambertMaterial({ color: part.color, flatShading: true }), spots.length);
    local.compose(new THREE.Vector3(...part.at), new THREE.Quaternion(), new THREE.Vector3(...(part.stretch ?? [1, 1, 1])));
    spots.forEach((spot, i) => {
      turn.setFromAxisAngle(up, spot.turn ?? 0);
      base.compose(new THREE.Vector3(spot.x, spot.y, spot.z), turn, new THREE.Vector3().setScalar(spot.scale ?? 1));
      mesh.setMatrixAt(i, base.multiply(local));
    });
    scene.add(mesh);
  }
}

const cylinder = (top, bottom, height) => new THREE.CylinderGeometry(top, bottom, height, 7);
const blob = (radius) => new THREE.IcosahedronGeometry(radius, 0);
const ball = (radius) => new THREE.SphereGeometry(radius, 10, 8);

const PROPS = {
  tree: [
    { geometry: cylinder(0.5, 0.7, 4), color: 0x7a4f2a, at: [0, 2, 0] },
    { geometry: blob(3.2), color: 0x2f8f3a, at: [0, 6, 0] },
    { geometry: blob(2.2), color: 0x3fa64a, at: [0.8, 8.4, 0.4] },
  ],
  cactus: [
    { geometry: cylinder(0.8, 0.9, 6), color: 0x3c9d4e, at: [0, 3, 0] },
    { geometry: cylinder(0.45, 0.45, 2.6), color: 0x3c9d4e, at: [1.5, 4, 0] },
    { geometry: cylinder(0.45, 0.45, 2), color: 0x3c9d4e, at: [-1.5, 3, 0] },
    { geometry: new THREE.BoxGeometry(1.4, 0.7, 0.7), color: 0x3c9d4e, at: [1, 2.9, 0] },
    { geometry: new THREE.BoxGeometry(1.4, 0.7, 0.7), color: 0x3c9d4e, at: [-1, 2.2, 0] },
  ],
  rock: [{ geometry: blob(2), color: 0x9a8f86, at: [0, 0.6, 0], stretch: [1.3, 0.8, 1] }],
  island: [
    { geometry: ball(9), color: 0xf2dca0, at: [0, -1, 0], stretch: [1, 0.3, 1] },
    { geometry: cylinder(0.4, 0.6, 7), color: 0x8a633a, at: [0, 4.5, 0] },
    { geometry: new THREE.ConeGeometry(4.5, 1.6, 6), color: 0x2fa653, at: [0, 8.4, 0] },
    { geometry: new THREE.ConeGeometry(3, 1.4, 6), color: 0x49c06a, at: [0, 9.3, 0] },
  ],
  pine: [
    { geometry: cylinder(0.5, 0.6, 2.5), color: 0x6b4526, at: [0, 1.2, 0] },
    { geometry: new THREE.ConeGeometry(3.4, 5, 7), color: 0x1f6b45, at: [0, 4.6, 0] },
    { geometry: new THREE.ConeGeometry(2.5, 4, 7), color: 0x2a8055, at: [0, 7.4, 0] },
    { geometry: new THREE.ConeGeometry(1.5, 3, 7), color: 0xffffff, at: [0, 9.8, 0] },
  ],
  snowman: [
    { geometry: ball(1.6), color: 0xffffff, at: [0, 1.4, 0] },
    { geometry: ball(1.1), color: 0xffffff, at: [0, 3.5, 0] },
    { geometry: ball(0.75), color: 0xffffff, at: [0, 5, 0] },
    { geometry: new THREE.ConeGeometry(0.2, 1, 6), color: 0xff8c1a, at: [0, 5, 0.9] },
    { geometry: cylinder(0.6, 0.6, 0.9), color: 0x333333, at: [0, 6, 0] },
  ],
  asteroid: [{ geometry: blob(5), color: 0x8b7fa8, at: [0, 0, 0], stretch: [1.2, 0.9, 1] }],
  buoyRed: [{ geometry: ball(0.9), color: 0xff4d4d, at: [0, 0.3, 0] }],
  buoyWhite: [{ geometry: ball(0.9), color: 0xffffff, at: [0, 0.3, 0] }],
};

const SCENERY = {
  circuit: { tree: 220, rock: 20 },
  dunes: { cactus: 130, rock: 90 },
  lagoon: { island: 26 },
  peaks: { pine: 240, snowman: 30 },
  stars: { asteroid: 90 },
};

function addGround(scene, level, theme, random) {
  const geometry = new THREE.PlaneGeometry(1300, 1300, 150, 150).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const base = new THREE.Color(theme.ground);
  for (let i = 0; i < position.count; i++) {
    position.setY(i, level.terrain(position.getX(i), position.getZ(i)));
    const shade = 0.9 + random() * 0.2;
    colors.push(base.r * shade, base.g * shade, base.b * shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(ground);
  return ground;
}

function addSpace(scene, random) {
  const stars = [];
  for (let i = 0; i < 2500; i++) {
    const v = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).setLength(900);
    stars.push(v.x, v.y, v.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false })));

  for (const [color, radius, x, y, z] of [
    [0xff9f5a, 70, -420, 120, -380],
    [0x6fd3ff, 45, 480, -60, 260],
    [0xc58bff, 30, 80, 200, 520],
  ]) {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshLambertMaterial({ color, flatShading: true }));
    planet.position.set(x, y, z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.4, radius * 1.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = 1.2 + random();
    planet.add(ring);
    scene.add(planet);
  }
}

function addGantry(scene, track, level, yAt) {
  const reach = level.halfWidth + 1.5;
  const height = 9;
  const left = pointAt(track, 0, reach);
  const right = pointAt(track, 0, -reach);
  const y = Math.max(yAt(left), yAt(right));
  const post = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  for (const side of [left, right]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, height, 0.8), post);
    mesh.position.set(side.x, y + height / 2, side.z);
    scene.add(mesh);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 2; j++) {
      context.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      context.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(reach * 2, 1.6, 0.6), new THREE.MeshBasicMaterial({ map: texture }));
  banner.position.set((left.x + right.x) / 2, y + height, (left.z + right.z) / 2);
  banner.rotation.y = left.heading;
  scene.add(banner);
}

// Builds the scenery for a level. `groundY(x, z, s)` is the height a racer rides at.
export function buildWorld(level, track) {
  const theme = THEMES[level.id];
  const random = seededRandom(level.id);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  if (theme.fog) scene.fog = new THREE.Fog(theme.sky, theme.fog * 0.45, theme.fog);
  scene.add(new THREE.HemisphereLight(0xffffff, level.floating ? 0x554488 : theme.ground, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);

  const water = level.id === 'lagoon';
  const groundY = level.floating ? (_x, _z, s) => pointAt(track, s).y : (x, z) => level.terrain(x, z);
  const lifted = (lift) => (p) => (level.floating ? p.y : level.terrain(p.x, p.z)) + lift;
  const animated = [];

  let ground = null;
  if (level.floating) addSpace(scene, random);
  else ground = addGround(scene, level, theme, random);
  if (water) {
    const position = ground.geometry.attributes.position;
    animated.push((time) => {
      for (let i = 0; i < position.count; i++) {
        position.setY(i, WATER_LEVEL + 0.18 * Math.sin(position.getX(i) * 0.4 + time * 1.7) * Math.cos(position.getZ(i) * 0.33 + time * 1.3));
      }
      position.needsUpdate = true;
    });
  }

  const hw = level.halfWidth;
  const edge = level.floating ? hw + level.shoulder : hw;
  const surface = new THREE.Mesh(
    ribbon(track, {
      offsets: [-edge + KERB, -edge / 2, 0, edge / 2, edge - KERB],
      yAt: lifted(ROAD_LIFT),
      colorAt: (row) => (level.floating && row % 12 < 2 ? 0x4b2f9e : theme.road),
    }),
    water
      ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false })
      : new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(surface);

  if (theme.kerbs) {
    const stripes = (row) => theme.kerbs[Math.floor(row / 4) % 2];
    const material = level.floating ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const side of [-1, 1]) {
      scene.add(
        new THREE.Mesh(
          ribbon(track, { offsets: [side * edge, side * (edge - KERB)].sort((a, b) => a - b), yAt: lifted(ROAD_LIFT), colorAt: stripes }),
          material,
        ),
      );
    }
  }
  // The fence marks the wall that keeps racers near the road.
  for (const side of [-1, 1]) scene.add(fence(track, side * (hw + level.shoulder + 1), lifted(0), theme.fence));
  if (level.id === 'circuit') {
    scene.add(
      new THREE.Mesh(
        ribbon(track, { offsets: [-0.25, 0.25], yAt: lifted(ROAD_LIFT + 0.03), colorAt: (row) => (row % 6 < 3 ? 0xffffff : null) }),
        new THREE.MeshBasicMaterial({ vertexColors: true }),
      ),
    );
  }
  if (water) {
    const buoys = { buoyRed: [], buoyWhite: [] };
    for (let s = 0; s < track.n; s += 6) {
      for (const side of [-1, 1]) {
        const p = pointAt(track, s, side * hw);
        buoys[(s / 6) % 2 ? 'buoyRed' : 'buoyWhite'].push({ x: p.x, y: WATER_LEVEL, z: p.z });
      }
    }
    for (const [name, spots] of Object.entries(buoys)) scatter(scene, PROPS[name], spots);
  }

  const columns = 12;
  scene.add(
    new THREE.Mesh(
      ribbon(track, {
        to: 2,
        offsets: Array.from({ length: columns + 1 }, (_, i) => -hw + (i * 2 * hw) / columns),
        yAt: lifted(ROAD_LIFT + 0.05),
        colorAt: (row, column) => ((row + column) % 2 ? 0x111111 : 0xffffff),
      }),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    ),
  );
  addGantry(scene, track, level, lifted(0));

  const padMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const pad of padsFor(track, level)) {
    scene.add(
      new THREE.Mesh(
        ribbon(track, {
          from: Math.round(pad.s) - 3,
          to: Math.round(pad.s) + 3,
          offsets: [pad.offset - 3, pad.offset, pad.offset + 3],
          yAt: lifted(ROAD_LIFT + 0.08),
          colorAt: (row) => (row % 2 ? 0xffe14d : 0xff7a1a),
        }),
        padMaterial,
      ),
    );
  }

  const clearance = hw + level.shoulder + 7;
  const clear = (x, z, margin) => track.pos.every((p, i) => i % 3 || (p.x - x) ** 2 + (p.z - z) ** 2 > (clearance + margin) ** 2);
  for (const [name, count] of Object.entries(SCENERY[level.id])) {
    const margin = name === 'island' ? 8 : 0;
    const spots = [];
    for (let tries = 0; spots.length < count && tries < count * 20; tries++) {
      const x = (random() - 0.5) * 900;
      const z = (random() - 0.5) * 900;
      if (!clear(x, z, margin)) continue;
      const y = level.floating ? (random() - 0.5) * 120 : water ? WATER_LEVEL : level.terrain(x, z);
      spots.push({ x, y, z, scale: 0.7 + random() * 0.8, turn: random() * Math.PI * 2 });
    }
    scatter(scene, PROPS[name], spots);
  }

  return {
    scene,
    groundY,
    water,
    update: (time) => animated.forEach((animate) => animate(time)),
  };
}
