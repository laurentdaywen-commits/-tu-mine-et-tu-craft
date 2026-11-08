import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8f0);
scene.fog = new THREE.Fog(0x87c8f0, 24, 62);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 120);
camera.position.set(0, 7, 12);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#game').prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdaf1ff, 0x71834b, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
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
const blocks = [];
const blockMap = new Map();
const keyOf = (x,y,z) => x + ',' + y + ',' + z;
function addBlock(x,y,z,type) {
  const mesh = new THREE.Mesh(cubeGeo, materials[type] || materials.grass);
  mesh.position.set(x,y,z);
  mesh.castShadow = type !== 'leaves';
  mesh.receiveShadow = true;
  mesh.userData = { x,y,z,type };
  scene.add(mesh);
  blocks.push(mesh);
  blockMap.set(keyOf(x,y,z), mesh);
  return mesh;
}
function removeBlock(mesh) {
  if (!mesh || mesh.userData.y <= 0) return;
  scene.remove(mesh);
  blockMap.delete(keyOf(mesh.userData.x, mesh.userData.y, mesh.userData.z));
  const i = blocks.indexOf(mesh);
  if (i >= 0) blocks.splice(i,1);
}
function heightAt(x,z) {
  return Math.floor(2 + Math.sin(x * 0.23) * 1.2 + Math.cos(z * 0.19) * 1.1 + Math.sin((x+z) * 0.13) * 0.7);
}
for (let x=-16; x<16; x++) {
  for (let z=-16; z<16; z++) {
    const h = heightAt(x,z);
    for (let y=0; y<=h; y++) addBlock(x,y,z, y===h ? 'grass' : y>=h-2 ? 'dirt' : 'stone');
  }
}
// Small voxel trees scattered around the clearing.
for (const [tx,tz] of [[-9,-7],[-5,8],[8,-8],[11,6],[-12,3],[3,12]]) {
  const base = heightAt(tx,tz);
  for (let y=1; y<=3; y++) addBlock(tx,base+y,tz,'wood');
  for (let x=-2; x<=2; x++) for (let z=-2; z<=2; z++) for (let y=3; y<=5; y++) {
    if (Math.abs(x)+Math.abs(z)+(y===5?1:0) < 5 && !blockMap.has(keyOf(tx+x,base+y,tz+z))) addBlock(tx+x,base+y,tz+z,'leaves');
  }
}
const groundY = heightAt(0,10) + 2.7;
camera.position.set(0, groundY, 10);
const raycaster = new THREE.Raycaster();
raycaster.far = 7;
let selected = 'grass';
let isMobile = matchMedia('(pointer: coarse)').matches;
const keys = {};
let verticalVelocity = 0;
let onGround = false;
let joystick = {x:0,y:0};
let touchLook = null;

function selectBlock(type) {
  selected = type;
  document.querySelectorAll('.slot').forEach(b => b.classList.toggle('selected', b.dataset.block === type));
}
document.querySelectorAll('.slot').forEach(b => {
  b.addEventListener('click', () => selectBlock(b.dataset.block));
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (/Digit[1-5]/.test(e.code)) selectBlock(blockNames[Number(e.code.slice(-1))-1]);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE') placeBlock();
});
addEventListener('keyup', e => keys[e.code] = false);
renderer.domElement.addEventListener('click', () => {
  if (!isMobile && !controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => document.querySelector('#hint').textContent = 'WASD : bouger · Souris : regarder · Clic gauche : miner · Clic droit : placer');
controls.addEventListener('unlock', () => document.querySelector('#hint').textContent = 'Clique dans le monde pour jouer · WASD pour bouger · Espace pour sauter');

function targetBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects(blocks, false);
  return hits[0] || null;
}
function mineBlock() {
  const hit = targetBlock();
  if (hit) removeBlock(hit.object);
}
function placeBlock() {
  const hit = targetBlock();
  if (!hit) return;
  const p = hit.object.position.clone().add(hit.face.normal);
  const x=Math.round(p.x), y=Math.round(p.y), z=Math.round(p.z);
  if (camera.position.distanceTo(new THREE.Vector3(x,y,z)) < 1.4) return;
  if (!blockMap.has(keyOf(x,y,z))) addBlock(x,y,z,selected);
}
renderer.domElement.addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (e.button === 0) mineBlock();
  if (e.button === 2) placeBlock();
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
document.querySelector('#break').addEventListener('pointerdown', e => { e.preventDefault(); mineBlock(); });
document.querySelector('#place').addEventListener('pointerdown', e => { e.preventDefault(); placeBlock(); });
document.querySelector('#jump').addEventListener('pointerdown', e => { e.preventDefault(); if (onGround) verticalVelocity=7; });

const joy = document.querySelector('#joystick');
const stick = document.querySelector('#stick');
joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); moveJoy(e); });
joy.addEventListener('pointermove', e => { if (joy.hasPointerCapture(e.pointerId)) moveJoy(e); });
function moveJoy(e) {
  const r=joy.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
  const len=Math.min(42,Math.hypot(dx,dy)), a=Math.atan2(dy,dx);
  joystick.x=Math.cos(a)*len/42; joystick.y=Math.sin(a)*len/42;
  stick.style.transform='translate('+joystick.x*42+'px,'+joystick.y*42+'px)';
}
function resetJoy() { joystick={x:0,y:0}; stick.style.transform='translate(0,0)'; }
joy.addEventListener('pointerup',resetJoy); joy.addEventListener('pointercancel',resetJoy);
const lookZone=document.querySelector('#look-zone');
lookZone.addEventListener('pointerdown',e=>{ touchLook={x:e.clientX,y:e.clientY,id:e.pointerId}; lookZone.setPointerCapture(e.pointerId); });
lookZone.addEventListener('pointermove',e=>{
  if(!touchLook || touchLook.id!==e.pointerId) return;
  const dx=e.clientX-touchLook.x, dy=e.clientY-touchLook.y;
  camera.rotation.order='YXZ';
  camera.rotation.y-=dx*0.004;
  camera.rotation.x-=dy*0.004;
  camera.rotation.x=Math.max(-1.45,Math.min(1.45,camera.rotation.x));
  touchLook={x:e.clientX,y:e.clientY,id:e.pointerId};
});
lookZone.addEventListener('pointerup',()=>touchLook=null);
lookZone.addEventListener('pointercancel',()=>touchLook=null);

const clock=new THREE.Clock();
function update(dt) {
  const forward = Number(keys.KeyW || keys.ArrowUp) - Number(keys.KeyS || keys.ArrowDown) - joystick.y;
  const side = Number(keys.KeyD || keys.ArrowRight) - Number(keys.KeyA || keys.ArrowLeft) + joystick.x;
  const speed=5.5;
  const direction=new THREE.Vector3();
  camera.getWorldDirection(direction); direction.y=0; direction.normalize();
  const right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).negate();
  camera.position.addScaledVector(direction,forward*speed*dt);
  camera.position.addScaledVector(right,side*speed*dt);
  camera.position.x=Math.max(-15.2,Math.min(15.2,camera.position.x));
  camera.position.z=Math.max(-15.2,Math.min(15.2,camera.position.z));
  if (keys.Space && onGround) verticalVelocity=7;
  verticalVelocity-=19*dt;
  camera.position.y+=verticalVelocity*dt;
  const floor=heightAt(Math.round(camera.position.x),Math.round(camera.position.z))+1.65;
  if(camera.position.y<floor){camera.position.y=floor;verticalVelocity=0;onGround=true;} else onGround=false;
}
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  update(dt);
  renderer.render(scene,camera);
}
animate();
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
});
document.querySelector('#loading').classList.add('done');
document.querySelector('#hint').textContent=isMobile ? 'Joystick : bouger · Glisse à droite : regarder · ⛏ miner · ＋ placer' : 'Clique dans le monde pour jouer · WASD pour bouger · Espace pour sauter';
