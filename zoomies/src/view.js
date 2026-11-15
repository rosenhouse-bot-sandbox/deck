import * as THREE from 'three';
import { angleDiff } from './track.js';
import { createVehicle } from './vehicles.js';
import { addPads, buildWorld } from './world.js';

const CHASE_DISTANCE = 12;
const CHASE_HEIGHT = 5.5;
const BASE_FOV = 68;

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
  const width = window.innerWidth;
  const height = window.innerHeight;
  const x = rect.x * width;
  const y = (1 - rect.y - rect.h) * height;
  renderer.setViewport(x, y, rect.w * width, rect.h * height);
  renderer.setScissor(x, y, rect.w * width, rect.h * height);
  const aspect = (rect.w * width) / (rect.h * height);
  if (camera.aspect !== aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}

// Narrower on wide split-screen strips, so the sides do not stretch.
const fovFor = (aspect) => Math.max(42, Math.min(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(1.25 / aspect))));

// A slow flight around the level, behind the menus.
export function createBackdrop(level, track) {
  const world = buildWorld(level, track);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 2500);
  return {
    render(renderer, time) {
      world.update(time);
      const angle = time * 0.08;
      camera.position.set(Math.cos(angle) * 330, level.floating ? 150 : 110, Math.sin(angle) * 330);
      camera.lookAt(0, 0, 0);
      draw(renderer, world.scene, camera, { x: 0, y: 0, w: 1, h: 1 });
    },
  };
}

// Mirrors a list of sim objects with a pool of meshes.
function pool(scene, make) {
  const meshes = [];
  return (items, place) => {
    while (meshes.length < items.length) {
      meshes.push(make());
      scene.add(meshes.at(-1));
    }
    meshes.forEach((mesh, i) => {
      mesh.visible = i < items.length;
      if (mesh.visible) place(mesh, items[i]);
    });
  };
}

export function createRaceView(level, track, race) {
  const world = buildWorld(level, track);
  const { scene } = world;
  addPads(world, track, race.pads);

  const vehicles = race.racers.map((racer) => {
    const vehicle = createVehicle(level.vehicle, racer.color);
    vehicle.group.rotation.order = 'YXZ';
    scene.add(vehicle.group);
    return vehicle;
  });

  const boxGeometry = new THREE.OctahedronGeometry(1.5);
  const boxes = race.boxes.map((box) => {
    const mesh = new THREE.Mesh(boxGeometry, new THREE.MeshLambertMaterial({ flatShading: true, emissiveIntensity: 0.5 }));
    mesh.position.set(box.x, world.groundY(box.x, box.z, box.s) + 2.2, box.z);
    scene.add(mesh);
    return mesh;
  });

  const gooPool = pool(scene, () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 6), new THREE.MeshLambertMaterial({ color: 0x7be03a, flatShading: true }));
    mesh.scale.y = 0.2;
    return mesh;
  });
  const ballPool = pool(scene, () => new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshLambertMaterial({ color: 0xff4fa3 })));

  const cameras = race.racers
    .filter((racer) => racer.human)
    .map((racer) => ({ racer, camera: new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 2500), heading: racer.heading, boost: 0 }));
  const overview = new THREE.PerspectiveCamera(60, 1, 10, 2500);
  overview.position.set(0, 440, 0);
  overview.up.set(0, 0, 1);
  overview.lookAt(0, 0, 0);
  overview.layers.enable(1);

  const heightAt = (racer) => world.groundY(racer.x, racer.z, racer.s);

  function placeVehicle(vehicle, racer, time) {
    const { group, body } = vehicle;
    const y = heightAt(racer);
    const ahead = 2.5;
    const dx = Math.sin(racer.heading) * ahead;
    const dz = Math.cos(racer.heading) * ahead;
    const rise =
      world.groundY(racer.x + dx, racer.z + dz, racer.s + ahead / track.spacing) -
      world.groundY(racer.x - dx, racer.z - dz, racer.s - ahead / track.spacing);
    const lean = Math.max(-0.5, Math.min(0.5, angleDiff(racer.heading, racer.slide) * 1.2));
    const bob = world.water || level.floating ? 0.15 * Math.sin(time * 3 + racer.id) : 0;
    group.position.set(racer.x, y + bob + 0.3, racer.z);
    group.rotation.set(-Math.atan2(rise, ahead * 2), racer.heading, 0);
    body.rotation.z = -lean;
    body.rotation.y = racer.spin > 0 ? racer.spin * 12 : 0;
    vehicle.flame.visible = racer.boost > 0;
    vehicle.flame.scale.setScalar(0.8 + 0.3 * Math.sin(time * 40));
    vehicle.shield.visible = racer.shield > 0;
    vehicle.shadow.visible = !world.water;
  }

  function placeCamera(view, dt) {
    const { racer, camera } = view;
    view.heading += angleDiff(racer.heading, view.heading) * Math.min(1, 5 * dt);
    view.boost += ((racer.boost > 0 ? 1 : 0) - view.boost) * Math.min(1, 4 * dt);
    const y = heightAt(racer);
    const back = CHASE_DISTANCE + view.boost * 2;
    const x = racer.x - Math.sin(view.heading) * back;
    const z = racer.z - Math.cos(view.heading) * back;
    const floor = level.floating ? y : world.groundY(x, z);
    camera.position.set(x, Math.max(y + CHASE_HEIGHT, floor + 2.5), z);
    camera.lookAt(racer.x + Math.sin(view.heading) * 6, y + 2, racer.z + Math.cos(view.heading) * 6);
    camera.userData.boost = view.boost;
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
      gooPool(race.goo, (mesh, goo) => mesh.position.set(goo.x, world.groundY(goo.x, goo.z, 0) + 0.5, goo.z));
      ballPool(race.balls, (mesh, ball) =>
        mesh.position.set(ball.x, world.groundY(ball.x, ball.z, ball.s) + 1.6 + Math.abs(Math.sin(time * 9)) * 1.2, ball.z),
      );
      for (const view of cameras) placeCamera(view, dt);
    },
    // `rects[i]` is the screen area of human i, or of the overview.
    render(renderer, rects) {
      rects.forEach((rect, i) => {
        if (rect.overview) {
          // Fog would hide the ground from this high up.
          const { fog } = scene;
          scene.fog = null;
          draw(renderer, scene, overview, rect);
          scene.fog = fog;
          return;
        }
        const { camera } = cameras[i];
        const aspect = (rect.w * window.innerWidth) / (rect.h * window.innerHeight);
        const fov = fovFor(aspect) + camera.userData.boost * 8;
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        draw(renderer, scene, camera, rect);
      });
    },
  };
}
