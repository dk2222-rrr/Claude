// 3D 場景：兩層樓倉鼠窩（沒有鐵絲，看得清楚）。倉鼠動作來自 sim.js，這裡只負責畫出來。
//   一樓：滾輪、沙浴盆、飼料碗、水瓶、木頭隧道
//   二樓：木平台＋小木屋＋棉花窩（木梯斜坡上下樓）
import * as THREE from 'three';
import { Hamster } from './hamster.js';
import { makeLayout } from './layout.js';

// 目前的籠子配置（商店買了東西就換）
let LAY, W, WHEEL, SAND, BOWL, DRINK, PLAT, RAMP, HOUSE, NEST, LOG, OB1, OB2, BOUNDS;
const levelY = (lvl) => (lvl === 2 && PLAT ? PLAT.y : 0);
import { HIDDEN_PLACES } from './sim.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------- 程式產生的貼圖 ---------------- */
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
function woodTex(base = '#c9925a', dark = 'rgba(110,60,25,', repeat = [1, 1]) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.strokeStyle = dark + (0.05 + Math.random() * 0.18) + ')';
      g.lineWidth = 0.5 + Math.random() * 2.5;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = dark + '0.25)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 8, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, repeat);
}
function speckleTex(base, dots, n = 4000, repeat = [1, 1]) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      g.fillStyle = dots[Math.floor(Math.random() * dots.length)];
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, repeat);
}
function shadowBlobTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(80,55,30,0.35)');
  grd.addColorStop(1, 'rgba(80,55,30,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
function mesh(geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/* ---------------- 風格 ---------------- */
const BEDDING = {
  paper: { side: ['#efe4cf', ['#e3d3b4', '#f8f1e4', '#d9c7a4', '#fffaf0']], floor: (c) => c.setHSL(0.1, 0.4 + Math.random() * 0.15, 0.86 + Math.random() * 0.07), bit: (c) => c.setHSL(0.09 + Math.random() * 0.03, 0.3 + Math.random() * 0.3, 0.82 + Math.random() * 0.12) },
  pink: { side: ['#f8d3dc', ['#f1b8c6', '#fde6ec', '#eaa3b5']], floor: (c) => c.setHSL(0.96, 0.6, 0.86 + Math.random() * 0.06), bit: (c) => c.setHSL(0.95 + Math.random() * 0.04, 0.55 + Math.random() * 0.3, 0.8 + Math.random() * 0.12) },
  lavender: { side: ['#e2d6f2', ['#cdb9ea', '#f1eafb', '#bca3e0']], floor: (c) => c.setHSL(0.74, 0.45, 0.86 + Math.random() * 0.06), bit: (c) => c.setHSL(0.72 + Math.random() * 0.05, 0.4 + Math.random() * 0.3, 0.78 + Math.random() * 0.14) },
  rainbow: { side: ['#fbf3e4', ['#ffb3c1', '#ffe08a', '#a8e6b8', '#9fd0ff', '#d3b3ff']], floor: (c) => c.setHSL(0.12, 0.25, 0.92 + Math.random() * 0.05), bit: (c) => c.setHSL(Math.random(), 0.75, 0.7) },
  galaxy: { side: ['#1d2147', ['#2c3170', '#141733', '#f4e9a8', '#3b2f78']], glow: 0x0b0d2a, floor: (c) => c.setHSL(0.66, 0.5, 0.16 + Math.random() * 0.06), bit: (c) => (Math.random() < 0.18 ? c.setHSL(0.13 + Math.random() * 0.5, 0.8, 0.85) : c.setHSL(0.68 + Math.random() * 0.06, 0.55, 0.22 + Math.random() * 0.1)) },
};
const CAGE_COLORS = {
  white: { bar: 0xf4f4f4, metal: 0.35, accent: 0xffb3c4 },
  pink: { bar: 0xffb0c4, metal: 0.25, accent: 0xff8fb0 },
  mint: { bar: 0x96dcc6, metal: 0.25, accent: 0x7fd1b9 },
  gold: { bar: 0xf2c14e, metal: 0.95, rough: 0.18, accent: 0xe0a83a },
  rainbow: { bar: 'rainbow', metal: 0.3, accent: 0xc9a0ff },
};
const WHEEL_STYLES = {
  mint: { disc: 0x9ad7c6, tread: ['#b3e4d6', '#8fcab9'], hole: 0x6fb3a2 },
  pink: { disc: 0xffbccd, tread: ['#ffd6e0', '#f7a8bd'], hole: 0xf08fa8 },
  crystal: { disc: 0xdff3ff, tread: ['#eaf7ff', '#c4e6ff'], hole: 0xb4dcff, glass: true },
  led: { disc: 0x2a2444, tread: ['#3a3360', '#2a2444'], hole: 0x1b1730, led: true },
};
const ROOMS = {
  cream: { wall: (g, w, h) => { g.fillStyle = '#f4e6da'; g.fillRect(0, 0, w, h); }, desk: ['#d8b48a', 'rgba(120,75,35,'] },
  forest: {
    wall: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#cfe8c4'); gr.addColorStop(1, '#a9d39a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `hsla(${100 + Math.random() * 40},45%,${35 + Math.random() * 20}%,0.55)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 18, 7, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    },
    desk: ['#a77a4f', 'rgba(70,40,15,'],
  },
  night: {
    wall: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#141a3e'); gr.addColorStop(1, '#2d2f63'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,${230 + Math.random() * 25},${180 + Math.random() * 70},${0.4 + Math.random() * 0.6})`; const r = Math.random() * 1.8 + 0.3; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 6.3); g.fill(); }
      g.fillStyle = '#fff4c2'; g.beginPath(); g.arc(w * 0.78, h * 0.22, 34, 0, 6.3); g.fill(); g.fillStyle = '#141a3e'; g.beginPath(); g.arc(w * 0.78 + 14, h * 0.22 - 8, 30, 0, 6.3); g.fill();
    },
    desk: ['#5c4a3c', 'rgba(20,10,5,'],
  },
  candy: {
    wall: (g, w, h) => {
      for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#ffd6e6' : '#fff1f6'; g.fillRect(x, 0, 32, h); }
      const cs = ['#ff9ec4', '#8fd3ff', '#ffe27a', '#b9f2a1', '#d7a8ff'];
      for (let i = 0; i < 70; i++) { g.fillStyle = cs[i % cs.length]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 5 + Math.random() * 6, 0, 6.3); g.fill(); }
    },
    desk: ['#f6c9d7', 'rgba(200,90,130,'],
  },
};
const NEST_STYLES = {
  cotton: { puff: 0xffffff, pad: 0xfff6ef, hay: true },
  cloud: { puff: 0xdcefff, puff2: 0xffffff, pad: 0xeaf5ff, hay: false },
  strawberry: { puff: 0xfff2f4, pad: 0xffe9ee, hay: false, berry: true },
};

/* ---------------- 窗外的天空（跟著台灣時間） ---------------- */
const SKY_KEYS = [
  [0, '#0a0f2c', '#1c2452'], [4.5, '#0f1640', '#2a2f66'], [5.5, '#3b4a8f', '#ff9e7a'], [6.5, '#7cc3ff', '#ffd9a8'],
  [8, '#6ec1ff', '#cfeeff'], [16, '#6ec1ff', '#d6f1ff'], [17.5, '#6b8fd6', '#ffb07a'], [18.5, '#2e2f6e', '#c46a7a'],
  [19.5, '#141a46', '#2b2f66'], [24, '#0a0f2c', '#1c2452'],
];
const WINDOW_STYLE = {
  cream: { frame: 0xffffff, curtain: 0xffb7c8 },
  forest: { frame: 0xa77a4f, curtain: 0x9fd18f },
  night: { frame: 0xe8e6ff, curtain: 0x5b5fa8 },
  candy: { frame: 0xff9ec4, curtain: 0xffe27a },
};
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function skyColors(h) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && h >= SKY_KEYS[i + 1][0]) i++;
  const [h0, t0, b0] = SKY_KEYS[i];
  const [h1, t1, b1] = SKY_KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  return ['#' + _ca.set(t0).lerp(_cb.set(t1), k).getHexString(), '#' + _ca.set(b0).lerp(_cb.set(b1), k).getHexString()];
}
// 月相：0 新月、0.5 滿月（以 2000-01-06 18:14 UTC 的新月為基準，週期 29.53 天）
const moonPhase = (t) => (((t - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588) % 1 + 1) % 1;

/* ---------------- 食物模型 ---------------- */
const SEED_TEX = canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = '#2b2522';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9e2d6';
  for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 3, h);
});
function makeFood(kind) {
  const g = new THREE.Group();
  if (kind === 'seed') {
    const s = mesh(new THREE.SphereGeometry(1, 16, 10), std(0xffffff, { map: SEED_TEX, roughness: 0.4 }));
    s.scale.set(0.024, 0.014, 0.045);
    s.position.y = 0.014;
    g.add(s);
  } else if (kind === 'fish') {
    const body = mesh(new THREE.SphereGeometry(1, 18, 12), std(0xc9b48f, { roughness: 0.45, metalness: 0.25 }));
    body.scale.set(0.022, 0.02, 0.075);
    body.position.y = 0.02;
    g.add(body);
    const back = mesh(new THREE.SphereGeometry(1, 14, 10), std(0x8e8a8f, { roughness: 0.4, metalness: 0.35 }));
    back.scale.set(0.016, 0.012, 0.065);
    back.position.set(0, 0.032, 0);
    g.add(back);
    const tail = mesh(new THREE.ConeGeometry(0.03, 0.05, 4), std(0xb7a07c, { roughness: 0.5 }));
    tail.rotation.x = Math.PI / 2;
    tail.scale.set(1, 0.3, 1);
    tail.position.set(0, 0.02, -0.09);
    g.add(tail);
    [-1, 1].forEach((sd) => g.add(mesh(new THREE.SphereGeometry(0.006, 8, 6), std(0x111111), sd * 0.018, 0.028, 0.055, { cast: false })));
  } else {
    const cols = [0xb07a45, 0xc98d52, 0x8fae5a, 0xd9a55f, 0x9b6a3c];
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39;
      const r = 0.012 + (i % 4) * 0.014;
      const p = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 8), std(cols[i % cols.length], { roughness: 0.9 }), Math.cos(a) * r, 0.01 + (i % 3) * 0.008, Math.sin(a) * r);
      p.rotation.set(rand(0, 3), rand(0, 3), 0);
      g.add(p);
    }
  }
  return g;
}

export class World {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.sim = sim;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    this.cam = { yaw: 0, pitch: 0.6, dist: null, target: new THREE.Vector3(0, 0.72, 0) };

    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xfffaf2, 0xd9c2a5, 1.25);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2));
    sun.position.set(2.2, 5.5, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3.2, bottom: -3, near: 1, far: 14 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    s.add(sun);
    this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
    this.fill.position.set(-3, 2.5, 2);
    s.add(this.fill);
    this.lamp = new THREE.PointLight(0xffc37a, 0, 6, 1.6); // 晚上的小夜燈
    this.lamp.position.set(1.4, 2.2, 1.2);
    s.add(this.lamp);
    this.nightK = 0;
    this.night = false;

    this.buildRoom();
    this.buildParticles();
    this.cage = null;

    this.blobMat = new THREE.MeshBasicMaterial({ map: shadowBlobTex(), transparent: true, depthWrite: false });
    this.rigs = {}; // hid → { ham, contact }
    this.infos = {}; // hid → { name, color }
    this.foodMeshes = {};
    this.poopMeshes = {};
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.085, 32), new THREE.MeshBasicMaterial({ color: 0x5fcf8e, transparent: true, opacity: 0.85, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    s.add(this.marker);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this.wheelVel = 0;

    this.resize();
    this.setLayout(makeLayout());
    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  /* ================= 場景 ================= */
  // 換籠子／買新玩具：整個籠子重新蓋一次（倉鼠、食物、大便不動）
  setLayout(L, styles = {}) {
    const sk = JSON.stringify(styles);
    if (LAY && LAY.key === L.key && this.styleKey === sk) return false;
    const cageChanged = !LAY || LAY.cage !== L.cage || LAY.annexes.length !== L.annexes.length;
    this.styleKey = sk;
    this.styles = { bedding: 'paper', cageColor: 'white', room: 'cream', wheel: 'mint', house: 'wood', nest: 'cotton', ...styles };
    LAY = L;
    ({ W, WHEEL, SAND, BOWL, DRINK, PLAT, RAMP, HOUSE, NEST, LOG, OB1, OB2, BOUNDS } = L);
    if (this.cage) {
      this.scene.remove(this.cage);
      this.cage.traverse((o) => { o.geometry?.dispose?.(); });
    }
    this.cage = new THREE.Group();
    this.scene.add(this.cage);
    // 牆壁就在籠子後面，從預設視角才看得到窗戶
    this.wall.position.z = -W.z - 0.55;
    if (this.desk) this.desk.position.y = W.baseBottom - 0.02;
    this.rotor = null;
    this.walls = [];
    this.ledMats = [];
    this.swing = null;
    this.ball = null;
    this.applyRoom();
    this.buildBase();
    this.buildBars();
    this.buildBowl();
    this.buildBottle();
    this.buildNest();
    if (WHEEL) this.buildWheel();
    if (SAND) this.buildSandBath();
    if (LOG) this.buildLog();
    if (PLAT) this.buildPlatform();
    if (HOUSE) this.buildHouse();
    for (const ax of L.annexes) {
      this.buildBase(ax.cx, ax.cz, ax.W);
      this.buildBars(ax.cx, ax.cz, ax.W, ax.top);
    }
    for (const lk of L.links) if (lk.type === 'tube') this.buildTube(lk);
    for (const t of L.toys) this.buildToy(t);
    if (cageChanged) this.resetView();
    this.placeWindow();
    return true;
  }

  buildRoom() {
    const s = this.scene;
    const desk = mesh(new THREE.PlaneGeometry(14, 10), std(0xffffff, { map: woodTex('#d8b48a', 'rgba(120,75,35,', [3, 3]), roughness: 0.6 }), 0, -0.32, 0, { cast: false });
    desk.rotation.x = -Math.PI / 2;
    this.desk = desk;
    s.add(desk);
    this.wall = mesh(new THREE.PlaneGeometry(30, 9), std(0xffffff, { roughness: 1 }), 0, 4.0, -2.6, { cast: false });
    s.add(this.wall);
    this.decor = new THREE.Group();
    s.add(this.decor);
    // 窗戶
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 512;
    this.skyCanvas.height = 320;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyStars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: 0.6 + Math.random() * 1.4, ph: Math.random() * 6 }));
    this.skyClouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 0.3 + Math.random() * 0.2, y: 0.15 + Math.random() * 0.3, s: 0.7 + Math.random() * 0.6, v: 0.004 + Math.random() * 0.006 }));
    this.win = new THREE.Group();
    s.add(this.win);
    this.lastSky = 0;
  }

  // 背景牆上的窗戶：放在預設視角時看得到的位置（籠子上方）
  placeWindow() {
    this.scene.remove(this.win);
    this.win = new THREE.Group();
    this.scene.add(this.win);
    // 先用預設視角算出牆上「畫面上方、HUD 下面」那一塊（算完再把使用者的視角換回來）
    const saved = { ...this.cam, target: this.cam.target.clone() };
    this.resetView();
    this.updateCamera();
    this.camera.updateMatrixWorld();
    const wallZ = this.wall.position.z + 0.02;
    const hit = (nx, ny) => {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const r = this.raycaster.ray;
      const t = (wallZ - r.origin.z) / r.direction.z;
      return r.origin.clone().addScaledVector(r.direction, t);
    };
    // 上緣：資訊卡下面一點；下緣：籠子底盤上面（前面有鐵絲沒關係，像隔著籠子看窗外）
    const top = hit(0, 0.36);
    const botY = W.baseTop + 0.1;
    let h = Math.max(0.5, top.y - botY);
    let w = h * 1.5;
    const maxW = Math.abs(hit(0.85, 0.3).x - hit(-0.85, 0.3).x) * 0.66;
    if (w > maxW) { w = maxW; h = w / 1.5; }
    let cy = top.y - h / 2;
    const cx = this.cam.target.x;
    Object.assign(this.cam, saved);
    const ws = WINDOW_STYLE[this.styles?.room] || WINDOW_STYLE.cream;
    const g = this.win;
    g.position.set(cx, cy, wallZ);
    // 天空
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.skyTex, toneMapped: false }));
    g.add(sky);
    // 窗框＋十字窗格
    const fm = std(ws.frame, { roughness: 0.5 });
    const ft = Math.max(0.05, w * 0.035);
    g.add(mesh(new THREE.BoxGeometry(w + ft * 2, ft, 0.06), fm, 0, h / 2 + ft / 2, 0.03, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(w + ft * 2, ft, 0.06), fm, 0, -h / 2 - ft / 2, 0.03, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(ft, h, 0.06), fm, -w / 2 - ft / 2, 0, 0.03, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(ft, h, 0.06), fm, w / 2 + ft / 2, 0, 0.03, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(ft * 0.6, h, 0.04), fm, 0, 0, 0.02, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(w, ft * 0.6, 0.04), fm, 0, 0, 0.02, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(w + ft * 4, ft * 0.8, 0.18), fm, 0, -h / 2 - ft * 1.2, 0.09, { cast: false }));
    // 玻璃反光
    g.add(mesh(new THREE.PlaneGeometry(w * 0.12, h * 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }), -w * 0.28, 0, 0.012, { cast: false }));
    // 兩邊的窗簾（有皺褶）
    const cm = std(ws.curtain, { roughness: 0.9, side: THREE.DoubleSide });
    [-1, 1].forEach((sd) => {
      const cg = new THREE.PlaneGeometry(w * 0.22, h * 1.12, 16, 1);
      const pp = cg.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 60) * 0.025);
      cg.computeVertexNormals();
      g.add(mesh(cg, cm, sd * (w / 2 + ft - w * 0.07), -h * 0.02, 0.08, { cast: false }));
    });
    const rod = mesh(new THREE.CylinderGeometry(0.015, 0.015, w + ft * 6, 8), std(0xd9b38c), 0, h / 2 + ft * 1.6, 0.1, { cast: false });
    rod.rotation.z = Math.PI / 2;
    g.add(rod);
    this.drawSky(Date.now());
  }

  // 依照台灣時間畫窗外：天空顏色、太陽或月亮、星星、雲、小山丘
  drawSky(now) {
    const c = this.skyCanvas;
    const g = c.getContext('2d');
    const W2 = c.width;
    const H2 = c.height;
    const tw = ((now / 3600e3 + 8) % 24 + 24) % 24;
    const [top, bot] = skyColors(tw);
    const gr = g.createLinearGradient(0, 0, 0, H2);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bot);
    g.fillStyle = gr;
    g.fillRect(0, 0, W2, H2);
    const day = Math.min(1, Math.max(0, Math.min(tw - 5.2, 19 - tw) / 1.5));
    const night = 1 - day;
    // 星星
    for (const st of this.skyStars) {
      const a = night * (0.55 + 0.45 * Math.sin(now / 700 + st.ph));
      if (a < 0.03) continue;
      g.fillStyle = `rgba(255,250,220,${a})`;
      g.beginPath();
      g.arc(st.x * W2, st.y * H2, st.r, 0, 6.3);
      g.fill();
    }
    const arc = (u) => ({ x: (0.08 + u * 0.84) * W2, y: H2 * (0.82 - Math.sin(u * Math.PI) * 0.62) });
    // 太陽（05:50～18:20）
    if (tw > 5.6 && tw < 18.6) {
      const u = (tw - 5.8) / 12.5;
      const p = arc(Math.min(1, Math.max(0, u)));
      const low = 1 - Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
      const glow = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
      glow.addColorStop(0, `rgba(255,${230 - low * 60},${150 - low * 80},0.9)`);
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = glow;
      g.fillRect(p.x - 70, p.y - 70, 140, 140);
      g.fillStyle = `rgb(255,${236 - low * 70},${120 - low * 60})`;
      g.beginPath();
      g.arc(p.x, p.y, 22, 0, 6.3);
      g.fill();
    }
    // 月亮（18:10～06:00，月相照真實日期）
    if (tw > 18.1 || tw < 6.1) {
      const u = ((tw - 18.2 + 24) % 24) / 11.8;
      const p = arc(Math.min(1, Math.max(0, u)));
      const R = 18;
      const glow = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, 55);
      glow.addColorStop(0, 'rgba(255,250,215,0.45)');
      glow.addColorStop(1, 'rgba(255,250,215,0)');
      g.fillStyle = glow;
      g.fillRect(p.x - 55, p.y - 55, 110, 110);
      g.save();
      g.beginPath();
      g.arc(p.x, p.y, R, 0, 6.3);
      g.clip();
      g.fillStyle = '#fff6cf';
      g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      // 暗面：用一個偏移的圓遮住
      const ph = moonPhase(now);
      const off = (ph < 0.5 ? -1 : 1) * Math.cos(ph * 2 * Math.PI) * R * 2;
      g.fillStyle = top;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.arc(p.x + off, p.y, R * 1.02, 0, 6.3);
      if (Math.abs(ph - 0.5) > 0.03) g.fill();
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(200,190,150,0.35)';
      [[-6, -4, 4], [5, 3, 3], [-2, 8, 2.5]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(p.x + dx, p.y + dy, r, 0, 6.3); g.fill(); });
      g.restore();
    }
    // 雲（白天才有，慢慢飄）
    if (day > 0.05) {
      for (const cl of this.skyClouds) {
        const x = (((cl.x + (now / 1000) * cl.v * 0.05) % 1.3) - 0.15) * W2;
        const y = cl.y * H2;
        g.fillStyle = `rgba(255,255,255,${0.85 * day})`;
        [[0, 0, 26], [24, -8, 22], [46, 2, 20], [-20, 4, 18]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(x + dx * cl.s, y + dy * cl.s, r * cl.s, 0, 6.3); g.fill(); });
      }
    }
    // 遠方的小山丘
    const hill = (yb, amp, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, H2);
      for (let x = 0; x <= W2; x += 16) g.lineTo(x, yb - Math.sin(x * 0.012 + yb) * amp - Math.sin(x * 0.031) * amp * 0.4);
      g.lineTo(W2, H2);
      g.fill();
    };
    const hillCol = (a, b) => '#' + _ca.set(a).lerp(_cb.set(b), night).getHexString();
    hill(H2 * 0.86, 14, hillCol('#8fcf8a', '#1f2650'));
    hill(H2 * 0.94, 10, hillCol('#6fb873', '#151a3a'));
    this.skyTex.needsUpdate = true;
  }

  // 房間風格：牆壁、桌面、小裝飾
  applyRoom() {
    const st = this.styles.room;
    if (this.roomStyle === st && this.roomExt === LAY.ext.x1) return;
    this.roomStyle = st;
    this.roomExt = LAY.ext.x1;
    const R = ROOMS[st] || ROOMS.cream;
    this.wall.material.map?.dispose();
    this.wall.material.map = canvasTex(512, 256, R.wall);
    this.wall.material.needsUpdate = true;
    this.desk.material.map?.dispose();
    this.desk.material.map = woodTex(R.desk[0], R.desk[1], [3, 3]);
    this.desk.material.needsUpdate = true;
    this.scene.remove(this.decor);
    this.decor = new THREE.Group();
    this.balloons = [];
    if (st === 'candy') {
      [[-2.4, 2.2, 0xff8fb8], [-1.6, 2.8, 0x8fd3ff], [2.6, 2.4, 0xffe27a], [3.3, 3.0, 0xb9f2a1], [0.4, 3.3, 0xd7a8ff]].forEach(([x, y, c], i) => {
        const b = new THREE.Group();
        b.add(mesh(new THREE.SphereGeometry(0.26, 20, 16), std(c, { roughness: 0.25 }), 0, 0, 0, { cast: false }));
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.1, 4), std(0xffffff));
        str.position.y = -0.8;
        b.add(str);
        b.position.set(x + LAY.ext.x1 * 0.2, y, this.wall.position.z + 0.4);
        b.userData = { y, ph: i * 1.3 };
        this.decor.add(b);
        this.balloons.push(b);
      });
    }
    if (st === 'forest') {
      [LAY.ext.x0 - 0.7, LAY.ext.x1 + 0.7].forEach((x) => {
        const pot = mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 20), std(0xc98a5e), x, W.baseBottom + 0.16, -0.4);
        this.decor.add(pot);
        [[0, 0.62, 0, 0.3], [0.14, 0.5, 0.08, 0.22], [-0.13, 0.52, -0.05, 0.22]].forEach(([dx, y, dz, r]) => this.decor.add(mesh(new THREE.SphereGeometry(r, 16, 12), std(0x6fbf73), x + dx, W.baseBottom + y, -0.4 + dz)));
      });
    }
    this.scene.add(this.decor);
  }

  // 底盤＋墊料（cx, cz：籠子中心；D：尺寸）
  buildBase(cx = 0, cz = 0, D = W) {
    const s = this.cage;
    const { x: X, z: Z, baseTop: T, baseBottom: B } = D;
    const cc = CAGE_COLORS[this.styles.cageColor] || CAGE_COLORS.white;
    const bed = BEDDING[this.styles.bedding] || BEDDING.paper;
    const plastic = std(0xfdf8f4, { roughness: 0.35 });
    const accent = std(cc.accent, { roughness: 0.4, metalness: cc.metal > 0.5 ? 0.6 : 0 });
    const h = T - B;
    const t = 0.05;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, t, Z * 2 + 2 * t), plastic, 0, B - t / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, h, t), plastic, 0, B + h / 2, -Z - t / 2));
    g.add(mesh(new THREE.BoxGeometry(t, h, Z * 2 + 2 * t), plastic, -X - t / 2, B + h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(t, h, Z * 2 + 2 * t), plastic, X + t / 2, B + h / 2, 0));
    const acrylic = new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false });
    g.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, h, 0.02), acrylic, 0, B + h / 2, Z + 0.01, { cast: false, receive: false }));
    g.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, 0.05, 0.07), accent, 0, T, -Z - t / 2));
    g.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, 0.03, 0.03), accent, 0, T, Z + 0.01));
    [-1, 1].forEach((sd) => g.add(mesh(new THREE.BoxGeometry(0.07, 0.05, Z * 2 + 0.1), accent, sd * (X + t / 2), T, 0)));

    // 墊料
    const beddingSide = std(0xffffff, { map: speckleTex(bed.side[0], bed.side[1], 6000, [4, 1]), roughness: 1 });
    g.add(mesh(new THREE.BoxGeometry(X * 2, -B - 0.01, Z * 2), beddingSide, 0, (B - 0.01) / 2, 0, { cast: false }));
    const top = new THREE.PlaneGeometry(X * 2, Z * 2, Math.round(X * 50), Math.round(Z * 50));
    top.rotateX(-Math.PI / 2);
    const p = top.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.abs(x) > X - 0.15 || Math.abs(z) > Z - 0.15 ? 0.025 : 0;
      p.setY(i, Math.sin(x * 5.1 + z * 2.3) * 0.012 + Math.sin(x * 11 - z * 9) * 0.006 + Math.random() * 0.012 + edge);
      bed.floor(c);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    top.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    top.computeVertexNormals();
    g.add(mesh(top, std(0xffffff, { vertexColors: true, roughness: 1 }), 0, 0, 0, { cast: false }));
    const n = Math.round(X * Z * 180);
    const bits = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.03, 0), std(0xffffff, { roughness: 1, emissive: bed.glow || 0x000000 }), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      const sc = rand(0.4, 1.2);
      m.compose(new THREE.Vector3(rand(-X + 0.04, X - 0.04), 0.012, rand(-Z + 0.04, Z - 0.04)), q, new THREE.Vector3(sc, sc * 0.6, sc));
      bits.setMatrixAt(i, m);
      bits.setColorAt(i, bed.bit(c));
    }
    bits.receiveShadow = true;
    g.add(bits);
    s.add(g);
  }

  // 鐵籠：只有後面和左右兩側；正對鏡頭的前面是開的。轉到側面看時，擋住視線的那面會變淡。
  buildBars(cx = 0, cz = 0, D = W, top = LAY.top) {
    const s = this.cage;
    const { x: X, z: Z, baseTop: T } = D;
    const cc = CAGE_COLORS[this.styles.cageColor] || CAGE_COLORS.white;
    const len = top - T;
    const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 5);
    const gap = 0.09;
    const wall = (pts, normal, railA, railB) => {
      const rainbow = cc.bar === 'rainbow';
      const mat = std(rainbow ? 0xffffff : cc.bar, { roughness: cc.rough ?? 0.25, metalness: cc.metal, transparent: true, opacity: 1 });
      const g = new THREE.Group();
      const im = new THREE.InstancedMesh(geo, mat, pts.length);
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      pts.forEach(([x, z], i) => {
        im.setMatrixAt(i, m.makeTranslation(cx + x, T + len / 2, cz + z));
        if (rainbow) im.setColorAt(i, col.setHSL((i / pts.length + (x + z) * 0.05) % 1, 0.75, 0.62));
      });
      im.castShadow = true;
      g.add(im);
      const rl = Math.hypot(railB[0] - railA[0], railB[1] - railA[1]);
      const railMat = rainbow ? std(0xffffff, { roughness: 0.3, metalness: 0.3, transparent: true, opacity: 1 }) : mat;
      [T + 0.04, top - 0.55, top].forEach((y) => {
        const r = mesh(new THREE.BoxGeometry(rl + 0.03, 0.025, 0.025), railMat, cx + (railA[0] + railB[0]) / 2, y, cz + (railA[1] + railB[1]) / 2);
        r.rotation.y = Math.atan2(railB[1] - railA[1], railB[0] - railA[0]) * -1;
        g.add(r);
      });
      s.add(g);
      this.walls.push({ mat, mats: [mat, railMat], normal: new THREE.Vector3(...normal), cx, cz });
    };
    const back = [];
    for (let x = -X; x <= X + 1e-3; x += gap) back.push([x, -Z - 0.02]);
    wall(back, [0, 0, -1], [-X - 0.02, -Z - 0.02], [X + 0.02, -Z - 0.02]);
    const left = [];
    const right = [];
    for (let z = -Z + gap; z <= Z + 1e-3; z += gap) { left.push([-X - 0.02, z]); right.push([X + 0.02, z]); }
    wall(left, [-1, 0, 0], [-X - 0.02, -Z - 0.02], [-X - 0.02, Z + 0.02]);
    wall(right, [1, 0, 0], [X + 0.02, -Z - 0.02], [X + 0.02, Z + 0.02]);
    const postMat = std(cc.bar === 'rainbow' ? 0xffffff : cc.bar, { roughness: 0.3, metalness: Math.max(0.4, cc.metal) });
    [[-X, -Z], [X, -Z]].forEach(([x, z]) => s.add(mesh(new THREE.BoxGeometry(0.035, len, 0.035), postMat, cx + x + Math.sign(x) * 0.02, T + len / 2, cz + z - 0.02)));
  }

  buildWheel() {
    const g = new THREE.Group();
    const wy = WHEEL.r + 0.12;
    g.position.set(WHEEL.x, wy, WHEEL.z);
    const { r, depth } = WHEEL;
    const rotor = new THREE.Group();
    g.add(rotor);
    const ws = WHEEL_STYLES[this.styles.wheel] || WHEEL_STYLES.mint;
    const glass = ws.glass ? { transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, depthWrite: false } : {};
    const plastic = std(ws.disc, { roughness: 0.35, ...glass });
    const treadTex = canvasTex(512, 32, (c, w, h) => {
      c.fillStyle = ws.tread[0];
      c.fillRect(0, 0, w, h);
      c.fillStyle = ws.tread[1];
      for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 5, h);
    });
    const tread = mesh(new THREE.CylinderGeometry(r, r, depth, 72, 1, true), std(0xffffff, { map: treadTex, roughness: 0.5, side: THREE.DoubleSide, ...glass }));
    tread.rotation.x = Math.PI / 2;
    rotor.add(tread);
    const back = mesh(new THREE.CircleGeometry(r, 72), plastic);
    back.position.z = -depth / 2;
    rotor.add(back);
    const holeMat = std(ws.hole, { roughness: 0.5, ...glass });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rotor.add(mesh(new THREE.CircleGeometry(0.075, 24), holeMat, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, -depth / 2 + 0.003, { cast: false }));
    }
    // LED 滾輪：外圈會發光變色
    const lipMat = ws.led ? new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff66cc, emissiveIntensity: 2.2, roughness: 0.3 }) : std(0xffffff, { roughness: 0.3 });
    if (ws.led) this.ledMats.push(lipMat);
    const lip = mesh(new THREE.TorusGeometry(r, ws.led ? 0.03 : 0.022, 10, 72), lipMat);
    lip.position.z = depth / 2;
    rotor.add(lip);
    const lipBack = mesh(lip.geometry, ws.led ? lipMat : lipMat, 0, 0, -depth / 2);
    rotor.add(lipBack);
    if (ws.led) {
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x66ccff, emissiveIntensity: 2, roughness: 0.3 });
      this.ledMats.push(ringMat);
      rotor.add(mesh(new THREE.TorusGeometry(r * 0.62, 0.014, 8, 60), ringMat, 0, 0, -depth / 2 + 0.006, { cast: false }));
    }
    const hub = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 20), std(0xffd27a, { roughness: 0.4 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -depth / 2 - 0.04;
    g.add(hub);
    const standMat = std(0xffd27a, { roughness: 0.45 });
    g.add(mesh(new THREE.BoxGeometry(0.1, wy + 0.02, 0.05), standMat, 0, -wy / 2, -depth / 2 - 0.08));
    g.add(mesh(new THREE.BoxGeometry(r * 1.25, 0.04, 0.32), standMat, 0, -wy + 0.02, -depth / 2 - 0.12));
    this.rotor = rotor;
    this.cage.add(g);
  }

  buildSandBath() {
    const g = new THREE.Group();
    g.position.set(SAND.x, 0, SAND.z);
    const R = SAND.r;
    const pts = [
      new THREE.Vector2(0.001, 0.02), new THREE.Vector2(R - 0.04, 0.02), new THREE.Vector2(R - 0.03, 0.13),
      new THREE.Vector2(R, 0.15), new THREE.Vector2(R + 0.02, 0.13), new THREE.Vector2(R + 0.01, 0.0), new THREE.Vector2(0.001, 0.0),
    ];
    g.add(mesh(new THREE.LatheGeometry(pts, 64), std(0xf8fbff, { roughness: 0.15, side: THREE.DoubleSide })));
    const rim = mesh(new THREE.TorusGeometry(R - 0.005, 0.014, 8, 64), std(0x7fb6e8, { roughness: 0.2 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.15;
    g.add(rim);
    const sandPts = [];
    for (let i = 12; i >= 0; i--) {
      const k = i / 12;
      sandPts.push(new THREE.Vector2(0.001 + k * (R - 0.035), 0.1 - k * k * 0.025));
    }
    const sandTex = speckleTex('#e9d3a7', ['#d6bb88', '#f4e3c0', '#c9a874', '#fff2d6'], 9000, [6, 2]);
    g.add(mesh(new THREE.LatheGeometry(sandPts, 64), std(0xffffff, { map: sandTex, roughness: 1, side: THREE.DoubleSide }), 0, 0, 0, { cast: false }));
    this.cage.add(g);
  }

  buildBowl() {
    const g = new THREE.Group();
    const R = BOWL.r;
    const pts = [
      new THREE.Vector2(0.001, 0.03), new THREE.Vector2(R - 0.04, 0.03), new THREE.Vector2(R - 0.02, 0.1),
      new THREE.Vector2(R, 0.11), new THREE.Vector2(R + 0.02, 0.09), new THREE.Vector2(R - 0.01, 0.0), new THREE.Vector2(0.001, 0.0),
    ];
    g.add(mesh(new THREE.LatheGeometry(pts, 48), std(0xffc9a8, { roughness: 0.2, side: THREE.DoubleSide })));
    g.position.set(BOWL.x, 0.005, BOWL.z);
    this.cage.add(g);
  }

  buildBottle() {
    // 沒有鐵絲了，水瓶掛在木頭架子上
    const g = new THREE.Group();
    const woodDark = std(0xffffff, { map: woodTex('#b9844e', 'rgba(90,50,20,'), roughness: 0.8 });
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), woodDark, 0.02, 0.015, 0));
    g.add(mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), woodDark, -0.08, 0.53, 0));
    const glass = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
    const b = new THREE.Group();
    b.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 24), glass, 0, 0, 0, { cast: false }));
    b.add(mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.38, 24), new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, -0.08, 0, { cast: false }));
    b.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 24), std(0x7fb6e8), 0, 0.29, 0));
    b.add(mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.08, 20), std(0x7fb6e8), 0, -0.31, 0));
    const spout = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3, 10), std(0xdadada, { metalness: 0.8, roughness: 0.25 }), 0.07, -0.44, 0);
    spout.rotation.z = 0.75;
    b.add(spout);
    const clip = mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 24), std(0xdadada, { metalness: 0.7, roughness: 0.3 }), 0, 0.1, 0);
    clip.rotation.x = Math.PI / 2;
    b.add(clip);
    b.position.set(0.04, 0.78, 0);
    g.add(b);
    g.position.set(-W.x + 0.17, 0, DRINK.z);
    this.cage.add(g);
  }

  buildPlatform() {
    const s = this.cage;
    const wood = std(0xffffff, { map: woodTex('#d6a46c', 'rgba(115,65,25,', [2, 1]), roughness: 0.75 });
    const woodDark = std(0xffffff, { map: woodTex('#b9844e', 'rgba(90,50,20,'), roughness: 0.8 });
    const { x0, x1, z0, z1, y } = PLAT;
    this.platform = mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), wood, (x0 + x1) / 2, y - 0.03, (z0 + z1) / 2);
    s.add(this.platform);
    s.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, y, 12), woodDark, x0 + 0.05, y / 2, z1 - 0.05));
    s.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, y, 12), woodDark, x0 + 0.05, y / 2, z0 + 0.05));
    const postGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8);
    const railEnd = RAMP.x - RAMP.w / 2 - 0.02;
    for (let x = x0 + 0.03; x < railEnd; x += 0.13) s.add(mesh(postGeo, woodDark, x, y + 0.08, z1 - 0.02));
    for (let z = z0 + 0.1; z < z1; z += 0.13) s.add(mesh(postGeo, woodDark, x0 + 0.02, y + 0.08, z));
    s.add(mesh(new THREE.BoxGeometry(railEnd - x0, 0.025, 0.03), woodDark, (x0 + railEnd) / 2, y + 0.16, z1 - 0.02));
    s.add(mesh(new THREE.BoxGeometry(0.03, 0.025, z1 - z0), woodDark, x0 + 0.02, y + 0.16, (z0 + z1) / 2));

    // 木梯斜坡
    const run = RAMP.zBot - RAMP.zTop;
    const len = Math.hypot(run, y);
    const ramp = new THREE.Group();
    ramp.position.set(RAMP.x, y / 2, (RAMP.zTop + RAMP.zBot) / 2);
    ramp.rotation.x = Math.atan2(y, run);
    ramp.add(mesh(new THREE.BoxGeometry(RAMP.w, 0.03, len), wood, 0, -0.015, 0));
    for (let k = -len / 2 + 0.06; k < len / 2; k += 0.11) ramp.add(mesh(new THREE.BoxGeometry(RAMP.w - 0.02, 0.02, 0.025), woodDark, 0, 0.01, k));
    [-1, 1].forEach((sd) => ramp.add(mesh(new THREE.BoxGeometry(0.025, 0.05, len), woodDark, sd * (RAMP.w / 2 - 0.0125), 0.02, 0)));
    s.add(ramp);
  }

  buildHouse() {
    const st = this.styles.house;
    if (st === 'mushroom') return this.buildMushroom();
    if (st === 'castle') return this.buildCastle();
    const s = this.cage;
    const y = levelY(HOUSE.level);
    const wood = std(0xffffff, { map: woodTex('#d6a46c', 'rgba(115,65,25,', [2, 1]), roughness: 0.75 });
    // 小木屋
    const house = new THREE.Group();
    const hw = HOUSE.w;
    const hh = 0.42;
    const hd = HOUSE.d;
    house.add(mesh(new THREE.BoxGeometry(hw, hh, 0.03), wood, 0, hh / 2, -hd / 2 + 0.015));
    [-1, 1].forEach((sd) => house.add(mesh(new THREE.BoxGeometry(0.03, hh, hd), wood, sd * (hw / 2 - 0.015), hh / 2, 0)));
    const shape = new THREE.Shape();
    shape.moveTo(-hw / 2, 0); shape.lineTo(hw / 2, 0); shape.lineTo(hw / 2, hh); shape.lineTo(-hw / 2, hh); shape.lineTo(-hw / 2, 0);
    const hole = new THREE.Path();
    hole.moveTo(-0.14, 0); hole.lineTo(0.14, 0); hole.lineTo(0.14, 0.15); hole.absarc(0, 0.15, 0.14, 0, Math.PI, false); hole.lineTo(-0.14, 0);
    shape.holes.push(hole);
    house.add(mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), wood, 0, 0, hd / 2 - 0.03));
    house.add(mesh(new THREE.BoxGeometry(hw - 0.06, 0.02, hd - 0.06), std(0x6b4a33), 0, 0.01, 0, { cast: false }));
    const roofMat = std(0xffffff, { map: woodTex('#e07f72', 'rgba(120,40,30,'), roughness: 0.7 });
    [-1, 1].forEach((sd) => {
      const roof = mesh(new THREE.BoxGeometry(hw * 0.62, 0.035, hd + 0.1), roofMat, sd * hw * 0.24, hh + 0.12, 0);
      roof.rotation.z = -sd * 0.62;
      house.add(roof);
    });
    const gable = new THREE.Shape();
    gable.moveTo(-hw / 2, 0); gable.lineTo(hw / 2, 0); gable.lineTo(0, 0.2); gable.lineTo(-hw / 2, 0);
    [-1, 1].forEach((sd) => house.add(mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.03, bevelEnabled: false }), wood, 0, hh, sd > 0 ? hd / 2 - 0.03 : -hd / 2)));
    house.position.set(HOUSE.x, y, HOUSE.z);
    s.add(house);
  }

  // 蘑菇屋
  buildMushroom() {
    const g = new THREE.Group();
    const stemMat = std(0xfff2dc, { roughness: 0.8 });
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.34, 28), stemMat, 0, 0.17, 0));
    const door = mesh(new THREE.CircleGeometry(0.11, 24, 0, Math.PI), std(0x6b4a33), 0, 0.02, 0.236, { cast: false });
    g.add(door);
    g.add(mesh(new THREE.PlaneGeometry(0.22, 0.1), std(0x6b4a33), 0, 0.05, 0.235, { cast: false }));
    const cap = mesh(new THREE.SphereGeometry(0.4, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe8463f, { roughness: 0.45 }), 0, 0.3, 0);
    cap.scale.set(1, 0.72, 1);
    g.add(cap);
    const under = mesh(new THREE.CircleGeometry(0.4, 32), std(0xf7e3c8, { side: THREE.DoubleSide }), 0, 0.3, 0);
    under.rotation.x = Math.PI / 2;
    g.add(under);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4;
      const el = 0.35 + (i % 3) * 0.32;
      const d = mesh(new THREE.SphereGeometry(0.045, 12, 8), std(0xffffff, { roughness: 0.6 }), Math.cos(a) * Math.cos(el) * 0.4, 0.3 + Math.sin(el) * 0.4 * 0.72, Math.sin(a) * Math.cos(el) * 0.4);
      d.scale.y = 0.5;
      g.add(d);
    }
    g.position.set(HOUSE.x, levelY(HOUSE.level), HOUSE.z);
    this.cage.add(g);
  }

  // 夢幻城堡
  buildCastle() {
    const g = new THREE.Group();
    const stone = std(0xffffff, { map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#e9e1f2'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#cfc2e0'; c.lineWidth = 3;
      for (let y = 0; y < h; y += 21) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); for (let x = (y / 21) % 2 ? 0 : 21; x < w; x += 42) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 21); c.stroke(); } }
    }, [2, 1]), roughness: 0.8 });
    const pink = std(0xff8fc0, { roughness: 0.45 });
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.36, 0.38), stone, 0, 0.18, 0));
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.38), stone, i * 0.11, 0.395, 0));
    [-1, 1].forEach((sd) => {
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.56, 20), stone, sd * 0.27, 0.28, 0.16));
      g.add(mesh(new THREE.ConeGeometry(0.13, 0.26, 20), pink, sd * 0.27, 0.69, 0.16));
    });
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), std(0xcccccc), 0.27, 0.9, 0.16));
    g.add(mesh(new THREE.PlaneGeometry(0.12, 0.07), std(0xffd34d, { side: THREE.DoubleSide }), 0.33, 0.96, 0.16, { cast: false }));
    g.add(mesh(new THREE.CircleGeometry(0.1, 24, 0, Math.PI), std(0x5b3d6e), 0, 0.12, 0.192, { cast: false }));
    g.add(mesh(new THREE.PlaneGeometry(0.2, 0.12), std(0x5b3d6e), 0, 0.06, 0.191, { cast: false }));
    g.add(mesh(new THREE.CircleGeometry(0.035, 16), std(0xfff2a8, { emissive: 0x665500 }), 0.15, 0.26, 0.192, { cast: false }));
    g.position.set(HOUSE.x, levelY(HOUSE.level), HOUSE.z);
    this.cage.add(g);
  }

  buildNest() {
    const s = this.cage;
    const y = levelY(NEST.level);
    // 棉花窩：一開始是一小團；買了「大棉花窩」後面會堆得很高，可以整隻鑽進去
    const nest = new THREE.Group();
    const ns = NEST_STYLES[this.styles.nest] || NEST_STYLES.cotton;
    const cotton = std(0xffffff, { roughness: 1 });
    const R = NEST.r;
    const big = NEST.big;
    const puffs = [];
    const ringN = big ? 80 : 40;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + rand(-0.06, 0.06);
      const back = Math.max(0, -Math.sin(a)); // 後面（z<0）比較高
      const rr = rand(R - 0.03, R + (big ? 0.07 : 0.03));
      const sz = big ? rand(0.07, 0.12) + back * 0.03 : rand(0.045, 0.075);
      puffs.push([Math.cos(a) * rr, big ? rand(0.04, 0.1) + back * rand(0.05, 0.12) : rand(0.02, 0.05), Math.sin(a) * rr, sz]);
    }
    for (let i = 0; i < (big ? 26 : 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * (R - 0.08);
      puffs.push([Math.cos(a) * rr, rand(0.015, 0.04), Math.sin(a) * rr, rand(0.05, 0.08)]);
    }
    const puff = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), cotton, puffs.length);
    const m = new THREE.Matrix4();
    const pc = new THREE.Color();
    puffs.forEach(([x, py, z, sz], i) => {
      m.compose(new THREE.Vector3(x, py, z), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 0.72, sz));
      puff.setMatrixAt(i, m);
      puff.setColorAt(i, pc.set(ns.puff2 && i % 3 === 0 ? ns.puff2 : ns.puff));
    });
    puff.castShadow = puff.receiveShadow = true;
    nest.add(puff);
    nest.add(mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.06, 0.035, 40), std(ns.pad, { roughness: 1 }), 0, 0.017, 0));
    if (ns.berry) {
      // 草莓床：紅色的大草莓碗＋綠葉
      const pts = [];
      for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector2(0.02 + Math.sin(k * Math.PI * 0.55) * (R + 0.1), k * (big ? 0.24 : 0.14))); }
      const bowl = mesh(new THREE.LatheGeometry(pts, 40), std(0xe8384a, { roughness: 0.45, side: THREE.DoubleSide }), 0, 0, 0);
      nest.add(bowl);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const k = 0.25 + Math.random() * 0.7;
        const rr = 0.02 + Math.sin(k * Math.PI * 0.55) * (R + 0.105);
        nest.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), std(0xffe27a), Math.cos(a) * rr, k * (big ? 0.24 : 0.14), Math.sin(a) * rr, { cast: false }));
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = mesh(new THREE.ConeGeometry(0.06, 0.18, 4), std(0x4caf50), Math.cos(a) * (R + 0.1), big ? 0.25 : 0.15, Math.sin(a) * (R + 0.1));
        leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        nest.add(leaf);
      }
    }
    const hayN = ns.hay ? (big ? 100 : 40) : 0;
    const hay = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4), std(0xe5c66f, { roughness: 0.9 }), hayN);
    for (let i = 0; i < hayN; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = rand(0.05, R + 0.1);
      m.compose(new THREE.Vector3(Math.cos(a) * rr, rand(0.02, 0.12), Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + rand(-0.4, 0.4), 0, Math.random() * 3)), new THREE.Vector3(1, 1, 1));
      hay.setMatrixAt(i, m);
    }
    if (hayN) nest.add(hay);
    nest.position.set(NEST.x, y, NEST.z);
    s.add(nest);
  }

  buildLog() {
    const s = this.cage;
    // 木頭隧道（倉鼠會鑽進去）
    const log = new THREE.Group();
    const bark = std(0xffffff, { map: woodTex('#8a5a35', 'rgba(50,25,10,', [3, 1]), roughness: 0.95 });
    const inner = std(0xffffff, { map: woodTex('#c79a68', 'rgba(90,55,25,', [3, 1]), roughness: 0.95, side: THREE.BackSide });
    const outer = mesh(new THREE.CylinderGeometry(LOG.r, LOG.r, LOG.len, 28, 1, true), bark);
    outer.rotation.z = Math.PI / 2;
    log.add(outer);
    const innerM = mesh(new THREE.CylinderGeometry(LOG.inner, LOG.inner, LOG.len, 28, 1, true), inner, 0, 0, 0, { cast: false });
    innerM.rotation.z = Math.PI / 2;
    log.add(innerM);
    [-1, 1].forEach((sd) => {
      const ring = mesh(new THREE.RingGeometry(LOG.inner, LOG.r, 28), std(0xd9b07a, { side: THREE.DoubleSide }), sd * LOG.len / 2, 0, 0);
      ring.rotation.y = Math.PI / 2;
      log.add(ring);
    });
    log.position.set(LOG.x, LOG.r, LOG.z);
    s.add(log);
  }

  // 透明連通隧道（中間拱起來，看得到倉鼠在裡面鑽）
  buildTube(lk) {
    const pts = [{ x: lk.inA.x + 0.06, y: 0.1, z: lk.z }, ...lk.path, { x: lk.inB.x - 0.06, y: 0.1, z: lk.z }].map((p) => new THREE.Vector3(p.x, p.y + 0.12, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff3ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
    this.cage.add(mesh(new THREE.TubeGeometry(curve, 48, 0.15, 20, false), glass, 0, 0, 0, { cast: false, receive: false }));
    const ringMat = std((CAGE_COLORS[this.styles.cageColor] || CAGE_COLORS.white).accent, { roughness: 0.4 });
    [0.06, 0.5, 0.94].forEach((u) => {
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const ring = mesh(new THREE.TorusGeometry(0.155, 0.018, 8, 28), ringMat, p.x, p.y, p.z);
      ring.lookAt(p.clone().add(t));
      this.cage.add(ring);
    });
  }

  // 玩具
  buildToy(t) {
    const g = new THREE.Group();
    g.position.set(t.x, levelY(t.level), t.z);
    const wood = std(0xffffff, { map: woodTex('#d9a86f', 'rgba(110,60,25,'), roughness: 0.8 });
    if (t.id === 'chew') {
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), wood, 0, 0.05, 0));
      [-1, 1].forEach((sd) => { const st = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10), std(0xc88c55), sd * 0.04, 0.12, 0.0); st.rotation.z = sd * 0.5; g.add(st); });
      g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), std(0xff9ec4), 0.06, 0.12, 0.05));
    }
    if (t.id === 'steps') {
      [[0.36, 0], [0.26, 1], [0.16, 2]].forEach(([w, i]) => g.add(mesh(new THREE.BoxGeometry(w, 0.067, 0.3), wood, (0.36 - w) / 2 - 0.0, 0.034 + i * 0.067, 0)));
    }
    if (t.id === 'swing') {
      const frame = std(0x8fc9ff, { roughness: 0.4 });
      [-1, 1].forEach((sd) => [-1, 1].forEach((fz) => {
        const leg = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.6, 8), frame, sd * 0.24, 0.29, fz * 0.08);
        leg.rotation.x = fz * 0.25;
        g.add(leg);
      }));
      const bar = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.52, 8), frame, 0, 0.57, 0);
      bar.rotation.z = Math.PI / 2;
      g.add(bar);
      const seat = new THREE.Group();
      seat.position.y = 0.57;
      [-1, 1].forEach((sd) => seat.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.36, 4), std(0xffffff), sd * 0.1, -0.18, 0, { cast: false })));
      seat.add(mesh(new THREE.BoxGeometry(0.26, 0.025, 0.15), std(0xff9ec4, { roughness: 0.5 }), 0, -0.37, 0));
      g.add(seat);
      this.swing = { seat, toy: t, angle: 0 };
    }
    if (t.id === 'slide') {
      const blue = std(0x7fb6e8, { roughness: 0.4 });
      // 梯子（左邊）
      [-1, 1].forEach((fz) => { const r = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), blue, -0.25, 0.23, fz * 0.09); r.rotation.z = -0.45; g.add(r); });
      for (let i = 0; i < 4; i++) { const k = (i + 0.6) / 4.5; const r = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.18, 6), std(0xffffff), -0.35 + k * 0.2, k * 0.42, 0); r.rotation.x = Math.PI / 2; g.add(r); }
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), blue, -0.12, 0.42, 0));
      // 滑道
      const chute = mesh(new THREE.BoxGeometry(0.62, 0.02, 0.18), std(0xffd34d, { roughness: 0.25 }), 0.16, 0.22, 0);
      chute.rotation.z = -Math.atan2(0.4, 0.56);
      g.add(chute);
      [-1, 1].forEach((fz) => { const rail = mesh(new THREE.BoxGeometry(0.62, 0.04, 0.015), std(0xff8f8f), 0.16, 0.24, fz * 0.09); rail.rotation.z = chute.rotation.z; g.add(rail); });
      [[-0.04, 0.21], [0.3, 0.1]].forEach(([x, h]) => g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, h * 2, 6), blue, x, h, 0)));
    }
    if (t.id === 'ball') {
      const ball = new THREE.Group();
      const R = 0.22;
      ball.add(mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffc2e0, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, { cast: false }));
      const band = mesh(new THREE.TorusGeometry(R, 0.014, 8, 48), std(0xff7ab0, { roughness: 0.3 }));
      ball.add(band);
      const band2 = mesh(new THREE.TorusGeometry(R, 0.01, 8, 48), std(0xffffff, { roughness: 0.3 }));
      band2.rotation.y = Math.PI / 2;
      ball.add(band2);
      // 小氣孔
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4;
        const el = (i % 3 - 1) * 0.6;
        const hole = mesh(new THREE.CircleGeometry(0.016, 10), std(0xff7ab0, { side: THREE.DoubleSide }), Math.cos(a) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(a) * Math.cos(el) * R, { cast: false });
        hole.lookAt(0, 0, 0); // 球還沒放進場景，以球心為原點朝內貼齊
        ball.add(hole);
      }
      ball.position.set(t.x, levelY(t.level) + R, t.z);
      this.cage.add(ball);
      this.ball = { mesh: ball, toy: t, last: ball.position.clone() };
      return;
    }
    this.cage.add(g);
  }

  buildParticles() {
    this.pN = 90;
    this.pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), std(0xffffff, { roughness: 1 }), this.pN);
    this.pMesh.frustumCulled = false;
    this.parts = Array.from({ length: this.pN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 0.01, floor: 0 }));
    const c = new THREE.Color(0xffffff);
    for (let i = 0; i < this.pN; i++) this.pMesh.setColorAt(i, c);
    this.scene.add(this.pMesh);
  }
  emit(pos, color, n, floor, back) {
    for (let i = 0; i < n; i++) {
      const idx = this.parts.findIndex((x) => x.life <= 0);
      if (idx < 0) return;
      const pt = this.parts[idx];
      pt.p.set(pos.x + rand(-0.08, 0.08), pos.y + 0.05, pos.z + rand(-0.08, 0.08));
      pt.v.set(rand(-0.6, 0.6), rand(0.6, 1.2), rand(-0.6, 0.6));
      if (back) pt.v.addScaledVector(back, 0.9);
      pt.life = rand(0.45, 0.85);
      pt.s = rand(0.008, 0.016);
      pt.floor = floor;
      this.pMesh.setColorAt(idx, this._c.set(color));
      this.pMesh.instanceColor.needsUpdate = true;
    }
  }

  /* ================= 倉鼠與食物 ================= */
  setHamsters(list) {
    for (const h of list) this.infos[h.id] = h;
  }
  rigFor(id) {
    if (!this.rigs[id]) {
      const ham = new Hamster(this.infos[id]?.color || 'golden');
      this.scene.add(ham.root);
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), this.blobMat);
      contact.rotation.x = -Math.PI / 2;
      this.scene.add(contact);
      // 睡覺時蓋在身上的棉花（只露出頭）
      const blanket = new THREE.Group();
      const bm = std(0xffffff, { roughness: 1 });
      [[0, 0.2, -0.1, 0.12], [-0.1, 0.16, -0.04, 0.09], [0.1, 0.16, -0.04, 0.09], [0, 0.19, 0.02, 0.1], [-0.07, 0.12, -0.16, 0.08], [0.07, 0.12, -0.16, 0.08], [0, 0.14, -0.2, 0.08]].forEach(([x, by, z, r]) => {
        const b = mesh(new THREE.SphereGeometry(1, 12, 10), bm, x, by, z);
        b.scale.set(r, r * 0.75, r);
        blanket.add(b);
      });
      blanket.visible = false;
      this.scene.add(blanket);
      this.rigs[id] = { ham, contact, blanket, pose: null };
    }
    return this.rigs[id];
  }

  updatePoops(now) {
    const seen = new Set();
    for (const p of this.sim.poopsAt(now)) {
      if (p.cleanedAt && now > p.cleanedAt + 700) continue;
      seen.add(p.id);
      let m = this.poopMeshes[p.id];
      if (!m) {
        m = new THREE.Group();
        const mat = std(0x5b3b24, { roughness: 0.55 });
        [[0, 0, 0, 0.2], [0.035, 0, 0.018, 1.4], [-0.012, 0.012, -0.03, 2.3]].forEach(([x, y, z, r], i) => {
          const pel = mesh(new THREE.SphereGeometry(1, 12, 8), mat, x, 0.013 + y, z);
          pel.scale.set(0.016, 0.013, 0.034);
          pel.rotation.y = r;
          if (i === 2 && (p.rot || 0) > 3) pel.visible = false;
          m.add(pel);
        });
        m.rotation.y = p.rot || 0;
        this.scene.add(m);
        this.poopMeshes[p.id] = m;
      }
      m.userData.poop = p;
      m.position.set(p.x, p.y, p.z);
      const pop = clamp((now - p.appearAt) / 300, 0, 1);
      m.scale.setScalar(pop);
      if (p.cleanedAt && now >= p.cleanedAt) {
        // 撿起來：往上飛、變小
        const k = clamp((now - p.cleanedAt) / 700, 0, 1);
        m.position.y += k * 0.6;
        m.scale.setScalar(Math.max(0.01, 1 - k));
      }
    }
    for (const id in this.poopMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(this.poopMeshes[id]);
        delete this.poopMeshes[id];
      }
    }
  }
  pickPoop(clientX, clientY, now = Date.now()) {
    let best = null;
    let bestD = 38;
    for (const id in this.poopMeshes) {
      const p = this.poopMeshes[id].userData.poop;
      if (!p || (p.cleanedAt && p.cleanedAt <= now)) continue;
      const c = this.toScreen(this._v.set(p.x, p.y + 0.02, p.z));
      const d = Math.hypot(c.x - clientX, c.y - clientY);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  updateFoods(now) {
    const seen = new Set();
    const sim = this.sim;
    for (const f of sim.foods()) {
      const end = f.eatenAt ?? f.goneAt ?? Infinity;
      if (now < f.at - 200 || now > end + 400) continue;
      seen.add(f.id);
      let m = this.foodMeshes[f.id];
      if (!m) {
        m = makeFood(f.kind);
        m.rotation.y = (f.at % 628) / 100;
        this.scene.add(m);
        this.foodMeshes[f.id] = m;
      }
      const fall = clamp((now - f.at) / 350, 0, 1);
      m.position.set(f.x, f.y + (1 - fall * fall) * 0.5, f.z);
      m.scale.setScalar(1);
      if (now > end) m.scale.setScalar(Math.max(0.01, 1 - (now - end) / 400));
      else if (f.eatT0 != null && now >= f.eatT0) {
        const k = clamp((now - f.eatT0) / (f.eatenAt - f.eatT0), 0, 1);
        const rig = this.rigs[f.claimedBy];
        if (f.kind === 'kibble' || !rig) m.scale.setScalar(1 - k * 0.85);
        else {
          // 捧在手上吃
          rig.ham.holdPoint.getWorldPosition(this._v);
          m.position.lerp(this._v, Math.min(1, k * 6));
          m.rotation.x = -0.9;
          m.scale.setScalar(1.1 - k * 0.7);
        }
      }
    }
    for (const id in this.foodMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(this.foodMeshes[id]);
        delete this.foodMeshes[id];
      }
    }
  }

  /* ================= 相機（縮放／旋轉／平移） ================= */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.cam.dist == null && W) this.cam.dist = this.fitDist();
    if (LAY && this.win) this.placeWindow();
  }
  fitDist() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // 預設看主籠子；有遊戲籠的話，寬螢幕才一起框進來（手機可以拖曳／縮小去看）
    const wide = this.camera.aspect > 1.2;
    const halfW = wide ? (LAY.ext.x1 - LAY.ext.x0) / 2 + 0.18 : W.x + 0.18 + (LAY.annexes.length ? 0.35 : 0);
    return clamp(halfW / (tanH * Math.min(1.6, this.camera.aspect)), 2.2, 16);
  }
  resetView() {
    Object.assign(this.cam, { yaw: 0, pitch: 0.52, dist: this.fitDist() });
    const wide = this.camera.aspect > 1.2;
    this.cam.target.set(wide ? (LAY.ext.x0 + LAY.ext.x1) / 2 : LAY.annexes.length ? 0.35 : 0, LAY.top * 0.31, 0);
  }
  orbit(dx, dy) {
    this.cam.yaw = clamp(this.cam.yaw - dx * 0.006, -1.2, 1.2);
    this.cam.pitch = clamp(this.cam.pitch + dy * 0.005, 0.12, 1.3);
  }
  zoom(factor) {
    this.cam.dist = clamp(this.cam.dist * factor, 1.1, 26);
  }
  pan(dx, dy) {
    const k = this.cam.dist / (this.canvas.clientHeight || 800) * 0.9;
    const right = this._v.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const t = this.cam.target;
    t.addScaledVector(right, -dx * k);
    const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    t.addScaledVector(fwd, dy * k);
    t.x = clamp(t.x, LAY.ext.x0 + 0.1, LAY.ext.x1 - 0.1);
    t.z = clamp(t.z, -W.z + 0.1, W.z - 0.1);
  }
  updateCamera() {
    const { yaw, pitch, dist, target } = this.cam;
    // 拉近時把視線高度慢慢移到二樓附近也看得到
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(target);
  }

  /* ================= 點擊與放食物 ================= */
  setNdc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, inView: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 };
  }
  pickHamster(clientX, clientY) {
    this.setNdc(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    for (const id in this.rigs) {
      const rig = this.rigs[id];
      if (!rig.pose || HIDDEN_PLACES.has(rig.pose.place)) continue;
      const hit = this.raycaster.intersectObject(rig.ham.root, true)[0];
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = id; }
    }
    if (best) return best;
    for (const id in this.rigs) {
      const rig = this.rigs[id];
      if (!rig.pose || HIDDEN_PLACES.has(rig.pose.place)) continue;
      const c = this.toScreen(rig.ham.rollG.localToWorld(this._v.set(0, 0.1, 0.05)));
      const d = Math.hypot(c.x - clientX, c.y - clientY);
      if (d < 50 && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }
  headScreenPos(id) {
    const rig = this.rigs[id];
    if (!rig) return null;
    return this.toScreen(rig.ham.head.localToWorld(this._v.set(0, 0.42, 0)));
  }
  hamsterPlace(id) {
    return this.rigs[id]?.pose?.place;
  }
  visibleHamsters() {
    return Object.keys(this.rigs).filter((id) => {
      const rig = this.rigs[id];
      if (!rig.pose || HIDDEN_PLACES.has(rig.pose.place)) return false;
      return this.toScreen(rig.ham.root.position.clone().setY(rig.ham.root.position.y + 0.2)).inView;
    });
  }

  // 手指放開的位置 → 食物要落在哪裡（自動避開滾輪、沙盆、隧道、梯子）
  dropPoint(clientX, clientY) {
    this.setNdc(clientX, clientY);
    const ray = this.raycaster.ray;
    const hitY = (y) => {
      if (Math.abs(ray.direction.y) < 1e-4) return null;
      const t = (y - ray.origin.y) / ray.direction.y;
      return t > 0 ? ray.origin.clone().addScaledVector(ray.direction, t) : null;
    };
    let lvl = 0;
    let p = PLAT ? hitY(PLAT.y) : null;
    if (p && p.x > PLAT.x0 && p.x < PLAT.x1 && p.z > PLAT.z0 && p.z < PLAT.z1) lvl = 2;
    else {
      p = hitY(0);
      if (p && Math.abs(p.x) < W.x && Math.abs(p.z) < W.z) lvl = 1;
      for (const ax of LAY.annexes) if (p && Math.abs(p.x - ax.cx) < ax.W.x && Math.abs(p.z - ax.cz) < ax.W.z) lvl = ax.level;
    }
    if (!lvl) return null;
    let x = p.x;
    let z = p.z;
    let y = levelY(lvl) + 0.012;
    if (lvl === 1 && Math.hypot(x - BOWL.x, z - BOWL.z) < BOWL.r + 0.08) {
      // 放進飼料碗
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 0.05;
      return { x: BOWL.x + Math.cos(a) * rr, y: 0.04, z: BOWL.z + Math.sin(a) * rr, level: 1, bowl: true };
    }
    const b = BOUNDS[lvl];
    for (let iter = 0; iter < 3; iter++) {
      for (const o of LAY.OB[lvl] || []) {
        if (o.id === 'bowl') continue;
        const d = Math.hypot(x - o.x, z - o.z);
        if (d < o.r) {
          const k = (o.r + 0.02) / (d || 1);
          x = o.x + (x - o.x) * k;
          z = o.z + (z - o.z) * k;
        }
      }
      x = clamp(x, b.x0, b.x1);
      z = clamp(z, b.z0, b.z1);
      if (lvl === 1 && RAMP && x > RAMP.x - 0.26 && z > -0.2) x = RAMP.x - 0.27;
    }
    return { x, y, z, level: lvl };
  }
  showMarker(pt) {
    this.marker.visible = !!pt;
    if (pt) this.marker.position.set(pt.x, pt.y + 0.01, pt.z);
  }

  capture() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }

  setNight(on) { this.night = on; }

  /* ================= 每一幀 ================= */
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = Date.now();
    const sim = this.sim;
    if (sim.ready && sim.until < now + 8000) sim.advance(now + 30000);

    // 白天／晚上的光
    this.nightK = THREE.MathUtils.damp(this.nightK, this.night ? 1 : 0, 2, dt);
    const n = this.nightK;
    this.hemi.intensity = 1.25 - n * 0.85;
    this.sun.intensity = 2.2 - n * 1.95;
    this.fill.intensity = 0.45 - n * 0.2;
    this.lamp.intensity = n * 2.2;
    this.hemi.color.setRGB(1 - n * 0.35, 0.98 - n * 0.25, 0.95);

    this.updateCamera();
    let running = false;
    let swingOn = false;
    let ballRig = null;
    const tNow = now / 1000;
    const P = this.parts;
    for (const id of sim.hamsterIds()) {
      const pose = sim.poseAt(id, now);
      if (!pose) continue;
      const rig = this.rigFor(id);
      rig.pose = pose;
      rig.ham.look = this.camera.position;
      rig.ham.drive(pose, dt);
      rig.ham.update(dt);
      if (pose.kind === 'wheelRun') running = true;
      // 盪鞦韆：倉鼠跟著座椅一起盪
      if (pose.kind === 'swinging' && this.swing) {
        swingOn = true;
        const a = this.swing.angle;
        rig.ham.root.position.z += Math.sin(a) * 0.37;
        rig.ham.root.position.y += (1 - Math.cos(a)) * 0.37;
      }
      // 跑跑球：球跟著倉鼠滾
      if (pose.place === 'ball' && this.ball) {
        ballRig = rig;
      }
      const onFloor = pose.kind !== 'move' ? !['wheel', 'tunnel', 'swing', 'ball', 'steps', 'slideTop'].includes(pose.place) && pose.kind !== 'bath' : !['jump', 'climb', 'tube', 'slide', 'roll'].includes(pose.mode);
      rig.contact.visible = onFloor;
      rig.contact.position.set(rig.ham.pos.x, rig.ham.pos.y + 0.012, rig.ham.pos.z);
      rig.contact.rotation.z = rig.ham.heading;
      if (pose.kind === 'bath' && Math.random() < 0.7) this.emit(rig.ham.pos, 0xe2c99a, 1, 0.07);
      // 大棉花窩可以整隻蓋住；一般的小窩只蓋一點
      const cover = rig.ham.nestK * Math.min(1, rig.ham.sleepK * 1.4) * (NEST.big ? 1 : 0.6);
      rig.blanket.visible = cover > 0.03;
      if (rig.blanket.visible) {
        rig.blanket.position.copy(rig.ham.root.position);
        rig.blanket.rotation.y = rig.ham.heading;
        rig.blanket.scale.setScalar(cover);
      }
      if (pose.kind === 'burrow' && Math.random() < 0.5) this.emit(rig.ham.pos, 0xffffff, 1, levelY(NEST.level) + 0.02);
      if (pose.kind === 'dig' && Math.random() < 0.6) {
        const back = this._v.set(-Math.sin(rig.ham.heading), 0.3, -Math.cos(rig.ham.heading));
        this.emit(rig.ham.pos, 0xf1e6d0, 1, 0.01, back.clone());
      }
    }
    this.wheelVel = THREE.MathUtils.damp(this.wheelVel, running ? 6.5 : 0, running ? 3 : 1, dt);
    if (this.swing) {
      const target = swingOn ? Math.sin(tNow * 2.4) * 0.5 : 0;
      this.swing.angle += (target - this.swing.angle) * Math.min(1, dt * (swingOn ? 6 : 2));
      this.swing.seat.rotation.x = this.swing.angle;
    }
    if (this.ball) {
      const b = this.ball;
      const want = ballRig ? this._v.set(ballRig.ham.pos.x, ballRig.ham.pos.y + 0.22, ballRig.ham.pos.z) : this._v.set(b.toy.x, levelY(b.toy.level) + 0.22, b.toy.z);
      b.mesh.position.lerp(want, ballRig ? 1 : Math.min(1, dt * 3));
      const d = b.mesh.position.clone().sub(b.last);
      d.y = 0;
      const dist = d.length();
      if (dist > 1e-4) {
        const axis = new THREE.Vector3(d.z, 0, -d.x).normalize();
        b.mesh.rotateOnWorldAxis(axis, dist / 0.22);
      }
      b.last.copy(b.mesh.position);
    }
    for (const m of this.ledMats) m.emissive.setHSL((tNow * 0.15 + (m === this.ledMats[0] ? 0 : 0.5)) % 1, 0.9, 0.55);
    for (const m of this.ledMats) m.emissiveIntensity = 1.4 + this.wheelVel * 0.25;
    for (const b of this.balloons || []) b.position.y = b.userData.y + Math.sin(tNow * 0.8 + b.userData.ph) * 0.12;
    if (this.rotor) this.rotor.rotation.z -= this.wheelVel * dt;

    P.forEach((pt, i) => {
      if (pt.life > 0) {
        pt.life -= dt;
        pt.v.y -= 4 * dt;
        pt.p.addScaledVector(pt.v, dt);
        if (pt.p.y < pt.floor) pt.life = 0;
      }
      const sc = pt.life > 0 ? pt.s : 0;
      this._m.makeScale(sc, sc, sc).setPosition(pt.p);
      this.pMesh.setMatrixAt(i, this._m);
    });
    this.pMesh.instanceMatrix.needsUpdate = true;

    this.updateFoods(now);
    this.updatePoops(now);
    if (now - this.lastSky > 1000 && this.win.children.length) { this.lastSky = now; this.drawSky(now); }
    // 轉到側面時，擋在鏡頭前的那面鐵籠變淡
    const cd = this._v.set(this.camera.position.x, 0, this.camera.position.z).normalize();
    for (const w of this.walls) {
      const facing = w.normal.dot(cd);
      const target = 1 - ss(0.2, 0.5, facing) * 0.92;
      w.mat.opacity += (target - w.mat.opacity) * Math.min(1, dt * 8);
      w.mat.depthWrite = w.mat.opacity > 0.95;
    }
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(now);
  }
}
