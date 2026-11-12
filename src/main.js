import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Monde voxel organisé en chunks. Les blocs d'un chunk sont regroupés par matériau
// dans des InstancedMesh : beaucoup moins d'appels de rendu qu'un Mesh par bloc.
const CHUNK_SIZE = 8;
const WORLD_MIN = -64;
const WORLD_MAX = 63;
const RENDER_DISTANCE = 3;

const scene = new THREE.Scene();

// Effets audio du pack CC0 : sons réels intégrés au projet.
const AUDIO_ASSETS = {
  select: new URL('../assets/audio/ui-select.mp3', import.meta.url).href,
  gem: new URL('../assets/audio/pickup-gem.mp3', import.meta.url).href,
  item: new URL('../assets/audio/pickup-item.mp3', import.meta.url).href,
  pick: new URL('../assets/audio/mine-pick.mp3', import.meta.url).href,
  crack: new URL('../assets/audio/mine-crack.mp3', import.meta.url).href,
  rubble: new URL('../assets/audio/mine-rubble.mp3', import.meta.url).href,
  crystal: new URL('../assets/audio/mine-crystal.mp3', import.meta.url).href,
  wood: new URL('../assets/audio/mine-wood.mp3', import.meta.url).href,
  place: new URL('../assets/audio/place-block.mp3', import.meta.url).href
};
let audioContext = null;
let noiseBuffer = null;
let audioLoading = null;
const audioBuffers = new Map();
const pendingAudio = [];
function preloadAudio(ctx) {
  if (audioLoading) return audioLoading;
  audioLoading = Promise.all(Object.entries(AUDIO_ASSETS).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Impossible de charger le son : ' + name);
    const encoded = await response.arrayBuffer();
    audioBuffers.set(name, await ctx.decodeAudioData(encoded));
  })).then(() => {
    const queued = pendingAudio.splice(0);
    queued.forEach(sound => playAudioAsset(sound.name, sound.volume, sound.delay, false));
  }).catch(error => {
    console.warn('Chargement des effets sonores incomplet :', error);
    pendingAudio.length = 0;
    audioLoading = null;
  });
  return audioLoading;
}
function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) {
    audioContext = new AudioCtor();
    noiseBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.2), audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  preloadAudio(audioContext);
  return audioContext;
}
function playAudioAsset(name, volume = 0.45, delay = 0, queueIfLoading = true) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const buffer = audioBuffers.get(name);
  if (!buffer) {
    if (queueIfLoading && pendingAudio.length < 12) pendingAudio.push({ name, volume, delay });
    return;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime + delay;
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, startAt);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(startAt);
}

// Sons d'animaux du pack Animal Calls de SFXMint (CC0 1.0).
// Fichiers MP3 directs et stables ; les appels sont ajustés pour garder
// des bruitages courts, tout en laissant respirer le meuglement de la vache.
const ANIMAL_AUDIO_URLS = {
  cow: 'https://sfxmint.com/dl/cow-moo-02.mp3',
  pig: 'https://sfxmint.com/dl/pig-oink-02.mp3',
  sheep: 'https://sfxmint.com/dl/sheep-bleat-02.mp3',
  chicken: 'https://sfxmint.com/dl/hen-cluck-02.mp3'
};
const ANIMAL_AUDIO_CUTS = { cow: 2.2, pig: 0.85, sheep: 1.0, chicken: 0.55 };
// Un seul cri à la fois : évite que les groupes d'animaux deviennent bruyants.
let nextAnimalCallAt = 0;
function playAnimalCall(type, distance) {
  const url = ANIMAL_AUDIO_URLS[type];
  if (!url || distance >= 24) return;
  const now = performance.now();
  if (now < nextAnimalCallAt) return;
  nextAnimalCallAt = now + 1100 + Math.random() * 900;
  const audio = new Audio(url);
  audio.preload = 'auto';
  // Atténuation progressive avec la distance et légère variation naturelle.
  const distanceGain = Math.pow(Math.max(0, 1 - distance / 26), 1.35);
  audio.volume = Math.max(0.025, Math.min(0.34, 0.34 * distanceGain * (0.82 + Math.random() * 0.18)));
  audio.playbackRate = 1.08 + Math.random() * 0.14;
  audio.play().then(() => {
    window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, ANIMAL_AUDIO_CUTS[type] * 1000);
  }).catch(error => console.warn('Son animal indisponible :', type, error));
}

// Sons de minage SFXMint, hébergés à leur adresse directe (hotlink autorisé, CC0 1.0).
// Lecture via Audio HTML pour éviter les restrictions CORS du décodage WebAudio distant.
const MINING_AUDIO_URLS = {
  pickaxe: 'https://sfxmint.com/dl/pickaxe-02.mp3',
  ore: 'https://sfxmint.com/dl/pickaxe-03.mp3',
  break: 'https://sfxmint.com/dl/rock-break-08.mp3',
  crumble: 'https://sfxmint.com/dl/rock-crumbling-04.mp3'
};
function playRemoteMiningSound(name, volume = 0.4, delay = 0, maxDuration = 0.28) {
  const url = MINING_AUDIO_URLS[name];
  if (!url) return;
  const play = () => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, volume));
    // Accélère légèrement le son et coupe sa queue : impacts courts façon Minecraft.
    audio.playbackRate = 1.55;
    audio.play().then(() => {
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, maxDuration * 1000);
    }).catch(error => console.warn('Son de minage indisponible :', name, error));
  };
  if (delay > 0) window.setTimeout(play, delay * 1000);
  else play();
}
function playSound(kind, material = 'stone') {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(1, now);
  output.connect(ctx.destination);
  const tone = (frequency, endFrequency, duration, volume, wave = 'sine', delay = 0) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, now + delay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + delay + duration);
    gain.gain.setValueAtTime(volume, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
    osc.connect(gain); gain.connect(output);
    osc.start(now + delay); osc.stop(now + delay + duration + 0.02);
  };
  const noise = (duration, volume, frequency = 1500) => {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(output);
    source.start(now); source.stop(now + duration);
  };
  if (kind === 'mine') {
    if (material === 'wood') playAudioAsset('wood', 0.5);
    else if (material === 'leaves') {
      // Les feuilles restent discrètes, sans son métallique de pioche.
    } else if (['coal', 'iron', 'gold', 'diamond'].includes(material)) {
      playRemoteMiningSound('ore', 0.48, 0, 0.24);
      playRemoteMiningSound('break', 0.30, 0.07, 0.22);
    } else {
      playRemoteMiningSound('pickaxe', 0.34, 0, 0.20);
      playRemoteMiningSound('break', 0.38, 0.06, 0.22);
      playRemoteMiningSound('crumble', 0.24, 0.13, 0.18);
    }
  } else if (kind === 'place') {
    playAudioAsset('place', 0.5);
  } else if (kind === 'jump') {
    tone(190, 520, 0.18, 0.13, 'sine');
  } else if (kind === 'step') {
    noise(0.055, 0.075, 420);
    tone(105, 65, 0.06, 0.035, 'sine');
  } else if (kind === 'select') {
    playAudioAsset('select', 0.42);
  }
}
function jumpPlayer() {
  if (!onGround) return;
  verticalVelocity = 7;
  playSound('jump');
}
ensureAudio();
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
// Textures pixel-art 16x16, proches du pack Minecraft vanilla classique.
function makeBlockTexture(type, face) {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = (type.split('').reduce((n, c) => n + c.charCodeAt(0), 0) * 92821 + face * 7919) >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pixel = (x, y, color, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const palettes = {
    grass: ['#79b83b', '#70ad35', '#83c447', '#659d30', '#8bc94b'],
    dirt: ['#866043', '#795438', '#906747', '#704c34', '#9b704d'],
    stone: ['#7d7d7d', '#858585', '#747474', '#8c8c8c', '#696969'],
    wood: ['#95602f', '#a8733d', '#815027', '#b47b40', '#704522'],
    leaves: ['#3f8f25', '#347d20', '#4b9c2b', '#2f701e', '#58a832'],
    coal: ['#7d7d7d', '#252525', '#171717', '#353535'],
    iron: ['#7d7d7d', '#c1aa91', '#d8c5ad', '#8f806f'],
    gold: ['#7d7d7d', '#e6bd27', '#f6d84b', '#b58a18'],
    diamond: ['#7d7d7d', '#36c9c7', '#8af1e8', '#168f9a']
  };
  const palette = palettes[type] || palettes.stone;
  const fillNoise = (colors, count, minW = 1, maxW = 2) => {
    for (let i = 0; i < count; i++) {
      const w = minW + Math.floor(random() * (maxW - minW + 1));
      const h = random() > 0.78 ? 2 : 1;
      pixel(Math.floor(random() * (size - w + 1)), Math.floor(random() * (size - h + 1)),
        colors[Math.floor(random() * colors.length)], w, h);
    }
  };

  // Fonds et motifs spécifiques à chaque bloc.
  if (type === 'grass') {
    if (face === 2) {
      // Dessus : mosaïque 16x16 en petits carrés verts, comme le bloc
      // d'herbe classique de Minecraft (motif irrégulier, sans dégradé).
      const top = [
        '0011222200112233',
        '0011222200112233',
        '1100223311002233',
        '1100223311002233',
        '2233110022331100',
        '2233110022331100',
        '3322110033221100',
        '3322110033221100',
        '0011332200113322',
        '0011332200113322',
        '2211003322110033',
        '2211003322110033',
        '1133220011332200',
        '1133220011332200',
        '0033221100332211',
        '0033221100332211'
      ];
      const greens = ['#315f2e', '#3d7335', '#477f3b', '#548d43'];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const index = Number(top[y][x]);
          pixel(x, y, greens[index]);
        }
      }
      // Quelques nuances isolées gardent l'aspect pixelisé naturel.
      for (let i = 0; i < 15; i++) {
        const x = Math.floor(random() * 16), y = Math.floor(random() * 16);
        pixel(x, y, random() > 0.5 ? '#5b9849' : '#294f29');
      }
    } else if (face === 3) {
      pixel(0, 0, '#795438', 16, 16);
      fillNoise(['#866043', '#795438', '#906747', '#704c34', '#9b704d'], 58, 1, 2);
    } else {
      // Flanc : terre brun pixelisée, petites inclusions gris bleuté,
      // puis couche d'herbe irrégulière qui descend par mèches carrées.
      const dirt = ['#795438', '#866043', '#906747', '#704c34', '#9b704d', '#67452f'];
      pixel(0, 0, '#795438', 16, 16);
      fillNoise(dirt, 68, 1, 3);
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(random() * 15), y = 5 + Math.floor(random() * 10);
        pixel(x, y, '#667783', 1 + (random() > 0.65 ? 1 : 0), 1);
      }
      const grass = ['#315f2e', '#3d7335', '#477f3b', '#548d43'];
      const fringe = [4,3,4,5,3,4,6,4,3,5,4,6,3,4,5,3];
      for (let x = 0; x < 16; x++) {
        const drop = fringe[x] + (random() > 0.82 ? 1 : 0);
        pixel(x, 0, grass[Math.floor(random() * grass.length)], 1, drop);
        if (drop > 2) pixel(x, drop - 1, random() > 0.5 ? '#315f2e' : '#3d7335');
      }
      // Liseré sombre sous le gazon et petites racines carrées.
      for (let x = 0; x < 16; x++) {
        if (random() > 0.55) pixel(x, fringe[x], '#563d2b');
      }
    }
  } else if (type === 'dirt') {
    pixel(0, 0, '#866043', 16, 16);
    fillNoise(palettes.dirt, 62);
  } else if (type === 'stone' || ['coal', 'iron', 'gold', 'diamond'].includes(type)) {
    pixel(0, 0, '#7d7d7d', 16, 16);
    fillNoise(['#858585', '#747474', '#8c8c8c', '#696969'], 66);
    // Petites cassures et taches discrètes, comme la pierre vanilla.
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(random() * 14), y = Math.floor(random() * 14);
      pixel(x, y, '#686868', 2, 1);
      pixel(x + 1, y + 1, '#929292');
    }
    if (type !== 'stone') {
      const ore = palettes[type];
      // Filons en petits amas pixelisés, bordés d'une ombre plus sombre.
      const clusters = 3 + Math.floor(random() * 2);
      for (let c = 0; c < clusters; c++) {
        const x = 1 + Math.floor(random() * 13), y = 1 + Math.floor(random() * 13);
        pixel(x, y, ore[3], 2, 2);
        pixel(x + 1, y, ore[1], 2, 1);
        pixel(x, y + 1, ore[1], 1, 2);
        pixel(x + 1, y + 1, ore[2], 1, 1);
      }
    }
  } else if (type === 'wood') {
    if (face === 2 || face === 3) {
      pixel(0, 0, '#bd9259', 16, 16);
      pixel(2, 2, '#a97843', 12, 12);
      pixel(4, 4, '#d0a56b', 8, 8);
      pixel(6, 6, '#a97843', 4, 4);
      pixel(7, 7, '#d0a56b', 2, 2);
      pixel(7, 7, '#80502a');
      pixel(1, 5, '#e0b77b'); pixel(12, 2, '#e0b77b');
      pixel(3, 12, '#8a5a31'); pixel(12, 12, '#8a5a31');
    } else {
      pixel(0, 0, '#95602f', 16, 16);
      for (let x = 0; x < 16; x++) {
        const stripe = x % 4;
        if (stripe === 0) pixel(x, 0, '#704522', 1, 16);
        else if (stripe === 1) pixel(x, 0, '#b47b40', 1, 16);
        else if (stripe === 2) pixel(x, 0, '#a8733d', 1, 16);
      }
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(random() * 16), y = Math.floor(random() * 13);
        pixel(x, y, '#704522', 1, 2 + Math.floor(random() * 3));
      }
    }
  } else if (type === 'leaves') {
    pixel(0, 0, '#3f8f25', 16, 16);
    fillNoise(['#347d20', '#4b9c2b', '#2f701e', '#58a832', '#438c27'], 90);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(random() * 15), y = Math.floor(random() * 15);
      pixel(x, y, '#28691c', 2, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}
function makeBlockMaterials(type) {
  return Array.from({ length: 6 }, (_, face) => {
    return new THREE.MeshLambertMaterial({ map: makeBlockTexture(type, face) });
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

const inventory = Object.fromEntries(Object.keys(materials).map(type => [type, 0]));
const oreDrops = { coal: 'coal', iron: 'raw_iron', gold: 'raw_gold', diamond: 'diamond' };
function addToInventory(blockType) {
  const item = oreDrops[blockType] || blockType;
  inventory[item] = (inventory[item] || 0) + 1;
  const counter = document.querySelector('[data-count="' + item + '"]');
  if (counter) counter.textContent = inventory[item];
  playAudioAsset(item === 'diamond' ? 'gem' : 'item', item === 'diamond' ? 0.48 : 0.28, 0.12);
}
function drawOreInventoryIcons() {
  const palettes = {
    coal: ['#25292d', '#69747c', '#101214', '#c0c7ca'],
    raw_iron: ['#bd9878', '#f0d4b5', '#76533c', '#fff0dc'],
    raw_gold: ['#d6a51c', '#ffeb72', '#80530a', '#fff5b8'],
    diamond: ['#20aeb7', '#a1fff5', '#086b7c', '#e0fffc']
  };
  for (const type of Object.keys(palettes)) {
    const canvas = document.querySelector('canvas[data-ore-icon="' + type + '"]');
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    const p = palettes[type];
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.moveTo(5, 13); ctx.lineTo(11, 5); ctx.lineTo(21, 6);
    ctx.lineTo(28, 14); ctx.lineTo(24, 24); ctx.lineTo(15, 29);
    ctx.lineTo(6, 24); ctx.lineTo(3, 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p[0];
    ctx.beginPath();
    ctx.moveTo(5, 12); ctx.lineTo(11, 5); ctx.lineTo(21, 7);
    ctx.lineTo(27, 14); ctx.lineTo(23, 23); ctx.lineTo(15, 27);
    ctx.lineTo(7, 22); ctx.lineTo(4, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p[1];
    ctx.beginPath(); ctx.moveTo(5, 12); ctx.lineTo(11, 5);
    ctx.lineTo(17, 14); ctx.lineTo(10, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p[2];
    ctx.beginPath(); ctx.moveTo(17, 14); ctx.lineTo(27, 14);
    ctx.lineTo(23, 23); ctx.lineTo(15, 27); ctx.lineTo(10, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p[3]; ctx.fillRect(10, 9, 4, 2); ctx.fillRect(7, 15, 2, 2);
  }
}
drawOreInventoryIcons();

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
  for (let cx = Math.max(Math.floor(WORLD_MIN / CHUNK_SIZE), playerChunkX - RENDER_DISTANCE); cx <= Math.min(Math.floor(WORLD_MAX / CHUNK_SIZE), playerChunkX + RENDER_DISTANCE); cx++) {
    for (let cz = Math.max(Math.floor(WORLD_MIN / CHUNK_SIZE), playerChunkZ - RENDER_DISTANCE); cz <= Math.min(Math.floor(WORLD_MAX / CHUNK_SIZE), playerChunkZ + RENDER_DISTANCE); cz++) {
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
  if (y <= 0) return false;
  const minedType = getBlock(x, y, z);
  if (!minedType) return false;
  // Les blocs ordinaires sont récoltés comme blocs ; les minerais donnent uniquement leur ressource.
  addToInventory(minedType);
  playSound('mine', minedType);
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

// Animaux pacifiques : modèles cubiques légers et déplacements autonomes.
const animals = [];
// 16 animaux maximum, répartis dans les 16 secteurs de la carte.
const MAX_ANIMALS = 16;
// Textures animales pixelisées 16x16, dans l'esprit des textures Minecraft.
const animalTextureCache = new Map();
function makeAnimalTexture(type, part) {
  const key = type + ':' + part;
  if (animalTextureCache.has(key)) return animalTextureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const palettes = {
    cow: {
      body: ['#eee9dc', '#292522', '#f7f3e9'],
      head: ['#704b36', '#563726', '#8a6046'],
      muzzle: ['#d79b83', '#bd7968', '#e9b39b'],
      legs: ['#49352b', '#5e4637', '#342720']
    },
    pig: {
      body: ['#e99a9d', '#d98289', '#f4b5b5'],
      head: ['#efa7aa', '#d9878e', '#f6bdbb'],
      muzzle: ['#d77c85', '#b95f6b', '#f1a0a4'],
      legs: ['#d98289', '#c66e78', '#eda0a4']
    },
    sheep: {
      body: ['#eeeae0', '#d9d4c9', '#faf7ed'],
      head: ['#aaa19a', '#817873', '#c1b8ae'],
      muzzle: ['#d7aaa0', '#bf8981', '#e8c0b4'],
      legs: ['#51433f', '#6c5b53', '#392f2c']
    },
    chicken: {
      body: ['#f1eee5', '#ddd9cf', '#fffaf0'],
      head: ['#f7f3e9', '#e7e1d5', '#fffdf5'],
      wing: ['#d8d4c9', '#c5c0b5', '#eee9df'],
      legs: ['#d99a35', '#bd7924', '#efbd51']
    }
  };
  const p = palettes[type][part] || palettes[type].body;
  ctx.fillStyle = p[0];
  ctx.fillRect(0, 0, 16, 16);
  // Motif de petites nuances carrées, sans flou ni dégradé.
  let seed = type.length * 71 + part.length * 37;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      seed = (seed * 9301 + 49297) % 233280;
      const roll = seed / 233280;
      const sheepWool = type === 'sheep' && part === 'body';
      if (sheepWool ? roll > 0.965 : roll > 0.79) {
        ctx.fillStyle = p[1];
        ctx.fillRect(x, y, 1, 1);
      } else if (sheepWool ? roll < 0.025 : roll < 0.12) {
        ctx.fillStyle = p[2];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  if (type === 'cow' && part === 'body') {
    // Grandes taches noires irrégulières typiques de la vache Minecraft.
    for (const spot of [[2,2,4,3],[10,1,4,4],[6,8,3,3],[12,11,3,4],[1,12,3,2]]) {
      ctx.fillStyle = p[1];
      ctx.fillRect(spot[0], spot[1], spot[2], spot[3]);
      ctx.fillRect(spot[0] + 1, spot[1] - 1, Math.max(1, spot[2] - 2), 1);
    }
  }
  if (type === 'sheep' && part === 'body') {
    // Laine presque blanche, avec seulement quelques pixels gris très discrets.
    for (const [x,y] of [[2,3],[11,2],[6,8],[14,12],[3,14],[9,5]]) {
      ctx.fillStyle = p[1];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  animalTextureCache.set(key, texture);
  return texture;
}
const animalMaterials = {};
for (const type of ['cow', 'pig', 'sheep', 'chicken']) {
  animalMaterials[type] = {};
  const parts = type === 'cow' ? ['body','head','muzzle','legs'] :
    type === 'pig' ? ['body','head','muzzle','legs'] :
    type === 'sheep' ? ['body','head','muzzle','legs'] : ['body','head','wing','legs'];
  for (const part of parts) {
    animalMaterials[type][part] = new THREE.MeshLambertMaterial({ map: makeAnimalTexture(type, part) });
  }
  animalMaterials[type].dark = new THREE.MeshLambertMaterial({ color: type === 'cow' ? 0x292522 : 0x292522 });
  animalMaterials[type].eye = new THREE.MeshLambertMaterial({ color: 0x171412 });
  if (type === 'sheep') animalMaterials[type].face = new THREE.MeshLambertMaterial({ color: 0x947765 });
  animalMaterials[type].eyeLight = new THREE.MeshLambertMaterial({ color: 0xffffff });
  animalMaterials[type].horn = new THREE.MeshLambertMaterial({ color: 0xd8c99e });
  animalMaterials[type].beak = new THREE.MeshLambertMaterial({ color: 0xe5a52c });
  animalMaterials[type].comb = new THREE.MeshLambertMaterial({ color: 0xc83d35 });
  animalMaterials[type].wattle = new THREE.MeshLambertMaterial({ color: 0xc83d35 });
  // Le cochon reste entièrement rose : museau, narines et sabots compris.
  animalMaterials[type].nostril = new THREE.MeshLambertMaterial({
    color: type === 'pig' ? 0xc96f79 : 0x713d45
  });
  animalMaterials[type].hoof = new THREE.MeshLambertMaterial({
    color: type === 'pig' ? 0xd98289 : 0x382d29
  });
}
const animalBox = new THREE.BoxGeometry(1, 1, 1);
function animalPart(group, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(animalBox, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function addAnimalEyes(group, material, x, y, z, spread = 0.2, size = 0.075) {
  for (const side of [-1, 1]) {
    animalPart(group, material, side * spread, y, z, size, size, 0.035);
  }
}
function makeAnimal(type) {
  const group = new THREE.Group();
  const m = animalMaterials[type];
  const legs = [];
  if (type === 'cow') {
    animalPart(group, m.body, 0, 0.94, 0, 1.08, 0.82, 1.42);
    animalPart(group, m.head, 0, 1.2, 0.78, 0.62, 0.62, 0.58);
    animalPart(group, m.muzzle, 0, 1.03, 1.1, 0.42, 0.28, 0.2);
    animalPart(group, m.horn, -0.27, 1.57, 0.68, 0.1, 0.2, 0.1);
    animalPart(group, m.horn, 0.27, 1.57, 0.68, 0.1, 0.2, 0.1);
    animalPart(group, m.body, -0.39, 1.35, 0.75, 0.2, 0.16, 0.28);
    animalPart(group, m.body, 0.39, 1.35, 0.75, 0.2, 0.16, 0.28);
    addAnimalEyes(group, m.eye, 0, 1.29, 1.075, 0.2, 0.075);
    animalPart(group, m.nostril, -0.1, 1.04, 1.205, 0.045, 0.055, 0.02);
    animalPart(group, m.nostril, 0.1, 1.04, 1.205, 0.045, 0.055, 0.02);
  } else if (type === 'pig') {
    animalPart(group, m.body, 0, 0.83, 0, 0.98, 0.74, 1.22);
    animalPart(group, m.head, 0, 1.1, 0.68, 0.62, 0.62, 0.58);
    animalPart(group, m.muzzle, 0, 0.99, 1.0, 0.42, 0.3, 0.16);
    animalPart(group, m.head, -0.23, 1.47, 0.64, 0.18, 0.24, 0.16);
    animalPart(group, m.head, 0.23, 1.47, 0.64, 0.18, 0.24, 0.16);
    addAnimalEyes(group, m.eye, 0, 1.22, 0.99, 0.2, 0.07);
    animalPart(group, m.nostril, -0.12, 1.0, 1.09, 0.065, 0.1, 0.025);
    animalPart(group, m.nostril, 0.12, 1.0, 1.09, 0.065, 0.1, 0.025);
  } else if (type === 'sheep') {
    // Silhouette proche du mouton Minecraft : corps de laine compact,
    // tête avancée et quatre petites pattes droites.
    animalPart(group, m.body, 0, 1.02, -0.04, 1.02, 0.98, 1.38);
    // Quelques petits volumes carrés adoucissent le contour sans déformer le corps.
    for (const [x,y,z,sx,sy,sz] of [
      [-0.40,1.43,0.36,0.24,0.22,0.28],[0.40,1.43,0.36,0.24,0.22,0.28],
      [-0.40,1.43,-0.40,0.24,0.22,0.28],[0.40,1.43,-0.40,0.24,0.22,0.28],
      [0,1.49,-0.04,0.30,0.16,0.38]
    ]) animalPart(group, m.body, x,y,z,sx,sy,sz);
    // Tête gris clair, face beige/brune, yeux noirs et petit museau rose.
    animalPart(group, m.head, 0, 1.12, 0.91, 0.56, 0.60, 0.56);
    animalPart(group, m.face, 0, 1.12, 1.195, 0.43, 0.38, 0.035);
    animalPart(group, m.muzzle, 0, 0.91, 1.225, 0.29, 0.23, 0.10);
    // Oreilles courtes, intégrées à la tête.
    animalPart(group, m.head, -0.34, 1.25, 0.91, 0.18, 0.13, 0.24);
    animalPart(group, m.head, 0.34, 1.25, 0.91, 0.18, 0.13, 0.24);
    addAnimalEyes(group, m.eye, 0, 1.17, 1.225, 0.145, 0.065);
  } else {
    animalPart(group, m.body, 0, 0.72, 0, 0.62, 0.72, 0.72);
    animalPart(group, m.wing, -0.32, 0.78, -0.02, 0.16, 0.42, 0.48);
    animalPart(group, m.wing, 0.32, 0.78, -0.02, 0.16, 0.42, 0.48);
    animalPart(group, m.head, 0, 1.17, 0.3, 0.4, 0.4, 0.4);
    animalPart(group, m.beak, 0, 1.08, 0.55, 0.22, 0.13, 0.2);
    animalPart(group, m.comb, 0, 1.43, 0.27, 0.13, 0.18, 0.13);
    animalPart(group, m.wattle, 0, 0.91, 0.53, 0.1, 0.16, 0.08);
    addAnimalEyes(group, m.eye, 0, 1.22, 0.5, 0.14, 0.055);
  }
  const legX = type === 'chicken' ? 0.18 : (type === 'pig' ? 0.31 : 0.36);
  const legZ = type === 'chicken' ? 0.2 : 0.43;
  const legW = type === 'chicken' ? 0.09 : 0.17;
  const legH = type === 'chicken' ? 0.38 : 0.62;
  for (const x of [-legX, legX]) {
    // Les poules n'ont que deux pattes : une de chaque côté.
    // Les autres animaux ont quatre pattes, réparties à l'avant et à l'arrière.
    const legPositions = type === 'chicken' ? [0.20] : [-legZ, legZ];
    for (const z of legPositions) {
      if (type === 'sheep') {
        const upper = animalPart(group, m.body, x, 0.34, z, 0.17, 0.32, 0.17);
        animalPart(group, m.legs, x, 0.13, z, 0.17, 0.26, 0.17);
        animalPart(group, m.dark, x, 0.025, z + 0.012, 0.18, 0.05, 0.18);
        legs.push(upper);
      } else {
        const leg = animalPart(group, m.legs, x, legH / 2, z, legW, legH, legW);
        legs.push(leg);
        if (type !== 'chicken') animalPart(group, m.hoof, x, 0.055, z + 0.015, legW * 1.12, 0.11, legW * 1.12);
      }
    }
  }
  group.userData.legs = legs;
  group.userData.type = type;
  return group;
}
function animalGroundAt(x, z) {
  const gx = Math.round(x), gz = Math.round(z);
  if (gx <= WORLD_MIN || gx >= WORLD_MAX || gz <= WORLD_MIN || gz >= WORLD_MAX) return null;
  const top = highestSolidBlock(gx, gz);
  if (top < 0 || getBlock(gx, top, gz) !== 'grass') return null;
  if (Math.abs(top - highestSolidBlock(gx + 1, gz)) > 1 ||
      Math.abs(top - highestSolidBlock(gx - 1, gz)) > 1 ||
      Math.abs(top - highestSolidBlock(gx, gz + 1)) > 1 ||
      Math.abs(top - highestSolidBlock(gx, gz - 1)) > 1) return null;
  if (getBlock(gx, top + 1, gz) || getBlock(gx, top + 2, gz)) return null;
  return top + 0.5;
}
function spawnAnimals() {
  const types = ['cow', 'pig', 'sheep', 'chicken'];
  // La carte 128 x 128 est divisée en 16 secteurs de 32 x 32 blocs.
  // On mélange les secteurs et on place au plus un animal dans chacun.
  const sectors = [];
  for (let sx = 0; sx < 4; sx++) {
    for (let sz = 0; sz < 4; sz++) sectors.push({ sx, sz });
  }
  for (let i = sectors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sectors[i], sectors[j]] = [sectors[j], sectors[i]];
  }

  let sheepPlaced = false;
  for (const sector of sectors) {
    if (animals.length >= MAX_ANIMALS) break;
    const minX = WORLD_MIN + sector.sx * 32;
    const minZ = WORLD_MIN + sector.sz * 32;
    for (let attempt = 0; attempt < 180; attempt++) {
      const x = minX + 2 + Math.random() * 28;
      const z = minZ + 2 + Math.random() * 28;
      const ground = animalGroundAt(x, z);
      if (ground === null) continue;
      if (animals.some(animal => Math.hypot(animal.group.position.x - x, animal.group.position.z - z) < 12)) continue;

      const type = !sheepPlaced ? 'sheep' : types[Math.floor(Math.random() * types.length)];
      const group = makeAnimal(type);
      group.position.set(Math.round(x), ground, Math.round(z));
      group.rotation.y = Math.random() * Math.PI * 2;
      scene.add(group);
      animals.push({
        group, type, targetX: group.position.x, targetZ: group.position.z,
        timer: Math.random() * 3, phase: Math.random() * Math.PI * 2,
        callTimer: 9 + Math.random() * 17,
        speed: type === 'chicken' ? 1.05 : 0.72 + Math.random() * 0.22
      });
      if (type === 'sheep') sheepPlaced = true;
      break;
    }
  }

  // Garantit la présence d'un mouton même si le premier secteur valide a été rare.
  if (!sheepPlaced && animals.length) {
    const first = animals[0];
    const group = makeAnimal('sheep');
    group.position.copy(first.group.position);
    group.rotation.y = first.group.rotation.y;
    scene.remove(first.group);
    scene.add(group);
    first.group = group;
    first.type = 'sheep';
    first.targetX = group.position.x;
    first.targetZ = group.position.z;
  }
}
function updateAnimals(dt) {
  for (const animal of animals) {
    const group = animal.group;
    animal.callTimer -= dt;
    if (animal.callTimer <= 0) {
      const distanceToPlayer = Math.hypot(group.position.x - camera.position.x, group.position.z - camera.position.z);
      if (distanceToPlayer < 24) playAnimalCall(animal.type, distanceToPlayer);
      animal.callTimer = 10 + Math.random() * 19;
    }
    animal.timer -= dt;
    if (animal.timer <= 0 || Math.hypot(animal.targetX - group.position.x, animal.targetZ - group.position.z) < 0.35) {
      let found = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 2 + Math.random() * 4;
        const tx = group.position.x + Math.cos(angle) * distance;
        const tz = group.position.z + Math.sin(angle) * distance;
        if (animalGroundAt(tx, tz) === null) continue;
        animal.targetX = Math.round(tx);
        animal.targetZ = Math.round(tz);
        found = true;
        break;
      }
      animal.timer = found ? 2.5 + Math.random() * 4 : 1.2;
    }
    const dx = animal.targetX - group.position.x;
    const dz = animal.targetZ - group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.08) {
      const step = Math.min(distance, animal.speed * dt);
      const nx = group.position.x + dx / distance * step;
      const nz = group.position.z + dz / distance * step;
      const ground = animalGroundAt(nx, nz);
      if (ground !== null) {
        group.position.x = nx;
        group.position.z = nz;
        group.position.y = THREE.MathUtils.lerp(group.position.y, ground, Math.min(1, dt * 8));
        const wantedRotation = Math.atan2(dx, dz);
        let angleDiff = wantedRotation - group.rotation.y;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        group.rotation.y += angleDiff * Math.min(1, dt * 5);
        animal.phase += dt * 9;
        group.userData.legs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(animal.phase + (index % 2) * Math.PI) * 0.48;
        });
      } else {
        animal.timer = 0;
      }
    } else {
      group.userData.legs.forEach(leg => { leg.rotation.x *= 0.75; });
    }
  }
}


// Génération du terrain 128 x 128 et de ses couches souterraines.
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
for (let tx = -59; tx <= 59; tx += 6) {
  for (let tz = -59; tz <= 59; tz += 7) {
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
spawnAnimals();
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
  if (selected !== type) playSound('select');
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
  if (/^(Digit|Numpad)[1-9]$/.test(event.code)) selectBlock(blockNames[Number(event.code.slice(-1)) - 1]);
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
  // Les ressources minières récoltées ne sont pas des blocs à replacer.
  if (oreDrops[selected]) return;
  const target = targetBlock();
  if (!target) return;
  const [x, y, z] = target.position;
  const normal = targetBlockNormal();
  if (!normal) return;
  const nx = x + Math.round(normal.x), ny = y + Math.round(normal.y), nz = z + Math.round(normal.z);
  const playerBlock = new THREE.Vector3(nx, ny, nz);
  if (camera.position.distanceTo(playerBlock) < 1.35) return;
  if (addBlock(nx, ny, nz, selected)) playSound('place', selected);
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
  jumpPlayer();
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
let stepTimer = 0;
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

  if (keys.Space && onGround) jumpPlayer();
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
  if (onGround && (Math.abs(forward) + Math.abs(side)) > 0.2) {
    stepTimer += dt;
    if (stepTimer >= 0.38) { playSound('step'); stepTimer = 0; }
  } else {
    stepTimer = 0;
  }

  updateAnimals(dt);
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