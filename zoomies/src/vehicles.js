import * as THREE from 'three';

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
// Every vehicle uses these, so a race must not dispose them.
const shared = (color) => Object.assign(lambert(color), { userData: { shared: true } });
const DARK = shared(0x22252b);
const LIGHT = shared(0xf2f2f2);
const GLASS = shared(0x8fd8ff);

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function wheels(parent, radius, width, x, y, front, back) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 10).rotateZ(Math.PI / 2);
  for (const side of [-x, x]) for (const z of [front, back]) part(parent, geometry, DARK, side, y, z);
}

function rider(parent, y, z) {
  part(parent, box(0.8, 0.9, 0.6), DARK, 0, y, z);
  part(parent, new THREE.SphereGeometry(0.48, 10, 8), LIGHT, 0, y + 0.9, z);
  part(parent, box(0.6, 0.22, 0.2), DARK, 0, y + 0.95, z + 0.4);
}

// Every builder makes a model that faces +z and sits on y = 0.
const BUILDERS = {
  car(body, paint) {
    part(body, box(1.9, 0.5, 4), paint, 0, 0.6, 0);
    part(body, box(1.5, 0.5, 1.6), GLASS, 0, 1.1, -0.3);
    part(body, box(1.3, 0.1, 1.5), paint, 0, 1.38, -0.3);
    part(body, box(2.2, 0.12, 0.6), paint, 0, 1.35, -1.9);
    part(body, box(0.15, 0.5, 0.3), DARK, 0.7, 1.1, -1.9);
    part(body, box(0.15, 0.5, 0.3), DARK, -0.7, 1.1, -1.9);
    part(body, box(2.1, 0.15, 0.5), DARK, 0, 0.4, 2.1);
    wheels(body, 0.5, 0.45, 1.05, 0.5, 1.3, -1.3);
  },
  atv(body, paint) {
    part(body, box(1.3, 0.6, 2.6), paint, 0, 1.1, 0);
    part(body, box(1.9, 0.2, 0.9), paint, 0, 1.35, 1.1);
    part(body, box(1.9, 0.2, 0.9), paint, 0, 1.35, -1.1);
    part(body, box(1.5, 0.12, 0.12), DARK, 0, 1.9, 0.7);
    part(body, box(0.12, 0.6, 0.12), DARK, 0, 1.6, 0.8);
    wheels(body, 0.75, 0.6, 1.15, 0.75, 1.1, -1.1);
    rider(body, 1.85, -0.3);
  },
  boat(body, paint) {
    part(body, box(2, 0.7, 3), paint, 0, 0.35, -0.6);
    const bow = part(body, new THREE.ConeGeometry(1.42, 2.2, 4, 1), paint, 0, 0.35, 2);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.5);
    part(body, box(2.1, 0.12, 3.1), LIGHT, 0, 0.75, -0.6);
    part(body, box(1.5, 0.6, 0.12), GLASS, 0, 1.1, 0.7).rotation.x = -0.4;
    part(body, box(0.6, 0.9, 0.6), DARK, 0, 0.6, -2.3);
    rider(body, 1.15, -0.5);
  },
  sled(body, paint) {
    part(body, box(1.2, 0.6, 2.8), paint, 0, 0.8, -0.1);
    part(body, box(1, 0.5, 1), paint, 0, 0.75, 1.5).rotation.x = 0.35;
    part(body, box(1, 0.5, 0.1), GLASS, 0, 1.4, 0.9).rotation.x = -0.5;
    for (const x of [-0.8, 0.8]) {
      part(body, box(0.3, 0.1, 2), LIGHT, x, 0.08, 1.2);
      part(body, box(0.1, 0.6, 0.1), DARK, x * 0.85, 0.4, 1.2);
    }
    part(body, box(0.9, 0.5, 2), DARK, 0, 0.28, -0.8);
    rider(body, 1.5, -0.4);
  },
  ship(body, paint) {
    const hull = part(body, new THREE.ConeGeometry(0.9, 4.2, 8), paint, 0, 1.2, 0.4);
    hull.rotation.x = Math.PI / 2;
    part(body, new THREE.SphereGeometry(0.6, 10, 8), GLASS, 0, 1.55, -0.2);
    for (const side of [-1, 1]) {
      const wing = part(body, box(1.9, 0.12, 1.5), paint, side * 1.3, 1.1, -1.1);
      wing.rotation.y = side * 0.35;
      part(body, box(0.12, 0.9, 0.9), LIGHT, side * 2.1, 1.4, -1.4);
      part(body, new THREE.CylinderGeometry(0.3, 0.38, 1.2, 8).rotateX(Math.PI / 2), DARK, side * 0.75, 1.1, -1.7);
    }
  },
};

const HOVER = { ship: 1 };
const FLAME_HEIGHT = { ship: 1.1 };

// Returns a vehicle group and the parts the view animates.
export function createVehicle(type, color, { shadow: castsShadow }) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  body.position.y = HOVER[type] ?? 0;
  group.add(body);
  BUILDERS[type](body, lambert(color));

  const flame = part(
    body,
    new THREE.ConeGeometry(0.5, 2.6, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb020 }),
    0,
    FLAME_HEIGHT[type] ?? 0.8,
    -3.2,
  );
  const shield = part(
    group,
    new THREE.SphereGeometry(3, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.3, depthWrite: false }),
    0,
    1.3,
    0,
  );
  const shadow = part(
    group,
    new THREE.CircleGeometry(2, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    0,
    0.4,
    0,
  );
  shadow.visible = castsShadow;
  // Only the overview camera sees layer 1.
  const marker = part(group, new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color }), 0, 14, 0);
  marker.layers.set(1);

  return { group, body, flame, shield };
}
