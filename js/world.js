// 3D 場景：兩層樓的倉鼠籠
//   一樓：滾輪、沙浴盆、飼料碗、水瓶、木頭隧道
//   二樓：木平台＋小木屋＋棉花窩（用木梯斜坡上下樓）
import * as THREE from 'three';
import { Hamster } from './hamster.js';

const CANCEL = Symbol('cancel');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// ---- 籠子配置（墊料表面 y=0）----
const W = { x: 1.8, z: 1.1, top: 2.7, baseTop: 0.36, baseBottom: -0.3 };
const WHEEL = { x: -1.12, y: 0.72, z: -0.55, r: 0.6, depth: 0.4 };
const SAND = { x: -0.2, z: 0.5, r: 0.42 };
const BOWL = { x: 0.85, z: 0.62, r: 0.17 };
const DRINK = { x: -1.48, z: 0.6 };
const PLAT = { x0: 0.15, x1: W.x, z0: -W.z, z1: -0.1, y: 0.95 };
const RAMP = { x: 1.52, w: 0.38, zTop: PLAT.z1, zBot: 0.95 };
const HOUSE = { x: 0.62, z: -0.82 };
const NEST = { x: 1.12, z: -0.56, r: 0.25 };
const LOG = { x: 0.75, z: -0.72 };

const OBST1 = [
  { x: SAND.x, z: SAND.z, r: SAND.r + 0.12 },
  { x: BOWL.x, z: BOWL.z, r: 0.3 },
  { x: WHEEL.x, z: WHEEL.z, r: 0.72 },
  { x: LOG.x, z: LOG.z, r: 0.42 },
];
const OBST2 = [{ x: HOUSE.x, z: HOUSE.z, r: 0.4 }];

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

// 線段穿過障礙物就繞過去
function route(from, to, obstacles) {
  const pts = [];
  let cur = { ...from };
  for (let iter = 0; iter < 4; iter++) {
    let hit = null;
    let bestT = Infinity;
    let hitP = null;
    for (const o of obstacles) {
      if (Math.hypot(cur.x - o.x, cur.z - o.z) < o.r || Math.hypot(to.x - o.x, to.z - o.z) < o.r) continue;
      const dx = to.x - cur.x;
      const dz = to.z - cur.z;
      const L2 = dx * dx + dz * dz || 1;
      const t = clamp(((o.x - cur.x) * dx + (o.z - cur.z) * dz) / L2, 0, 1);
      const px = cur.x + dx * t;
      const pz = cur.z + dz * t;
      if (Math.hypot(px - o.x, pz - o.z) < o.r && t < bestT) { bestT = t; hit = o; hitP = { x: px, z: pz }; }
    }
    if (!hit) break;
    let nx = hitP.x - hit.x;
    let nz = hitP.z - hit.z;
    let n = Math.hypot(nx, nz);
    if (n < 1e-3) { nx = -(to.z - cur.z); nz = to.x - cur.x; n = Math.hypot(nx, nz) || 1; }
    const wp = {
      x: clamp(hit.x + (nx / n) * (hit.r + 0.06), -W.x + 0.15, W.x - 0.15),
      z: clamp(hit.z + (nz / n) * (hit.r + 0.06), -W.z + 0.15, W.z - 0.15),
    };
    pts.push(wp);
    cur = wp;
  }
  pts.push(to);
  return pts;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    this.target = new THREE.Vector3(0, 0.4, 0.1);
    this.camMode = 'follow';
    this.camHalfW = 1.05;

    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfffaf2, 0xd9c2a5, 1.25));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2));
    sun.position.set(2.2, 5.5, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3.2, bottom: -3, near: 1, far: 14 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    s.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
    fill.position.set(-3, 2.5, 2);
    s.add(fill);

    this.buildRoom();
    this.buildBase();
    this.buildBars();
    this.buildWheel();
    this.buildSandBath();
    this.buildBowl();
    this.buildBottle();
    this.buildUpstairs();

    const blobMat = new THREE.MeshBasicMaterial({ map: shadowBlobTex(), transparent: true, depthWrite: false });
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), blobMat);
    this.contact.rotation.x = -Math.PI / 2;
    s.add(this.contact);

    this.buildSandParticles();

    this.ham = new Hamster();
    this.ham.root.position.set(-0.4, 0, -0.05);
    s.add(this.ham.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.lookPoint = new THREE.Vector3(0, 1.4, 5);
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();

    // 行為狀態
    this.token = 0;
    this.mode = 'idle';
    this.level = 1;
    this.inWheel = false;
    this.inSand = false;
    this.rampTo = 0; // 正在梯子上時＝目標樓層
    this.wheelVel = 0;
    this.nextAuto = performance.now() + 1200;
    this.lastInteraction = performance.now();
    this.cool = { bath: 0, drink: 0 };

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
    s.add(mesh(new THREE.PlaneGeometry(16, 8), std(0xf4e6da, { roughness: 1 }), 0, 3.5, -2.6, { cast: false }));
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
    // 前面透明壓克力（看得到厚厚的墊料）
    const acrylic = new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false });
    s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, h, 0.02), acrylic, 0, B + h / 2, Z + 0.01, { cast: false, receive: false }));
    // 上緣卡扣條
    [-Z - t / 2, Z + 0.01].forEach((z) => s.add(mesh(new THREE.BoxGeometry(X * 2 + 2 * t, 0.05, 0.07), accent, 0, T, z)));
    [-1, 1].forEach((sd) => s.add(mesh(new THREE.BoxGeometry(0.07, 0.05, Z * 2 + 0.1), accent, sd * (X + t / 2), T, 0)));

    // 紙棉墊料：側面＋起伏的表面＋碎屑
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
      c.setHSL(0.1, 0.35 + Math.random() * 0.15, 0.85 + Math.random() * 0.08);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    top.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    top.computeVertexNormals();
    s.add(mesh(top, std(0xffffff, { vertexColors: true, roughness: 1 }), 0, 0, 0, { cast: false }));
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

  buildBars() {
    const s = this.scene;
    const { x: X, z: Z, top: TOP, baseTop: T } = W;
    const metal = std(0xf6f6f6, { roughness: 0.25, metalness: 0.35 });
    const metalSee = std(0xf6f6f6, { roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.28, depthWrite: false });
    const len = TOP - T;
    const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 5);
    const back = [];
    const front = [];
    const gap = 0.09;
    for (let x = -X; x <= X + 1e-3; x += gap) { back.push([x, -Z - 0.02]); front.push([x, Z + 0.02]); }
    for (let z = -Z + gap; z < Z - 1e-3; z += gap) { back.push([-X - 0.02, z]); back.push([X + 0.02, z]); }
    const inst = (list, mat, cast) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, z], i) => im.setMatrixAt(i, m.makeTranslation(x, T + len / 2, z)));
      im.castShadow = cast;
      s.add(im);
    };
    inst(back, metal, true);
    inst(front, metalSee, false);
    this.frontBarsMat = metalSee;
    // 屋頂鐵絲（半透明，不擋視線）
    const roofGeo = new THREE.CylinderGeometry(0.008, 0.008, Z * 2 + 0.04, 5);
    const roof = new THREE.InstancedMesh(roofGeo, metalSee, Math.floor((X * 2) / gap) + 1);
    const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    for (let i = 0; i < roof.count; i++) roof.setMatrixAt(i, rot.clone().setPosition(-X + i * gap, TOP, 0));
    s.add(roof);
    // 框架
    const frame = std(0xffffff, { roughness: 0.3, metalness: 0.4 });
    const rail = (w, d, x, y, z, see) => s.add(mesh(new THREE.BoxGeometry(w, 0.03, d), see ? metalSee : frame, x, y, z, { cast: !see }));
    [T + 0.05, 1.5, TOP].forEach((y) => {
      rail(X * 2 + 0.06, 0.03, 0, y, -Z - 0.02);
      rail(0.03, Z * 2 + 0.06, -X - 0.02, y, 0);
      rail(0.03, Z * 2 + 0.06, X + 0.02, y, 0);
      rail(X * 2 + 0.06, 0.03, 0, y, Z + 0.02, y !== TOP);
    });
    [[-X, -Z], [X, -Z], [-X, Z], [X, Z]].forEach(([x, z]) => {
      s.add(mesh(new THREE.BoxGeometry(0.035, len, 0.035), z > 0 ? metalSee : frame, x + Math.sign(x) * 0.02, T + len / 2, z + Math.sign(z) * 0.02, { cast: z < 0 }));
    });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 8, 32, Math.PI), frame);
    handle.position.set(0, TOP, 0);
    handle.rotation.y = Math.PI / 2;
    s.add(handle);
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
    // 背板上的造型孔（看得出在轉）
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
    // 沙子（中間微微隆起）
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
    this.bowl = new THREE.Group();
    const R = BOWL.r;
    const pts = [
      new THREE.Vector2(0.001, 0.03), new THREE.Vector2(R - 0.04, 0.03), new THREE.Vector2(R - 0.02, 0.1),
      new THREE.Vector2(R, 0.11), new THREE.Vector2(R + 0.02, 0.09), new THREE.Vector2(R - 0.01, 0.0), new THREE.Vector2(0.001, 0.0),
    ];
    this.bowl.add(mesh(new THREE.LatheGeometry(pts, 48), std(0xffc9a8, { roughness: 0.2, side: THREE.DoubleSide })));
    this.seeds = [];
    const seedMat = std(0x4b4038, { roughness: 0.5 });
    const pelletMat = std(0xc89b62, { roughness: 0.9 });
    const seedGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 18; i++) {
      const pellet = i % 3 === 0;
      const sd = new THREE.Mesh(seedGeo, pellet ? pelletMat : seedMat);
      if (pellet) sd.scale.set(0.022, 0.018, 0.022);
      else sd.scale.set(0.016, 0.01, 0.03);
      const a = i * 2.4;
      const rr = 0.02 + (i % 5) * 0.025;
      sd.position.set(Math.cos(a) * rr, 0.045 + (i % 3) * 0.01, Math.sin(a) * rr);
      sd.rotation.y = a;
      sd.visible = false;
      sd.castShadow = true;
      this.bowl.add(sd);
      this.seeds.push(sd);
    }
    this.bowl.position.set(BOWL.x, 0.005, BOWL.z);
    this.scene.add(this.bowl);
  }

  buildBottle() {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 24), glass, 0, 0, 0, { cast: false }));
    g.add(mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.38, 24), new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, -0.08, 0, { cast: false }));
    g.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 24), std(0x7fb6e8), 0, 0.29, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.08, 20), std(0x7fb6e8), 0, -0.31, 0));
    const spout = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3, 10), std(0xdadada, { metalness: 0.8, roughness: 0.25 }), 0.07, -0.44, 0);
    spout.rotation.z = 0.75;
    g.add(spout);
    const clip = mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 24), std(0xdadada, { metalness: 0.7, roughness: 0.3 }), 0, 0.1, 0);
    clip.rotation.x = Math.PI / 2;
    g.add(clip);
    g.position.set(-W.x + 0.13, 0.72, DRINK.z);
    this.scene.add(g);
  }

  buildUpstairs() {
    const s = this.scene;
    const wood = std(0xffffff, { map: woodTex('#d6a46c', 'rgba(115,65,25,', [2, 1]), roughness: 0.75 });
    const woodDark = std(0xffffff, { map: woodTex('#b9844e', 'rgba(90,50,20,'), roughness: 0.8 });
    const { x0, x1, z0, z1, y } = PLAT;
    // 二樓平台＋支柱
    s.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), wood, (x0 + x1) / 2, y - 0.03, (z0 + z1) / 2));
    s.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, y, 12), woodDark, x0 + 0.05, y / 2, z1 - 0.05));
    // 欄杆（梯子入口留空）
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
    const hw = 0.62;
    const hh = 0.42;
    const hd = 0.46;
    house.add(mesh(new THREE.BoxGeometry(hw, hh, 0.03), wood, 0, hh / 2, -hd / 2 + 0.015));
    [-1, 1].forEach((sd) => house.add(mesh(new THREE.BoxGeometry(0.03, hh, hd), wood, sd * (hw / 2 - 0.015), hh / 2, 0)));
    const shape = new THREE.Shape();
    shape.moveTo(-hw / 2, 0); shape.lineTo(hw / 2, 0); shape.lineTo(hw / 2, hh); shape.lineTo(-hw / 2, hh); shape.lineTo(-hw / 2, 0);
    const hole = new THREE.Path();
    hole.moveTo(-0.13, 0); hole.lineTo(0.13, 0); hole.lineTo(0.13, 0.14); hole.absarc(0, 0.14, 0.13, 0, Math.PI, false); hole.lineTo(-0.13, 0);
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
    const puff = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), std(0xffffff, { roughness: 1 }), 46);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rand(-0.1, 0.1);
      const rr = rand(NEST.r - 0.05, NEST.r + 0.03);
      const sz = rand(0.05, 0.085);
      m.compose(new THREE.Vector3(Math.cos(a) * rr, rand(0.03, 0.07), Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 0.75, sz));
      puff.setMatrixAt(i, m);
    }
    puff.castShadow = puff.receiveShadow = true;
    nest.add(puff);
    nest.add(mesh(new THREE.CylinderGeometry(NEST.r, NEST.r, 0.03, 32), std(0xfff6ef, { roughness: 1 }), 0, 0.015, 0));
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

    // 一樓：二樓下面的木頭隧道
    const log = new THREE.Group();
    const bark = std(0xffffff, { map: woodTex('#8a5a35', 'rgba(50,25,10,', [3, 1]), roughness: 0.95, side: THREE.DoubleSide });
    const outer = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 24, 1, true), bark);
    outer.rotation.z = Math.PI / 2;
    log.add(outer);
    [-1, 1].forEach((sd) => {
      const ring = mesh(new THREE.RingGeometry(0.13, 0.17, 24), std(0xd9b07a, { side: THREE.DoubleSide }), sd * 0.3, 0, 0);
      ring.rotation.y = Math.PI / 2;
      log.add(ring);
    });
    log.position.set(LOG.x, 0.15, LOG.z);
    s.add(log);
  }

  buildSandParticles() {
    this.sandN = 60;
    this.sandP = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), std(0xe2c99a, { roughness: 1 }), this.sandN);
    this.sandP.frustumCulled = false;
    this.particles = Array.from({ length: this.sandN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 0.01 }));
    this.scene.add(this.sandP);
    this.emitSand = 0;
  }

  /* ================= 相機 ================= */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  toggleCamera() {
    this.camMode = this.camMode === 'follow' ? 'overview' : 'follow';
    return this.camMode;
  }
  updateCamera(dt) {
    const p = this.ham.root.position;
    let tx, ty, tz, halfW;
    if (this.camMode === 'follow') {
      tx = clamp(p.x * 0.85, -1.1, 1.1);
      ty = 0.3 + p.y * 0.9;
      tz = clamp(p.z * 0.35, -0.3, 0.3);
      halfW = 1.05;
    } else {
      tx = 0; ty = 0.85; tz = 0; halfW = 2.1;
    }
    const k = 1 - Math.exp(-2.2 * dt);
    this.target.x += (tx - this.target.x) * k;
    this.target.y += (ty - this.target.y) * k;
    this.target.z += (tz - this.target.z) * k;
    this.camHalfW += (halfW - this.camHalfW) * k;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.min(11, Math.max(3.6, this.camHalfW / (tanH * this.camera.aspect)));
    const dir = this._v.set(0, 0.5, 0.86).normalize();
    // 跟隨模式時把前面的鐵絲淡掉，才看得清楚倉鼠
    this.frontBarsMat.opacity += ((this.camMode === 'follow' ? 0.06 : 0.22) - this.frontBarsMat.opacity) * k;
    this.camera.position.copy(this.target).addScaledVector(dir, dist);
    this.camera.lookAt(this.target);
  }

  /* ================= 點擊／螢幕座標 ================= */
  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  hitHamster(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.ham.root, true).length) return true;
    const c = this.toScreen(this.ham.rollG.localToWorld(new THREE.Vector3(0, 0.1, 0.05)));
    return Math.hypot(c.x - clientX, c.y - clientY) < 60;
  }
  headScreenPos() {
    return this.toScreen(this.ham.head.localToWorld(new THREE.Vector3(0, 0.42, 0)));
  }
  setLook(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -((clientY - r.top) / r.height) * 2 + 1;
    this.lookPoint.set(this.camera.position.x + x * 2.5, this.camera.position.y * 0.5 + y, this.camera.position.z);
  }

  /* ================= 行為 ================= */
  get sleeping() { return this.ham.sleeping; }
  get userBusy() { return this.mode === 'user'; }
  touch() { this.lastInteraction = performance.now(); }

  routine(kind, fn) {
    const tok = ++this.token;
    this.ham.cancel();
    this.mode = kind;
    this.emitSand = 0;
    this.seeds.forEach((sd) => (sd.visible = false));
    const step = async (p) => {
      await p;
      if (tok !== this.token) throw CANCEL;
    };
    const run = async () => {
      try {
        const h = this.ham;
        // 先收拾上一個動作留下的狀態
        if (h.sleeping) {
          h.sleeping = false;
          await step(h.wait(0.6));
          await step(h.groomFor(0.9));
        }
        if (this.rampTo) await this.finishRamp(step);
        if (this.inWheel) await this.exitWheel(step);
        if (this.inSand) await this.exitSand(step);
        await fn(step);
      } catch (e) {
        if (e !== CANCEL) console.error(e);
      } finally {
        if (tok === this.token) {
          this.mode = 'idle';
          this.ham.look = this.lookPoint;
          this.emitSand = 0;
          this.nextAuto = performance.now() + rand(800, 2800);
        }
      }
    };
    return run();
  }

  // ---- 移動與樓層 ----
  async walk(step, x, z, speed = 0.9) {
    const h = this.ham;
    const pts = route({ x: h.root.position.x, z: h.root.position.z }, { x, z }, this.level === 1 ? OBST1 : OBST2);
    for (const p of pts) await step(h.moveTo(p.x, p.z, speed));
  }
  async goLevel(step, lvl) {
    if (this.level === lvl) return;
    const h = this.ham;
    if (lvl === 2) {
      await this.walk(step, RAMP.x, RAMP.zBot + 0.05);
      await step(h.face(Math.PI));
      this.rampTo = 2;
      await step(h.climbTo(RAMP.x, PLAT.y, RAMP.zTop));
      this.rampTo = 0;
      this.level = 2;
      await step(h.moveTo(RAMP.x, RAMP.zTop - 0.2, 0.6));
    } else {
      await this.walk(step, RAMP.x, RAMP.zTop - 0.2);
      await step(h.moveTo(RAMP.x, RAMP.zTop - 0.02, 0.5));
      await step(h.face(0));
      this.rampTo = 1;
      await step(h.climbTo(RAMP.x, 0, RAMP.zBot + 0.05, 0.75));
      this.rampTo = 0;
      this.level = 1;
      await step(h.moveTo(RAMP.x - 0.3, RAMP.zBot - 0.05, 0.7));
    }
  }
  async finishRamp(step) {
    const lvl = this.rampTo;
    if (lvl === 2) await step(this.ham.climbTo(RAMP.x, PLAT.y, RAMP.zTop));
    else await step(this.ham.climbTo(RAMP.x, 0, RAMP.zBot + 0.05, 0.75));
    this.level = lvl;
    this.rampTo = 0;
  }
  async walkTo(step, lvl, x, z, speed) {
    await this.goLevel(step, lvl);
    await this.walk(step, x, z, speed);
  }
  randomSpot(lvl) {
    for (let i = 0; i < 40; i++) {
      if (lvl === 2) {
        const x = rand(PLAT.x0 + 0.25, RAMP.x - 0.25);
        const z = rand(-0.48, PLAT.z1 - 0.15);
        if (Math.hypot(x - HOUSE.x, z - HOUSE.z) > 0.4) return { x, z };
      } else {
        const under = Math.random() < 0.2;
        const x = under ? rand(0.3, 1.2) : rand(-1.6, 1.15);
        const z = under ? rand(-0.4, -0.2) : rand(-0.12, 0.95);
        if (OBST1.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 0.02)) return { x, z };
      }
    }
    return lvl === 2 ? { x: 0.9, z: -0.3 } : { x: 0.2, z: 0.1 };
  }

  // ---- 各種行為 ----
  async wander(step, lvl = this.level) {
    const h = this.ham;
    const n = 1 + Math.floor(Math.random() * 3);
    const slow = h.mood === 'sad' || h.mood === 'hungry';
    for (let i = 0; i < n; i++) {
      const p = this.randomSpot(lvl);
      await this.walkTo(step, lvl, p.x, p.z, slow ? 0.35 : rand(0.55, 0.95));
      const r = Math.random();
      if (r < 0.45) await step(h.sniff(rand(0.8, 1.6)));
      else if (r < 0.6) await step(h.wait(rand(0.6, 1.4)));
    }
    await step(h.face(rand(-0.5, 0.5)));
  }

  async wheelRun(step, dur) {
    const h = this.ham;
    h.look = null;
    await this.walkTo(step, 1, WHEEL.x, WHEEL.z + WHEEL.depth / 2 + 0.25);
    await step(h.face(Math.PI));
    await step(h.jumpTo(WHEEL.x, WHEEL.y - WHEEL.r + 0.015, WHEEL.z, 0.45));
    this.inWheel = true;
    await step(h.face(Math.PI / 2));
    await step(h.wait(dur, (t) => (h.runK = Math.min(1, t * 1.5))));
    h.runK = 0;
    await step(h.wait(0.6));
    await this.exitWheel(step);
  }
  async exitWheel(step) {
    this.ham.runK = 0;
    await step(this.ham.face(0));
    await step(this.ham.jumpTo(WHEEL.x, 0, WHEEL.z + WHEEL.depth / 2 + 0.25, 0.4));
    this.inWheel = false;
  }

  async sandBath(step, dur = 4) {
    const h = this.ham;
    h.look = null;
    await this.goLevel(step, 1);
    // 從最靠近的那一側進沙盆
    const dx = h.root.position.x - SAND.x;
    const dz = h.root.position.z - SAND.z;
    const d = Math.hypot(dx, dz) || 1;
    const ex = SAND.x + (dx / d) * (SAND.r + 0.2);
    const ez = clamp(SAND.z + (dz / d) * (SAND.r + 0.2), -0.6, W.z - 0.12);
    await this.walk(step, ex, ez);
    await step(h.faceTowards(SAND.x, SAND.z));
    await step(h.jumpTo(SAND.x, 0.085, SAND.z, 0.45));
    this.inSand = true;
    await step(h.sniff(0.8));
    this.emitSand = 1;
    await step(h.bathe(dur));
    this.emitSand = 0;
    await step(h.groomFor(1.2));
    await this.exitSand(step);
    await step(h.hops(2)); // 抖抖身上的沙
  }
  async exitSand(step) {
    this.emitSand = 0;
    await step(this.ham.face(0));
    await step(this.ham.jumpTo(SAND.x, 0, SAND.z + SAND.r + 0.2, 0.45));
    this.inSand = false;
  }

  async drinkWater(step) {
    const h = this.ham;
    h.look = null;
    await this.walkTo(step, 1, DRINK.x, DRINK.z);
    await step(h.face(-Math.PI / 2));
    await step(h.drink(rand(2, 3.2)));
  }

  async napSeq(step, dur) {
    const h = this.ham;
    h.look = null;
    await this.walkTo(step, 2, NEST.x, NEST.z, 0.6);
    await step(h.face(0.5));
    await step(h.groomFor(0.8));
    h.sleeping = true;
    await step(h.wait(dur));
    h.sleeping = false;
    await step(h.wait(0.6));
    await step(h.groomFor(1));
  }

  async feedSeq(step) {
    const h = this.ham;
    h.look = null;
    this.seeds.forEach((sd) => (sd.visible = true));
    await this.goLevel(step, 1);
    // 站在碗的後面吃，臉朝向鏡頭
    await this.walk(step, BOWL.x - 0.04, BOWL.z - 0.3);
    await step(h.faceTowards(BOWL.x, BOWL.z));
    let left = this.seeds.length;
    await step(h.eat(4, () => {
      for (let i = 0; i < 2 && left > 0; i++) this.seeds[--left].visible = false;
    }));
    this.seeds.forEach((sd) => (sd.visible = false));
    await step(h.hops(1));
    // 真的倉鼠會把頰囊裡的食物帶回窩裡藏起來
    if (Math.random() < 0.7) {
      await this.walkTo(step, 2, NEST.x - 0.05, NEST.z + 0.05, 0.8);
      await step(h.stash(1.8));
      await step(h.hops(1));
    }
  }

  // ---- 給 main.js 用 ----
  feed() { this.touch(); return this.routine('user', (step) => this.feedSeq(step)); }
  runWheel() { this.touch(); return this.routine('user', (step) => this.wheelRun(step, 6)); }
  bath() { this.touch(); this.cool.bath = performance.now(); return this.routine('user', (step) => this.sandBath(step, 4.5)); }
  putToSleep() { this.touch(); return this.routine('user', (step) => this.napSeq(step, 90)); }
  wake() { this.touch(); return this.routine('user', (step) => step(this.ham.hops(1))); }
  celebrate() {
    if (this.userBusy) return;
    this.routine('user', async (step) => { await step(this.ham.hops(2)); await step(this.ham.spin()); });
  }
  happyHop() {
    if (this.userBusy || this.sleeping) return;
    this.routine('auto', (step) => step(this.ham.hops(2)));
  }

  autoBehave(now) {
    const h = this.ham;
    const idleFor = now - this.lastInteraction;
    const sad = h.mood === 'sad' || h.mood === 'hungry';
    const r = Math.random();
    const A = (fn) => this.routine('auto', fn);
    if (idleFor > 45000 && r < (sad ? 0.5 : 0.3)) return A((step) => this.napSeq(step, rand(25, 50)));
    if (r < (sad ? 0.05 : 0.18)) return A((step) => this.wheelRun(step, rand(4, 9)));
    if (r < 0.28 && now - this.cool.bath > 60000) { this.cool.bath = now; return A((step) => this.sandBath(step, rand(3, 5))); }
    if (r < 0.36 && now - this.cool.drink > 40000) { this.cool.drink = now; return A((step) => this.drinkWater(step)); }
    if (r < 0.48) return A((step) => step(h.groomFor(rand(1.2, 2.2))));
    if (r < 0.56) return A((step) => step(h.rest(rand(2.5, 5))));
    if (r < 0.66) return A((step) => this.wander(step, this.level === 1 ? 2 : 1));
    if (r < 0.72) return A((step) => step(h.sniff(1.6)));
    return A((step) => this.wander(step));
  }

  /* ================= 每一幀 ================= */
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const h = this.ham;
    if (this.mode === 'idle' && now > this.nextAuto) this.autoBehave(now);
    if (!h.look && this.mode === 'idle') h.look = this.lookPoint;
    h.update(dt);

    // 滾輪（有慣性）
    this.wheelVel = THREE.MathUtils.damp(this.wheelVel, h.runK * 6.5, h.runK > 0 ? 3 : 1, dt);
    this.rotor.rotation.z -= this.wheelVel * dt;

    // 腳下的接觸陰影
    this.contact.visible = !this.inWheel && !this.rampTo && h.bathK < 0.5;
    this.contact.position.set(h.root.position.x, h.lift + 0.012 + (this.inSand ? 0.02 : 0), h.root.position.z);
    this.contact.rotation.z = h.heading;

    // 沙浴噴出來的沙子
    const P = this.particles;
    if (this.emitSand) {
      for (let i = 0; i < 2; i++) {
        const pt = P.find((x) => x.life <= 0);
        if (!pt) break;
        pt.p.set(h.root.position.x + rand(-0.12, 0.12), h.lift + 0.06, h.root.position.z + rand(-0.12, 0.12));
        pt.v.set(rand(-0.7, 0.7), rand(0.6, 1.3), rand(-0.7, 0.7));
        pt.life = rand(0.5, 0.9);
        pt.s = rand(0.008, 0.016);
      }
    }
    const mtx = this._m;
    P.forEach((pt, i) => {
      if (pt.life > 0) {
        pt.life -= dt;
        pt.v.y -= 4 * dt;
        pt.p.addScaledVector(pt.v, dt);
        if (pt.p.y < 0.07) pt.life = 0;
      }
      const sc = pt.life > 0 ? pt.s : 0;
      mtx.makeScale(sc, sc, sc).setPosition(pt.p);
      this.sandP.setMatrixAt(i, mtx);
    });
    this.sandP.instanceMatrix.needsUpdate = true;

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }
}
