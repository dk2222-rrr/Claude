// 3D 場景：兩層樓倉鼠窩（沒有鐵絲，看得清楚）。倉鼠動作來自 sim.js，這裡只負責畫出來。
//   一樓：滾輪、沙浴盆、飼料碗、水瓶、木頭隧道
//   二樓：木平台＋小木屋＋棉花窩（木梯斜坡上下樓）
import * as THREE from 'three';
import { Hamster } from './hamster.js';
import { W, WHEEL, SAND, BOWL, DRINK, PLAT, RAMP, HOUSE, NEST, LOG, OB1, OB2, BOUNDS, levelY } from './layout.js';
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
    this.buildBase();
    this.buildWheel();
    this.buildSandBath();
    this.buildBowl();
    this.buildBottle();
    this.buildUpstairs();
    this.buildParticles();

    this.blobMat = new THREE.MeshBasicMaterial({ map: shadowBlobTex(), transparent: true, depthWrite: false });
    this.rigs = {}; // hid → { ham, contact }
    this.infos = {}; // hid → { name, color }
    this.foodMeshes = {};
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
    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  /* ================= 場景 ================= */
  buildRoom() {
    const s = this.scene;
    const desk = mesh(new THREE.PlaneGeometry(14, 10), std(0xffffff, { map: woodTex('#d8b48a', 'rgba(120,75,35,', [3, 3]), roughness: 0.6 }), 0, W.baseBottom - 0.02, 0, { cast: false });
    desk.rotation.x = -Math.PI / 2;
    s.add(desk);
    this.wall = mesh(new THREE.PlaneGeometry(16, 8), std(0xf4e6da, { roughness: 1 }), 0, 3.5, -2.6, { cast: false });
    s.add(this.wall);
  }

  buildBase() {
    const s = this.scene;
    const { x: X, z: Z, baseTop: T, baseBottom: B } = W;
    const plastic = std(0xfdf8f4, { roughness: 0.35 });
    const accent = std(0xffb3c4, { roughness: 0.4 });
    const h = T - B;
    const t = 0.05;
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, t, Z * 2 + 2 * t), plastic, 0, B - t / 2, 0));
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, h, t), plastic, 0, B + h / 2, -Z - t / 2));
    s.add(mesh(new THREE.BoxGeometry(t, h, Z * 2 + 2 * t), plastic, -X - t / 2, B + h / 2, 0));
    s.add(mesh(new THREE.BoxGeometry(t, h, Z * 2 + 2 * t), plastic, X + t / 2, B + h / 2, 0));
    const acrylic = new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false });
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, h, 0.02), acrylic, 0, B + h / 2, Z + 0.01, { cast: false, receive: false }));
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, 0.05, 0.07), accent, 0, T, -Z - t / 2));
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, 0.03, 0.03), accent, 0, T, Z + 0.01));
    [-1, 1].forEach((sd) => s.add(mesh(new THREE.BoxGeometry(0.07, 0.05, Z * 2 + 0.1), accent, sd * (X + t / 2), T, 0)));

    // 紙棉墊料
    const beddingSide = std(0xffffff, { map: speckleTex('#efe4cf', ['#e3d3b4', '#f8f1e4', '#d9c7a4', '#fffaf0'], 6000, [4, 1]), roughness: 1 });
    s.add(mesh(new THREE.BoxGeometry(X * 2, -B - 0.01, Z * 2), beddingSide, 0, (B - 0.01) / 2, 0, { cast: false }));
    const top = new THREE.PlaneGeometry(X * 2, Z * 2, 90, 56);
    top.rotateX(-Math.PI / 2);
    const p = top.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.abs(x) > X - 0.15 || Math.abs(z) > Z - 0.15 ? 0.025 : 0;
      p.setY(i, Math.sin(x * 5.1 + z * 2.3) * 0.012 + Math.sin(x * 11 - z * 9) * 0.006 + Math.random() * 0.012 + edge);
      c.setHSL(0.1, 0.4 + Math.random() * 0.15, 0.86 + Math.random() * 0.07);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    top.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    top.computeVertexNormals();
    this.floor = mesh(top, std(0xffffff, { vertexColors: true, roughness: 1 }), 0, 0, 0, { cast: false });
    s.add(this.floor);
    const bits = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.03, 0), std(0xffffff, { roughness: 1 }), 700);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 700; i++) {
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      const sc = rand(0.4, 1.2);
      m.compose(new THREE.Vector3(rand(-X + 0.04, X - 0.04), 0.012, rand(-Z + 0.04, Z - 0.04)), q, new THREE.Vector3(sc, sc * 0.6, sc));
      bits.setMatrixAt(i, m);
      bits.setColorAt(i, c.setHSL(0.09 + Math.random() * 0.03, 0.3 + Math.random() * 0.3, 0.82 + Math.random() * 0.12));
    }
    bits.receiveShadow = true;
    s.add(bits);
  }

  buildWheel() {
    const g = new THREE.Group();
    g.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    const { r, depth } = WHEEL;
    const rotor = new THREE.Group();
    g.add(rotor);
    const plastic = std(0x9ad7c6, { roughness: 0.35 });
    const treadTex = canvasTex(512, 32, (c, w, h) => {
      c.fillStyle = '#b3e4d6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#8fcab9';
      for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 5, h);
    });
    const tread = mesh(new THREE.CylinderGeometry(r, r, depth, 72, 1, true), std(0xffffff, { map: treadTex, roughness: 0.5, side: THREE.DoubleSide }));
    tread.rotation.x = Math.PI / 2;
    rotor.add(tread);
    const back = mesh(new THREE.CircleGeometry(r, 72), plastic);
    back.position.z = -depth / 2;
    rotor.add(back);
    const holeMat = std(0x6fb3a2, { roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rotor.add(mesh(new THREE.CircleGeometry(0.075, 24), holeMat, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, -depth / 2 + 0.003, { cast: false }));
    }
    const lip = mesh(new THREE.TorusGeometry(r, 0.022, 10, 72), std(0xffffff, { roughness: 0.3 }));
    lip.position.z = depth / 2;
    rotor.add(lip);
    const lipBack = lip.clone();
    lipBack.position.z = -depth / 2;
    rotor.add(lipBack);
    const hub = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 20), std(0xffd27a, { roughness: 0.4 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -depth / 2 - 0.04;
    g.add(hub);
    const standMat = std(0xffd27a, { roughness: 0.45 });
    g.add(mesh(new THREE.BoxGeometry(0.1, WHEEL.y + 0.02, 0.05), standMat, 0, -WHEEL.y / 2, -depth / 2 - 0.08));
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.04, 0.32), standMat, 0, -WHEEL.y + 0.02, -depth / 2 - 0.12));
    this.rotor = rotor;
    this.scene.add(g);
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
    this.scene.add(g);
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
    this.scene.add(g);
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
    this.scene.add(g);
  }

  buildUpstairs() {
    const s = this.scene;
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

    // 棉花窩＋乾草
    const nest = new THREE.Group();
    const puff = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), std(0xffffff, { roughness: 1 }), 50);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2 + rand(-0.1, 0.1);
      const rr = rand(NEST.r - 0.03, NEST.r + 0.05);
      const sz = rand(0.05, 0.085);
      m.compose(new THREE.Vector3(Math.cos(a) * rr, rand(0.03, 0.07), Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 0.75, sz));
      puff.setMatrixAt(i, m);
    }
    puff.castShadow = puff.receiveShadow = true;
    nest.add(puff);
    nest.add(mesh(new THREE.CylinderGeometry(NEST.r + 0.03, NEST.r + 0.03, 0.03, 32), std(0xfff6ef, { roughness: 1 }), 0, 0.015, 0));
    const hay = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4), std(0xe5c66f, { roughness: 0.9 }), 60);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = rand(0.05, NEST.r + 0.08);
      m.compose(new THREE.Vector3(Math.cos(a) * rr, rand(0.02, 0.07), Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + rand(-0.3, 0.3), 0, Math.random() * 3)), new THREE.Vector3(1, 1, 1));
      hay.setMatrixAt(i, m);
    }
    nest.add(hay);
    nest.position.set(NEST.x, y, NEST.z);
    s.add(nest);

    // 一樓：二樓下面的木頭隧道（倉鼠會鑽進去）
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
      this.rigs[id] = { ham, contact, pose: null };
    }
    return this.rigs[id];
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
    if (this.cam.dist == null) this.cam.dist = this.fitDist();
  }
  fitDist() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return clamp(1.98 / (tanH * Math.min(1.6, this.camera.aspect)), 3.5, 11);
  }
  resetView() {
    Object.assign(this.cam, { yaw: 0, pitch: 0.6, dist: this.fitDist() });
    this.cam.target.set(0, 0.72, 0);
  }
  orbit(dx, dy) {
    this.cam.yaw = clamp(this.cam.yaw - dx * 0.006, -1.2, 1.2);
    this.cam.pitch = clamp(this.cam.pitch + dy * 0.005, 0.12, 1.3);
  }
  zoom(factor) {
    this.cam.dist = clamp(this.cam.dist * factor, 1.1, 12);
  }
  pan(dx, dy) {
    const k = this.cam.dist / (this.canvas.clientHeight || 800) * 0.9;
    const right = this._v.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const t = this.cam.target;
    t.addScaledVector(right, -dx * k);
    const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    t.addScaledVector(fwd, dy * k);
    t.x = clamp(t.x, -1.7, 1.7);
    t.z = clamp(t.z, -1.0, 1.0);
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
    let p = hitY(PLAT.y);
    if (p && p.x > PLAT.x0 && p.x < PLAT.x1 && p.z > PLAT.z0 && p.z < PLAT.z1) lvl = 2;
    else {
      p = hitY(0);
      if (p && Math.abs(p.x) < W.x && Math.abs(p.z) < W.z) lvl = 1;
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
      for (const o of lvl === 1 ? OB1 : OB2) {
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
      if (lvl === 1 && x > RAMP.x - 0.26 && z > -0.2) x = RAMP.x - 0.27;
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
      const onFloor = pose.kind !== 'move' ? !['wheel', 'tunnel'].includes(pose.place) && pose.kind !== 'bath' : pose.mode !== 'jump' && pose.mode !== 'climb';
      rig.contact.visible = onFloor;
      rig.contact.position.set(rig.ham.pos.x, rig.ham.pos.y + 0.012, rig.ham.pos.z);
      rig.contact.rotation.z = rig.ham.heading;
      if (pose.kind === 'bath' && Math.random() < 0.7) this.emit(rig.ham.pos, 0xe2c99a, 1, 0.07);
      if (pose.kind === 'dig' && Math.random() < 0.6) {
        const back = this._v.set(-Math.sin(rig.ham.heading), 0.3, -Math.cos(rig.ham.heading));
        this.emit(rig.ham.pos, 0xf1e6d0, 1, 0.01, back.clone());
      }
    }
    this.wheelVel = THREE.MathUtils.damp(this.wheelVel, running ? 6.5 : 0, running ? 3 : 1, dt);
    this.rotor.rotation.z -= this.wheelVel * dt;

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
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(now);
  }
}
