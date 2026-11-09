import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Monde voxel organisé en chunks. Les blocs d'un chunk sont regroupés par matériau
// dans des InstancedMesh : beaucoup moins d'appels de rendu qu'un Mesh par bloc.
const CHUNK_SIZE = 8;
const WORLD_MIN = -32;
const WORLD_MAX = 31;
const RENDER_DISTANCE = 3;

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
// Textures pixelisées inspirées du Minecraft classique, avec davantage de nuances.
function makeBlockTexture(type, face) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = (type.split('').reduce((n, c) => n + c.charCodeAt(0), 0) * 92821 + face * 7919) >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const palettes = {
    grass: ['#68a943', '#75b84b', '#568f38', '#83c653'],
    grassSide: ['#865334', '#96613a', '#75462e', '#a16b40'],
    dirt: ['#865334', '#96613a', '#75462e', '#a16b40'],
    stone: ['#85898b', '#969a9b', '#74797b', '#a4a7a6'],
    wood: ['#96612f', '#a87339', '#754823', '#b78042'],
    leaves: ['#347d32', '#438f38', '#286b2b', '#58a344'],
    coal: ['#85898b', '#30343a', '#202428', '#555b60'],
    iron: ['#85898b', '#b8a99a', '#d1c2b2', '#786e67'],
    gold: ['#85898b', '#e7bd35', '#f5d65b', '#a77b20'],
    diamond: ['#85898b', '#35c9c5', '#8af4e9', '#168f9a']
  };
  const palette = palettes[type] || palettes.stone;
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  // Bruit de couleur en petits pixels pour casser les aplats trop uniformes.
  for (let i = 0; i < 250; i++) {
    ctx.fillStyle = palette[1 + Math.floor(random() * (palette.length - 1))];
    const w = random() > 0.86 ? 2 : 1;
    const h = random() > 0.9 ? 2 : 1;
    ctx.globalAlpha = 0.35 + random() * 0.45;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), w, h);
  }
  ctx.globalAlpha = 1;

  if (type === 'grass') {
    if (face === 2) {
      for (let i = 0; i < 38; i++) {
        ctx.fillStyle = palette[1 + Math.floor(random() * 3)];
        ctx.fillRect(Math.floor(random() * 32), Math.floor(random() * 32), 1 + (random() > 0.7 ? 1 : 0), 1);
      }
    } else if (face === 3) {
      ctx.fillStyle = '#75472f';
      ctx.fillRect(0, 0, 32, 32);
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = palette[Math.floor(random() * palette.length)];
        ctx.fillRect(Math.floor(random() * 32), Math.floor(random() * 32), 1, 1);
      }
    } else {
      ctx.fillStyle = '#6da943';
      ctx.fillRect(0, 0, 32, 6);
      ctx.fillStyle = '#578d36';
      ctx.fillRect(0, 6, 32, 2);
      for (let i = 0; i < 110; i++) {
        ctx.fillStyle = random() > 0.48 ? '#96613a' : '#75462e';
        ctx.fillRect(Math.floor(random() * 32), 8 + Math.floor(random() * 24), 1 + (random() > 0.8 ? 1 : 0), 1);
      }
    }
  }

  if (type === 'stone') {
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(random() * 29), y = Math.floor(random() * 29);
      ctx.fillStyle = '#686e70';
      ctx.fillRect(x, y, 2 + Math.floor(random() * 3), 1);
      ctx.fillRect(x + 2, y + 1, 1, 2);
    }
  }

  if (type === 'wood') {
    if (face === 2 || face === 3) {
      ctx.fillStyle = '#bd8b4b';
      ctx.fillRect(0, 0, 32, 32);
      for (let r = 0; r < 5; r++) {
        ctx.strokeStyle = r % 2 ? '#8c592c' : '#d4a15c';
        ctx.lineWidth = 1;
        ctx.strokeRect(4 + r * 2, 4 + r * 2, 24 - r * 4, 24 - r * 4);
      }
      ctx.fillStyle = '#805027';
      ctx.fillRect(15, 15, 2, 2);
    } else {
      for (let x = 3; x < 32; x += 7) {
        ctx.fillStyle = '#704522';
        ctx.fillRect(x, 0, 1, 32);
        ctx.fillStyle = '#bd8745';
        ctx.fillRect(x + 2, 0, 1, 32);
      }
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = '#6d4527';
        ctx.fillRect(Math.floor(random() * 32), Math.floor(random() * 32), 1, 3 + Math.floor(random() * 4));
      }
    }
  }

  if (type === 'leaves') {
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = palette[1 + Math.floor(random() * 3)];
      ctx.fillRect(Math.floor(random() * 32), Math.floor(random() * 32), 1 + (random() > 0.65 ? 1 : 0), 1 + (random() > 0.75 ? 1 : 0));
    }
  }

  if (['coal', 'iron', 'gold', 'diamond'].includes(type)) {
    const oreColor = palettes[type][1];
    const bright = palettes[type][2];
    for (let i = 0; i < 10; i++) {
      const x = 2 + Math.floor(random() * 27), y = 2 + Math.floor(random() * 27);
      ctx.fillStyle = oreColor;
      ctx.fillRect(x, y, 2 + Math.floor(random() * 3), 2 + Math.floor(random() * 3));
      ctx.fillStyle = bright;
      ctx.fillRect(x + 1, y, 1, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  return texture;
}
function makeBlockMaterials(type) {
  return Array.from({ length: 6 }, (_, face) => {
    let textureType = type;
    if (type === 'grass' && face !== 2 && face !== 3) textureType = 'grassSide';
    if (type === 'grass' && face === 3) textureType = 'dirt';
    return new THREE.MeshLambertMaterial({ map: makeBlockTexture(textureType, face) });
  });
}
const materials = {
  grass: makeBlockMaterials('grass'),
  dirt: makeBlockMaterials('dirt'),
  stone: makeBlockMaterials('stone'),
  wood: makeBlockMaterials('wood'),
  leaves: makeBlockMaterials('leaves'),
  coal: makeBlockMaterials('coal'),
  iron: makeBlockMaterials('iron'),
  gold: makeBlockMaterials('gold'),
  diamond: makeBlockMaterials('diamond')
};
const blockNames = Object.keys(materials);
const blocks = new Map(); // "x,y,z" -> type
const chunks = new Map(); // "cx,cz" -> meshes du chunk
const dummy = new THREE.Object3D();
const keyOf = (x, y, z) => x + ',' + y + ',' + z;
const chunkOf = (x, z) => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
const chunkKey = (cx, cz) => cx + ',' + cz;

function heightAt(x, z) {
  // Relief en plusieurs échelles : grandes collines, crêtes et petites ondulations.
  const broad = Math.sin(x * 0.105) * 2.6 + Math.cos(z * 0.09) * 2.2;
  const hills = Math.sin((x + z) * 0.065) * 1.8 + Math.cos((x - z) * 0.055) * 1.4;
  const ridge = Math.pow(Math.max(0, Math.sin(x * 0.045 + z * 0.035)), 2) * 4.5;
  const detail = Math.sin(x * 0.31 + z * 0.17) * 0.45 + Math.cos(z * 0.27 - x * 0.12) * 0.35;
  return THREE.MathUtils.clamp(Math.floor(4 + broad + hills + ridge + detail), 1, 14);
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
    // Sur mobile, désactive le rejet par caméra pour éviter qu'un volume d'instances incorrect masque le monde.
    mesh.frustumCulled = false;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    scene.add(mesh);
    meshes.push(mesh);
  }
  chunks.set(id, meshes);
}
function rebuildAt(x, z) {
  const [cx, cz] = chunkOf(x, z);
  // Ne reconstruire que les chunks actuellement chargés à l'écran.
  if (chunks.has(chunkKey(cx, cz))) rebuildChunk(cx, cz);
}
function refreshChunksAroundPlayer() {
  const [playerChunkX, playerChunkZ] = chunkOf(camera.position.x, camera.position.z);
  const wanted = new Set();
  for (let cx = Math.max(-4, playerChunkX - RENDER_DISTANCE); cx <= Math.min(3, playerChunkX + RENDER_DISTANCE); cx++) {
    for (let cz = Math.max(-4, playerChunkZ - RENDER_DISTANCE); cz <= Math.min(3, playerChunkZ + RENDER_DISTANCE); cz++) {
      const id = chunkKey(cx, cz);
      wanted.add(id);
      if (!chunks.has(id)) rebuildChunk(cx, cz);
    }
  }
  for (const [id, meshes] of chunks) {
    if (wanted.has(id)) continue;
    for (const mesh of meshes) scene.remove(mesh);
    chunks.delete(id);
  }
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

// Physique voxel : le sol réel dépend des blocs encore présents, pas du relief théorique.
function highestSolidBlock(x, z, atOrBelow = 24) {
  for (let y = Math.min(24, Math.floor(atOrBelow)); y >= 0; y--) {
    if (getBlock(x, y, z)) return y;
  }
  return -1;
}
function canOccupyPlayer(x, z, feetY) {
  const bodyBottom = Math.floor(feetY + 0.05);
  const bodyTop = Math.floor(feetY + 1.7);
  const px = Math.round(x), pz = Math.round(z);
  for (let y = bodyBottom; y <= bodyTop; y++) {
    if (getBlock(px, y, pz)) return false;
  }
  return true;
}

// Génération du terrain 64 x 64 et de ses couches souterraines.
for (let x = WORLD_MIN; x <= WORLD_MAX; x++) {
  for (let z = WORLD_MIN; z <= WORLD_MAX; z++) {
    const h = heightAt(x, z);
    for (let y = 0; y <= h; y++) {
      setBlockData(x, y, z, y === h ? (h >= 10 ? 'stone' : 'grass') : y >= h - 2 ? 'dirt' : 'stone');
    }
  }
}

// Cavernes souterraines : un champ 3D déterministe crée des poches reliées
// sans toucher à la couche de surface ni au point de départ.
for (let x = WORLD_MIN; x <= WORLD_MAX; x++) {
  for (let z = WORLD_MIN; z <= WORLD_MAX; z++) {
    const h = heightAt(x, z);
    for (let y = 2; y <= h - 3; y++) {
      const caveA = Math.sin(x * 0.17 + y * 0.23 + Math.sin(z * 0.11));
      const caveB = Math.cos(z * 0.16 - y * 0.19 + Math.sin(x * 0.09));
      const caveC = Math.sin((x - z) * 0.075 + y * 0.13);
      const caveField = caveA * 0.48 + caveB * 0.38 + caveC * 0.24;
      if (caveField > 0.72) blocks.delete(keyOf(x, y, z));
    }
  }
}

// Minerais intégrés dans la roche. Leur répartition reste identique à chaque partie.
for (let x = WORLD_MIN; x <= WORLD_MAX; x++) {
  for (let z = WORLD_MIN; z <= WORLD_MAX; z++) {
    const h = heightAt(x, z);
    for (let y = 1; y < h - 1; y++) {
      if (getBlock(x, y, z) !== 'stone') continue;
      const oreRoll = Math.abs(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453) % 1;
      if (y <= 3 && oreRoll > 0.992) setBlockData(x, y, z, 'diamond');
      else if (y <= 6 && oreRoll > 0.982) setBlockData(x, y, z, 'gold');
      else if (oreRoll > 0.965) setBlockData(x, y, z, 'iron');
      else if (oreRoll > 0.935) setBlockData(x, y, z, 'coal');
    }
  }
}

// Forêts déterministes, plus naturelles et adaptées aux pentes.
for (let tx = -27; tx <= 27; tx += 6) {
  for (let tz = -27; tz <= 27; tz += 7) {
    const treeRoll = Math.abs(Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453) % 1;
    if (treeRoll > 0.34) continue;
    const base = heightAt(tx, tz);
    const slope = Math.max(
      Math.abs(base - heightAt(tx + 1, tz)),
      Math.abs(base - heightAt(tx - 1, tz)),
      Math.abs(base - heightAt(tx, tz + 1)),
      Math.abs(base - heightAt(tx, tz - 1))
    );
    if (base >= 9 || slope > 2) continue;
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
// Chargement initial autour du point de départ (les autres chunks seront chargés à l'approche).
const groundY = heightAt(0, 10) + 2.7;
camera.position.set(0, groundY, 10);
// Oriente légèrement la vue vers le terrain pour rendre le monde visible dès le démarrage.
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.65;
// Construction explicite des 64 chunks au démarrage : évite un monde vide si
// le calcul de proximité ne s'initialise pas correctement sur certains mobiles.
for (let initialCx = -4; initialCx <= 3; initialCx++) {
  for (let initialCz = -4; initialCz <= 3; initialCz++) {
    rebuildChunk(initialCx, initialCz);
  }
}
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
  // Réponse plus douce du joystick mobile : 60 % de l'amplitude maximale.
  const sensitivity = 0.6;
  joystick.x = Math.cos(angle) * length / 42 * sensitivity;
  joystick.y = Math.sin(angle) * length / 42 * sensitivity;
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
  event.preventDefault();
  touchLook = { x: event.clientX, y: event.clientY, id: event.pointerId };
  lookZone.setPointerCapture(event.pointerId);
});
lookZone.addEventListener('pointermove', event => {
  if (!touchLook || touchLook.id !== event.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - touchLook.x, dy = event.clientY - touchLook.y;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.45, 1.45);
  touchLook = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
lookZone.addEventListener('pointerup', () => { touchLook = null; });
lookZone.addEventListener('pointercancel', () => { touchLook = null; });

const clock = new THREE.Clock();
let lastChunkId = '';
function update(dt) {
  const forward = Number(Boolean(keys.KeyW || keys.ArrowUp)) - Number(Boolean(keys.KeyS || keys.ArrowDown)) - joystick.y;
  const side = Number(Boolean(keys.KeyA || keys.ArrowLeft)) - Number(Boolean(keys.KeyD || keys.ArrowRight)) - joystick.x;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).negate();

  // Déplacement horizontal bloqué uniquement par les blocs réellement présents.
  const feetBeforeMove = camera.position.y - 1.65;
  const moveX = right.x * side * 5.5 * dt + direction.x * forward * 5.5 * dt;
  const moveZ = right.z * side * 5.5 * dt + direction.z * forward * 5.5 * dt;
  const nextX = THREE.MathUtils.clamp(camera.position.x + moveX, WORLD_MIN + 0.8, WORLD_MAX - 0.8);
  const nextZ = THREE.MathUtils.clamp(camera.position.z + moveZ, WORLD_MIN + 0.8, WORLD_MAX - 0.8);
  if (canOccupyPlayer(nextX, camera.position.z, feetBeforeMove)) camera.position.x = nextX;
  if (canOccupyPlayer(camera.position.x, nextZ, feetBeforeMove)) camera.position.z = nextZ;

  const [chunkX, chunkZ] = chunkOf(camera.position.x, camera.position.z);
  const currentChunkId = chunkKey(chunkX, chunkZ);
  if (currentChunkId !== lastChunkId) {
    lastChunkId = currentChunkId;
    refreshChunksAroundPlayer();
  }

  if (keys.Space && onGround) verticalVelocity = 7;
  verticalVelocity -= 19 * dt;
  camera.position.y += verticalVelocity * dt;

  // Cherche le vrai support sous le joueur : une case minée devient un trou traversable.
  const groundX = Math.round(camera.position.x);
  const groundZ = Math.round(camera.position.z);
  const feetY = camera.position.y - 1.65;
  const supportY = highestSolidBlock(groundX, groundZ, Math.floor(feetY + 0.08));
  const floor = supportY >= 0 ? supportY + 2.65 : -Infinity;
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
const debugStatus = document.querySelector('#debug-status');
debugStatus.hidden = false;
debugStatus.textContent = 'Moteur 3D actif · ' + blocks.size.toLocaleString('fr-FR') + ' blocs · ' + chunks.size + ' zones · ' + [...chunks.values()].reduce((total, meshes) => total + meshes.length, 0) + ' groupes 3D';
document.querySelector('#hint').textContent = isMobile
  ? 'Joystick : bouger · Glisse à droite : regarder · ⛏ miner · ＋ placer'
  : 'Clique dans le monde pour jouer · WASD pour bouger · Espace pour sauter';
