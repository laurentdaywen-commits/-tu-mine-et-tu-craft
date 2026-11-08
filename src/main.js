import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Monde voxel organisé en chunks. Les blocs d'un chunk sont regroupés par matériau
// dans des InstancedMesh : beaucoup moins d'appels de rendu qu'un Mesh par bloc.
const CHUNK_SIZE = 8;
const WORLD_MIN = -32;
const WORLD_MAX = 31;
const RENDER_DISTANCE = 4;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8f0);
scene.fog = new THREE.Fog(0x87c8f0, 38, 100);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 160);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#game').prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdaf1ff, 0x71834b, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-30, 45, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

const controls = new PointerLockControls(camera, renderer.domElement);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x65ad42 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8a5735 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x888b8c }),
  wood: new THREE.MeshLambertMaterial({ color: 0x91602f }),
  leaves: new THREE.MeshLambertMaterial({ color: 0x347d32 })
};
const blockNames = Object.keys(materials);
const blocks = new Map(); // "x,y,z" -> type
const chunks = new Map(); // "cx,cz" -> meshes du chunk
const dummy = new THREE.Object3D();
const keyOf = (x, y, z) => x + ',' + y + ',' + z;
const chunkOf = (x, z) => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
const chunkKey = (cx, cz) => cx + ',' + cz;

function heightAt(x, z) {
  return Math.floor(2 + Math.sin(x * 0.23) * 1.2 + Math.cos(z * 0.19) * 1.1 + Math.sin((x + z) * 0.13) * 0.7);
}
function setBlockData(x, y, z, type) {
  blocks.set(keyOf(x, y, z), type);
}
function getBlock(x, y, z) {
  return blocks.get(keyOf(x, y, z));
}
function rebuildChunk(cx, cz) {
  const id = chunkKey(cx, cz);
  const oldMeshes = chunks.get(id) || [];
  for (const mesh of oldMeshes) scene.remove(mesh);

  const grouped = Object.fromEntries(blockNames.map(type => [type, []]));
  const minX = cx * CHUNK_SIZE, minZ = cz * CHUNK_SIZE;
  for (let x = minX; x < minX + CHUNK_SIZE; x++) {
    for (let z = minZ; z < minZ + CHUNK_SIZE; z++) {
      for (let y = 0; y <= 24; y++) {
        const type = getBlock(x, y, z);
        if (type) grouped[type].push([x, y, z]);
      }
    }
  }

  const meshes = [];
  for (const type of blockNames) {
    const positions = grouped[type];
    if (!positions.length) continue;
    const mesh = new THREE.InstancedMesh(cubeGeo, materials[type], positions.length);
    mesh.castShadow = type !== 'leaves';
    mesh.receiveShadow = true;
    mesh.userData.blockPositions = positions;
    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i];
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    meshes.push(mesh);
  }
  chunks.set(id, meshes);
}
function rebuildAt(x, z) {
  const [cx, cz] = chunkOf(x, z);
  rebuildChunk(cx, cz);
}
function addBlock(x, y, z, type) {
  if (y < 0 || y > 24 || x < WORLD_MIN || x > WORLD_MAX || z < WORLD_MIN || z > WORLD_MAX) return false;
  if (getBlock(x, y, z)) return false;
  setBlockData(x, y, z, materials[type] ? type : 'grass');
  rebuildAt(x, z);
  return true;
}
function removeBlockAt(x, y, z) {
  if (y <= 0 || !getBlock(x, y, z)) return false;
  blocks.delete(keyOf(x, y, z));
  rebuildAt(x, z);
  return true;
}

// Génération du terrain 64 x 64 et de ses couches souterraines.
for (let x = WORLD_MIN; x <= WORLD_MAX; x++) {
  for (let z = WORLD_MIN; z <= WORLD_MAX; z++) {
    const h = heightAt(x, z);
    for (let y = 0; y <= h; y++) {
      setBlockData(x, y, z, y === h ? 'grass' : y >= h - 2 ? 'dirt' : 'stone');
    }
  }
}
// Arbres déterministes répartis dans le monde.
for (let tx = -28; tx <= 28; tx += 9) {
  for (let tz = -28; tz <= 28; tz += 11) {
    if ((Math.abs(tx * 3 + tz * 5) % 4) === 0) continue;
    const base = heightAt(tx, tz);
    for (let y = 1; y <= 3; y++) setBlockData(tx, base + y, tz, 'wood');
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        for (let oy = 3; oy <= 5; oy++) {
          if (Math.abs(ox) + Math.abs(oz) + (oy === 5 ? 1 : 0) < 5) {
            const x = tx + ox, y = base + oy, z = tz + oz;
            if (!getBlock(x, y, z)) setBlockData(x, y, z, 'leaves');
          }
        }
      }
    }
  }
}
// Création des chunks une seule fois au démarrage.
for (let cx = -4; cx <= 3; cx++) {
  for (let cz = -4; cz <= 3; cz++) rebuildChunk(cx, cz);
}

const groundY = heightAt(0, 10) + 2.7;
camera.position.set(0, groundY, 10);
const raycaster = new THREE.Raycaster();
raycaster.far = 7;
let selected = 'grass';
const isMobile = matchMedia('(pointer: coarse)').matches;
const keys = Object.create(null);
let verticalVelocity = 0;
let onGround = false;
let joystick = { x: 0, y: 0 };
let touchLook = null;

function selectBlock(type) {
  if (!materials[type]) return;
  selected = type;
  document.querySelectorAll('.slot').forEach(button => {
    button.classList.toggle('selected', button.dataset.block === type);
  });
}
document.querySelectorAll('.slot').forEach(button => {
  button.addEventListener('click', () => selectBlock(button.dataset.block));
});
addEventListener('keydown', event => {
  keys[event.code] = true;
  if (/^Digit[1-5]$/.test(event.code)) selectBlock(blockNames[Number(event.code.slice(-1)) - 1]);
  if (event.code === 'Space') event.preventDefault();
  if (event.code === 'KeyE') placeBlock();
});
addEventListener('keyup', event => { keys[event.code] = false; });
addEventListener('blur', () => { for (const key of Object.keys(keys)) keys[key] = false; });

renderer.domElement.addEventListener('click', () => {
  if (!isMobile && !controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => {
  document.querySelector('#hint').textContent = 'WASD : bouger · Souris : regarder · Clic gauche : miner · Clic droit : placer';
});
controls.addEventListener('unlock', () => {
  document.querySelector('#hint').textContent = 'Clique dans le monde pour jouer · WASD pour bouger · Espace pour sauter';
});

function targetBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects([...chunks.values()].flat(), false)[0];
  if (!hit || hit.instanceId === undefined) return null;
  const positions = hit.object.userData.blockPositions;
  const position = positions && positions[hit.instanceId];
  return position ? { position } : null;
}
function mineBlock() {
  const target = targetBlock();
  if (target) removeBlockAt(...target.position);
}
function placeBlock() {
  const target = targetBlock();
  if (!target) return;
  const [x, y, z] = target.position;
  const normal = targetBlockNormal();
  if (!normal) return;
  const nx = x + Math.round(normal.x), ny = y + Math.round(normal.y), nz = z + Math.round(normal.z);
  const playerBlock = new THREE.Vector3(nx, ny, nz);
  if (camera.position.distanceTo(playerBlock) < 1.35) return;
  addBlock(nx, ny, nz, selected);
}
function targetBlockNormal() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects([...chunks.values()].flat(), false)[0];
  return hit && hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
}

renderer.domElement.addEventListener('mousedown', event => {
  if (!controls.isLocked) return;
  if (event.button === 0) mineBlock();
  if (event.button === 2) placeBlock();
});
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
document.querySelector('#break').addEventListener('pointerdown', event => { event.preventDefault(); mineBlock(); });
document.querySelector('#place').addEventListener('pointerdown', event => { event.preventDefault(); placeBlock(); });
document.querySelector('#jump').addEventListener('pointerdown', event => {
  event.preventDefault();
  if (onGround) verticalVelocity = 7;
});

const joy = document.querySelector('#joystick');
const stick = document.querySelector('#stick');
joy.addEventListener('pointerdown', event => { joy.setPointerCapture(event.pointerId); moveJoy(event); });
joy.addEventListener('pointermove', event => { if (joy.hasPointerCapture(event.pointerId)) moveJoy(event); });
function moveJoy(event) {
  const rect = joy.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.min(42, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  joystick.x = Math.cos(angle) * length / 42;
  joystick.y = Math.sin(angle) * length / 42;
  stick.style.transform = 'translate(' + joystick.x * 42 + 'px,' + joystick.y * 42 + 'px)';
}
function resetJoy() {
  joystick = { x: 0, y: 0 };
  stick.style.transform = 'translate(0,0)';
}
joy.addEventListener('pointerup', resetJoy);
joy.addEventListener('pointercancel', resetJoy);

const lookZone = document.querySelector('#look-zone');
lookZone.addEventListener('pointerdown', event => {
  touchLook = { x: event.clientX, y: event.clientY, id: event.pointerId };
  lookZone.setPointerCapture(event.pointerId);
});
lookZone.addEventListener('pointermove', event => {
  if (!touchLook || touchLook.id !== event.pointerId) return;
  const dx = event.clientX - touchLook.x, dy = event.clientY - touchLook.y;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.45, 1.45);
  touchLook = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
lookZone.addEventListener('pointerup', () => { touchLook = null; });
lookZone.addEventListener('pointercancel', () => { touchLook = null; });

const clock = new THREE.Clock();
function update(dt) {
  const forward = Number(keys.KeyW || keys.ArrowUp) - Number(keys.KeyS || keys.ArrowDown) - joystick.y;
  const side = Number(keys.KeyD || keys.ArrowRight) - Number(keys.KeyA || keys.ArrowLeft) + joystick.x;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).negate();
  camera.position.addScaledVector(direction, forward * 5.5 * dt);
  camera.position.addScaledVector(right, side * 5.5 * dt);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, WORLD_MIN + 0.8, WORLD_MAX - 0.8);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, WORLD_MIN + 0.8, WORLD_MAX - 0.8);

  if (keys.Space && onGround) verticalVelocity = 7;
  verticalVelocity -= 19 * dt;
  camera.position.y += verticalVelocity * dt;
  const floor = heightAt(Math.round(camera.position.x), Math.round(camera.position.z)) + 1.65;
  if (camera.position.y < floor) {
    camera.position.y = floor;
    verticalVelocity = 0;
    onGround = true;
  } else {
    onGround = false;
  }
}
function animate() {
  requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
});
document.querySelector('#loading').classList.add('done');
document.querySelector('#hint').textContent = isMobile
  ? 'Joystick : bouger · Glisse à droite : regarder · ⛏ miner · ＋ placer'
  : 'Clique dans le monde pour jouer · WASD pour bouger · Espace pour sauter';
