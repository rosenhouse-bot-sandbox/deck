import * as THREE from 'three';
import { trackFor } from './levels.js';
import { angleDiff } from './track.js';
import { createVehicle } from './vehicles.js';
import { buildWorld } from './world.js';

const CHASE_DISTANCE = 12;
const CHASE_HEIGHT = 5.5;
const BASE_FOV = 68;
const FULL_SCREEN = { x: 0, y: 0, w: 1, h: 1 };

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setScissorTest(true);
  const fit = () => renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', fit);
  fit();
  return renderer;
}

function draw(renderer, scene, camera, rect) {
  const width = rect.w * window.innerWidth;
  const height = rect.h * window.innerHeight;
  const x = rect.x * window.innerWidth;
  const y = (1 - rect.y - rect.h) * window.innerHeight;
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// Wide split-screen strips get a narrower view, so the sides do not stretch.
const fovFor = (aspect) => Math.max(42, Math.min(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(1.25 / aspect))));

// Each level's scenery is built once and kept, so menus and rematches do not rebuild it.
const worlds = new Map();
function worldFor(level) {
  if (!worlds.has(level.id)) worlds.set(level.id, buildWorld(level, trackFor(level)));
  return worlds.get(level.id);
}

// Flies slowly around the level, behind the menus.
export function createBackdrop(level) {
  const world = worldFor(level);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 2500);
  return {
    render(renderer, time) {
      world.update(time);
      const angle = time * 0.08;
      camera.position.set(Math.cos(angle) * 330, level.floating ? 150 : 110, Math.sin(angle) * 330);
      camera.lookAt(0, 0, 0);
      draw(renderer, world.scene, camera, FULL_SCREEN);
    },
  };
}

// Returns a function that shows one mesh for each item of a changing list.
function pool(parent, make) {
  const meshes = [];
  return (items, place) => {
    while (meshes.length < items.length) {
      meshes.push(make());
      parent.add(meshes.at(-1));
    }
    meshes.forEach((mesh, i) => {
      mesh.visible = i < items.length;
      if (mesh.visible) place(mesh, items[i]);
    });
  };
}

export function createRaceView(race) {
  const { level, track } = race;
  const world = worldFor(level);
  // Everything that belongs to this race hangs off `actors`, so `dispose` can remove it.
  const actors = new THREE.Group();
  world.scene.add(actors);

  const vehicles = race.racers.map((racer) => {
    const vehicle = createVehicle(level.vehicle, racer.color, { shadow: !world.water });
    actors.add(vehicle.group);
    return vehicle;
  });

  const boxGeometry = new THREE.OctahedronGeometry(1.5);
  const boxes = race.boxes.map((box) => {
    const mesh = new THREE.Mesh(boxGeometry, new THREE.MeshLambertMaterial({ flatShading: true }));
    mesh.position.set(box.x, world.groundY(box.x, box.z, box.s) + 2.2, box.z);
    actors.add(mesh);
    return mesh;
  });

  const gooGeometry = new THREE.SphereGeometry(2.4, 10, 6).scale(1, 0.2, 1);
  const gooMaterial = new THREE.MeshLambertMaterial({ color: 0x7be03a, flatShading: true });
  const showGoo = pool(actors, () => new THREE.Mesh(gooGeometry, gooMaterial));
  const ballGeometry = new THREE.SphereGeometry(1.3, 12, 8);
  const ballMaterial = new THREE.MeshLambertMaterial({ color: 0xff4fa3 });
  const showBalls = pool(actors, () => new THREE.Mesh(ballGeometry, ballMaterial));

  const chases = race.racers
    .filter((racer) => racer.human)
    .map((racer) => ({ racer, camera: new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 2500), heading: racer.heading, boost: 0 }));
  const overview = new THREE.PerspectiveCamera(60, 1, 10, 2500);
  overview.position.set(0, 440, 0);
  overview.up.set(0, 0, 1);
  overview.lookAt(0, 0, 0);
  overview.layers.enable(1);

  const heightAt = (racer) => world.groundY(racer.x, racer.z, racer.s);

  function placeVehicle(vehicle, racer, time) {
    const reach = 2.5;
    const dx = Math.sin(racer.heading) * reach;
    const dz = Math.cos(racer.heading) * reach;
    const rise =
      world.groundY(racer.x + dx, racer.z + dz, racer.s + reach / track.spacing) -
      world.groundY(racer.x - dx, racer.z - dz, racer.s - reach / track.spacing);
    const lean = Math.max(-0.5, Math.min(0.5, angleDiff(racer.heading, racer.slide) * 1.2));
    const bob = world.water || level.floating ? 0.15 * Math.sin(time * 3 + racer.id) : 0;
    vehicle.group.position.set(racer.x, heightAt(racer) + bob + 0.3, racer.z);
    vehicle.group.rotation.set(-Math.atan2(rise, reach * 2), racer.heading, 0);
    vehicle.body.rotation.set(0, racer.spin * 12, -lean);
    vehicle.flame.visible = racer.boost > 0;
    vehicle.flame.scale.setScalar(0.8 + 0.3 * Math.sin(time * 40));
    vehicle.shield.visible = racer.shield > 0;
  }

  function placeCamera(chase, dt) {
    const { racer, camera } = chase;
    chase.heading += angleDiff(racer.heading, chase.heading) * Math.min(1, 5 * dt);
    chase.boost += ((racer.boost > 0 ? 1 : 0) - chase.boost) * Math.min(1, 4 * dt);
    const y = heightAt(racer);
    const back = CHASE_DISTANCE + chase.boost * 2;
    const x = racer.x - Math.sin(chase.heading) * back;
    const z = racer.z - Math.cos(chase.heading) * back;
    const floor = level.floating ? y : world.groundY(x, z);
    camera.position.set(x, Math.max(y + CHASE_HEIGHT, floor + 2.5), z);
    camera.lookAt(racer.x + Math.sin(chase.heading) * 6, y + 2, racer.z + Math.cos(chase.heading) * 6);
  }

  return {
    update(time, dt) {
      world.update(time);
      race.racers.forEach((racer, i) => placeVehicle(vehicles[i], racer, time));
      race.boxes.forEach((box, i) => {
        boxes[i].visible = box.respawn <= 0;
        boxes[i].rotation.set(time, time * 1.3, 0);
        boxes[i].material.color.setHSL((time * 0.3 + i * 0.13) % 1, 0.9, 0.6);
      });
      showGoo(race.goo, (mesh, goo) => mesh.position.set(goo.x, world.groundY(goo.x, goo.z, goo.s) + 0.5, goo.z));
      showBalls(race.balls, (mesh, ball) =>
        mesh.position.set(ball.x, world.groundY(ball.x, ball.z, ball.s) + 1.6 + Math.abs(Math.sin(time * 9)) * 1.2, ball.z),
      );
      for (const chase of chases) placeCamera(chase, dt);
    },
    // `rects[i]` is the screen area of human i, or of the overview.
    render(renderer, rects) {
      rects.forEach((rect, i) => {
        if (rect.overview) {
          // Fog would hide the ground from this high up.
          const { fog } = world.scene;
          world.scene.fog = null;
          draw(renderer, world.scene, overview, rect);
          world.scene.fog = fog;
          return;
        }
        const { camera, boost } = chases[i];
        camera.fov = fovFor((rect.w * window.innerWidth) / (rect.h * window.innerHeight)) + boost * 8;
        draw(renderer, world.scene, camera, rect);
      });
    },
    dispose() {
      world.scene.remove(actors);
      actors.traverse((object) => {
        object.geometry?.dispose();
        if (!object.material?.userData.shared) object.material?.dispose();
      });
    },
  };
}
