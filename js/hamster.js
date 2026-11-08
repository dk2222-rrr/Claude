// 3D 小倉鼠：卡通手繪風（描邊＋色階光影），平常會站起來把小手放胸前
import * as THREE from 'three';

const TAN = new THREE.Color(0xe0a668);
const CREAM = new THREE.Color(0xfcefd9);
const PAW = 0xf6b7b0;
const EAR_IN = 0x8a7470;
const NOSE = 0xee979b;
const INK = 0x3a2a22;

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ---------- 卡通材質與描邊 ---------- */
const GRADIENT = (() => {
  const d = new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...extra });

// 反轉外殼描邊：沿法線往外推，厚度隨距離放大 → 螢幕上線條粗細固定
const OUTLINE_VS = `
uniform float thickness;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * thickness * max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const OUTLINE_FS = `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`;
const outlineCache = {};
function outlineMat(th) {
  if (!outlineCache[th]) {
    const c = new THREE.Color(INK);
    outlineCache[th] = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: th }, color: { value: new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(2.2) } },
      vertexShader: OUTLINE_VS,
      fragmentShader: OUTLINE_FS,
      side: THREE.BackSide,
    });
  }
  return outlineCache[th];
}
function ink(mesh, th = 0.0026) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(th));
  o.raycast = () => {};
  mesh.add(o);
  mesh.castShadow = true;
  return mesh;
}

function paint(geo, fn) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

const SPHERE = new THREE.SphereGeometry(1, 28, 20);
function blob(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(SPHERE, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

// 西洋梨／蛋形的身體
function bodyGeometry() {
  const pts = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * 0.7;
    const yc = 0.27;
    const h = y < yc ? 0.27 : 0.43;
    const u = (y - yc) / h;
    pts.push(new THREE.Vector2(Math.max(0.002, 0.37 * Math.sqrt(Math.max(0, 1 - u * u))), y));
  }
  const g = new THREE.LatheGeometry(pts, 48);
  g.scale(1, 1, 0.86);
  paint(g, (c, x, y, z, nx, ny, nz) => {
    let w = ss(0.0, 0.5, nz) * ss(0.62, 0.48, y);
    w = Math.max(w, ss(-0.3, -0.75, ny));
    c.copy(TAN).lerp(CREAM, w);
  });
  return g;
}

function headGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 30);
  g.scale(0.31, 0.27, 0.27);
  paint(g, (c, x, y, z, nx, ny, nz) => {
    const w = ss(0.0, -0.075, y) * ss(-0.4, 0.15, nz);
    c.copy(TAN).lerp(CREAM, w);
  });
  return g;
}

function tube(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 12, r, 5, false), mat);
}

export class Hamster {
  constructor() {
    const fur = toon(0xffffff, { vertexColors: true });
    const tan = toon(TAN);
    const cream = toon(CREAM);
    const pawMat = toon(PAW);
    const earIn = toon(EAR_IN);
    const noseMat = toon(NOSE);
    const black = new THREE.MeshBasicMaterial({ color: 0x1b1614 });
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inkLine = new THREE.MeshBasicMaterial({ color: INK });

    this.root = new THREE.Group();
    this.root.scale.setScalar(0.5);
    this.rollG = new THREE.Group();
    this.rollG.position.y = 0.3;
    this.root.add(this.rollG);
    this.pose = new THREE.Group();
    this.rollG.add(this.pose);
    this.parts = new THREE.Group();
    this.parts.position.y = -0.3;
    this.pose.add(this.parts);
    const P = this.parts;

    // 身體
    P.add(ink(new THREE.Mesh(bodyGeometry(), fur), 0.003));
    // 手臂（毛茸茸的小肉）
    [-1, 1].forEach((s) => {
      const arm = ink(blob(tan, 0.085, 0.14, 0.085, s * 0.215, 0.44, 0.17));
      arm.rotation.z = s * 0.45;
      arm.rotation.x = -0.35;
      P.add(arm);
    });
    // 小尾巴
    P.add(ink(blob(pawMat, 0.04, 0.035, 0.04, 0, 0.16, -0.3)));
    // 背上的毛尖
    [[0.24, 0.42, -0.18, -0.9], [0.27, 0.32, -0.16, -1.1], [-0.25, 0.38, -0.17, 0.95]].forEach(([x, y, z, rz]) => {
      const t = ink(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), tan), 0.002);
      t.position.set(x, y, z);
      t.rotation.z = rz;
      P.add(t);
    });

    // 頭
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.6, 0);
    P.add(this.headPivot);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.15, 0.02);
    this.headPivot.add(this.head);
    const H = this.head;
    H.add(ink(new THREE.Mesh(headGeometry(), fur), 0.003));

    // 頰囊（吃東西會鼓起來）
    this.cheeks = [-1, 1].map((s) => {
      const c = ink(blob(cream, 0.13, 0.1, 0.12, s * 0.18, -0.085, 0.11));
      c.userData.base = c.scale.clone();
      H.add(c);
      return c;
    });

    // 頭頂毛尖
    [[-0.05, 0.255, 0.02, 0.35], [0.02, 0.27, 0.03, -0.1], [0.08, 0.255, 0.0, -0.5]].forEach(([x, y, z, rz]) => {
      const t = ink(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 8), tan), 0.002);
      t.position.set(x, y, z);
      t.rotation.z = rz;
      H.add(t);
    });

    // 耳朵：外圈淺褐、內耳深灰褐
    this.ears = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.2, 0.19, -0.04);
      p.rotation.z = -s * 0.5;
      p.add(ink(blob(tan, 0.1, 0.1, 0.035, 0, 0.06, 0)));
      p.add(blob(earIn, 0.068, 0.068, 0.02, 0, 0.06, 0.022));
      p.userData.side = s;
      H.add(p);
      return p;
    });

    // 眼睛：大大的黑豆眼
    this.eyes = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.135, 0.03, 0.222);
      g.rotation.y = s * 0.45;
      g.add(blob(black, 0.046, 0.054, 0.03));
      g.add(blob(shine, 0.015, 0.018, 0.01, 0.012, 0.02, 0.026));
      H.add(g);
      return g;
    });

    // 鼻子＋小嘴
    this.nose = ink(blob(noseMat, 0.034, 0.024, 0.02, 0, -0.035, 0.258), 0.0018);
    H.add(this.nose);
    H.add(tube([[0, -0.055, 0.262], [0, -0.075, 0.258]], 0.0045, inkLine));
    H.add(tube([[-0.028, -0.09, 0.25], [-0.012, -0.08, 0.258], [0, -0.075, 0.259]], 0.0045, inkLine));
    H.add(tube([[0.028, -0.09, 0.25], [0.012, -0.08, 0.258], [0, -0.075, 0.259]], 0.0045, inkLine));

    // 鬍鬚
    this.whiskers = new THREE.Group();
    H.add(this.whiskers);
    [-1, 1].forEach((s) => {
      [[0.02, 0.04], [-0.01, -0.01], [-0.04, -0.06]].forEach(([y0, y1]) => {
        this.whiskers.add(tube([[s * 0.1, y0 - 0.03, 0.235], [s * 0.3, y1, 0.2], [s * 0.46, y1 - 0.02, 0.13]], 0.0035, inkLine));
      });
    });

    // 嘴巴前叼東西的位置
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0, -0.1, 0.26);
    H.add(this.mouth);

    // 後腳（粉紅小腳掌＋腳趾）與前掌（站起來時是小手）
    const footGeo = (len) => {
      const g = new THREE.Group();
      g.add(ink(blob(pawMat, 0.065, 0.03, len)));
      [-1, 0, 1].forEach((k) => g.add(ink(blob(pawMat, 0.02, 0.017, 0.022, k * 0.035, 0, len * 0.95), 0.0018)));
      return g;
    };
    this.feet = [-1, 1].map((s) => {
      const f = footGeo(0.085);
      f.userData.side = s;
      this.rollG.add(f);
      return f;
    });
    this.hands = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.add(ink(blob(pawMat, 0.05, 0.045, 0.045)));
      [-1, 1].forEach((k) => g.add(ink(blob(pawMat, 0.018, 0.02, 0.018, k * 0.022, -0.035, 0.02), 0.0018)));
      g.userData.side = s;
      this.rollG.add(g);
      return g;
    });

    this.root.traverse((o) => {
      if (o.isMesh && o.material.type !== 'ShaderMaterial') o.castShadow = true;
    });

    // 狀態
    this.heading = 0;
    this.mood = 'ok';
    this.t = 0;
    this.speed = 0;
    this.walk = 0;
    this.walkPhase = 0;
    this.quadK = 0; // 0 站著 1 四腳著地
    this.petT = 0;
    this.nextBlink = 2;
    this.blinkT = 0;
    this.hop = 0;
    this.lift = 0; // 所在高度（二樓、進滾輪、沙盆）
    this.slope = 0; // 爬坡角度
    this.loaf = false; // 趴著休息
    this.handsUp = false;
    this.nibble = false;
    this.groom = false;
    this.sleeping = false;
    this.sleepK = 0;
    this.bathing = false;
    this.bathK = 0;
    this.climbing = false;
    this.cheekFill = 0;
    this.cheekTarget = 0;
    this.cheekDrain = 0.1;
    this.runK = 0;
    this.queue = [];
    this.cur = null;
    this.look = null;
    this.nextTwitch = 1;
    this.twitchT = 0;
    this._v = new THREE.Vector3();
  }

  get busy() {
    return !!this.cur || this.queue.length > 0;
  }
  setMood(m) { this.mood = m; }

  /* ---- 任務 ---- */
  run(task) {
    return new Promise((res) => this.queue.push({ ...task, res }));
  }
  cancel() {
    const all = [this.cur, ...this.queue].filter(Boolean);
    this.cur = null;
    this.queue = [];
    this.speed = 0;
    all.forEach((t) => { t.end?.(); t.res(); });
  }
  moveTo(x, z, speed = 0.8) {
    return this.run({
      update: (dt) => {
        const dx = x - this.root.position.x;
        const dz = z - this.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.03) { this.speed = 0; return true; }
        const target = Math.atan2(dx, dz);
        this.heading += angleDiff(this.heading, target) * Math.min(1, dt * 12);
        const facing = Math.abs(angleDiff(this.heading, target)) < 0.5;
        this.speed = (facing ? speed : speed * 0.15) * Math.min(1, 0.3 + this.quadK);
        const step = Math.min(dist, this.speed * dt);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        return false;
      },
    });
  }
  // 沿斜坡爬上／爬下
  climbTo(x, y, z, speed = 0.7) {
    let from;
    let len;
    return this.run({
      start: () => {
        from = { x: this.root.position.x, y: this.lift, z: this.root.position.z };
        len = Math.hypot(x - from.x, y - from.y, z - from.z) || 1;
        this.climbing = true;
        const run = Math.hypot(x - from.x, z - from.z) || 1;
        this.slope = Math.atan2(y - from.y, run);
      },
      update: (dt, t) => {
        const k = Math.min(1, (t * speed) / len);
        this.speed = speed;
        this.root.position.x = lerp(from.x, x, k);
        this.root.position.z = lerp(from.z, z, k);
        this.lift = lerp(from.y, y, k);
        return k >= 1;
      },
      end: () => { this.climbing = false; this.slope = 0; this.speed = 0; },
    });
  }
  face(angle) {
    return this.run({
      update: (dt) => {
        const d = angleDiff(this.heading, angle);
        this.heading += d * Math.min(1, dt * 10);
        return Math.abs(d) < 0.03;
      },
    });
  }
  faceTowards(x, z) {
    return this.run({
      update: (dt) => {
        const a = Math.atan2(x - this.root.position.x, z - this.root.position.z);
        const d = angleDiff(this.heading, a);
        this.heading += d * Math.min(1, dt * 10);
        return Math.abs(d) < 0.03;
      },
    });
  }
  jumpTo(x, y, z, dur = 0.45) {
    let from;
    return this.run({
      start: () => (from = { x: this.root.position.x, y: this.lift, z: this.root.position.z }),
      update: (dt, t) => {
        const k = Math.min(1, t / dur);
        this.root.position.x = lerp(from.x, x, k);
        this.root.position.z = lerp(from.z, z, k);
        this.lift = lerp(from.y, y, k) + Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) this.lift = y;
        return k >= 1;
      },
    });
  }
  wait(sec, onUpdate) {
    return this.run({ update: (dt, t) => (onUpdate?.(t, dt), t >= sec) });
  }
  eat(sec, onBite) {
    let bites = 0;
    return this.run({
      start: () => { this.handsUp = true; this.nibble = true; },
      update: (dt, t) => {
        const b = Math.floor(t / 0.5);
        if (b > bites) { bites = b; onBite?.(b); this.cheekTarget = Math.min(1, this.cheekTarget + 0.15); }
        return t >= sec;
      },
      end: () => { this.handsUp = false; this.nibble = false; },
    });
  }
  drink(sec) {
    return this.run({
      start: () => { this.nibble = true; this.drinking = true; },
      update: (dt, t) => t >= sec,
      end: () => { this.nibble = false; this.drinking = false; },
    });
  }
  groomFor(sec) {
    return this.run({
      start: () => { this.handsUp = true; this.groom = true; },
      update: (dt, t) => t >= sec,
      end: () => { this.handsUp = false; this.groom = false; },
    });
  }
  // 把頰囊裡的食物吐出來藏好
  stash(sec = 1.6) {
    return this.run({
      start: () => { this.handsUp = true; this.groom = true; this.cheekDrain = 0.9; },
      update: (dt, t) => t >= sec,
      end: () => { this.handsUp = false; this.groom = false; this.cheekDrain = 0.1; },
    });
  }
  sniff(sec = 1.2) {
    return this.run({
      start: () => (this.sniffing = true),
      update: (dt, t) => t >= sec,
      end: () => (this.sniffing = false),
    });
  }
  rest(sec) {
    return this.run({
      start: () => (this.loaf = true),
      update: (dt, t) => t >= sec,
      end: () => (this.loaf = false),
    });
  }
  bathe(sec, onUpdate) {
    return this.run({
      start: () => (this.bathing = true),
      update: (dt, t) => (onUpdate?.(t, dt), t >= sec),
      end: () => (this.bathing = false),
    });
  }
  hops(n = 2) {
    return this.run({
      update: (dt, t) => {
        const k = t / 0.3;
        this.hop = Math.sin((k % 1) * Math.PI) * 0.1;
        if (k >= n) { this.hop = 0; return true; }
        return false;
      },
    });
  }
  spin() {
    const from = this.heading;
    return this.run({
      update: (dt, t) => {
        const k = Math.min(1, t / 0.8);
        this.heading = from + k * Math.PI * 2;
        this.hop = Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) { this.heading = from; this.hop = 0; return true; }
        return false;
      },
    });
  }
  petted() { this.petT = 1.2; }

  /* ---- 每一幀 ---- */
  update(dt) {
    this.t += dt;
    const t = this.t;
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift();
      this.cur.t = 0;
      this.cur.start?.();
    }
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.update(dt, this.cur.t)) {
        const c = this.cur;
        this.cur = null;
        c.end?.();
        c.res();
      }
    } else this.speed = 0;

    const m = this.mood;
    const sad = m === 'sad' || m === 'hungry';
    const petting = this.petT > 0;
    if (petting) this.petT -= dt;
    this.sleepK = damp(this.sleepK, this.sleeping ? 1 : 0, 3, dt);
    this.bathK = damp(this.bathK, this.bathing ? 1 : 0, 6, dt);
    const sk = this.sleepK;

    // 站姿 ↔ 四腳著地
    const moving = this.speed > 0.05 || this.runK > 0.1;
    const wantQuad = moving || this.climbing || this.sleeping || this.bathing || this.loaf || (sad && !this.handsUp && !this.drinking);
    this.quadK = damp(this.quadK, wantQuad ? 1 : 0, moving ? 14 : 7, dt);
    const q = this.quadK;

    // 小碎步
    const stepSpeed = this.runK > 0.1 ? 3 * this.runK : this.speed;
    this.walk = damp(this.walk, moving ? 1 : 0, 14, dt);
    this.walkPhase += dt * (8 + stepSpeed * 22);
    const sw = Math.sin(this.walkPhase);
    const cw = Math.cos(this.walkPhase);

    // 身體姿勢
    const breathe = Math.sin(t * (sk > 0.5 ? 1.5 : 3.2)) * (0.012 + sk * 0.02);
    this.root.rotation.y = this.heading;
    this.root.position.y = this.lift + this.hop * 0.5;
    this.rollG.rotation.x = -this.slope;
    const roll = this.bathK * Math.sin(t * 3.6) * 1.25;
    this.rollG.rotation.z = roll + (petting ? Math.sin(t * 16) * 0.06 : 0);
    this.rollG.position.y = 0.3 - this.bathK * 0.08;
    const theta = q * (1.3 + sk * 0.15) - (this.drinking ? 0.25 : 0);
    this.pose.rotation.x = theta;
    this.pose.position.y = q * 0.07 - sk * 0.05 + Math.abs(sw) * 0.02 * this.walk;
    this.parts.scale.set(1 + breathe + sk * 0.06, 1 - breathe * 0.4 - sk * 0.12, 1 + sk * 0.04);
    this.pose.updateMatrix();

    // 頭
    let pitch = sad ? 0.25 : 0;
    if (this.nibble) pitch = 0.2 + Math.sin(t * 22) * 0.05;
    if (this.drinking) pitch = -0.5 + Math.sin(t * 14) * 0.04;
    if (this.groom) pitch = 0.3 + Math.sin(t * 7) * 0.08;
    if (this.climbing) pitch = this.slope * 0.6;
    pitch = lerp(pitch, 0.55, sk);
    let yaw = 0;
    if (this.sniffing) yaw = Math.sin(t * 2.2) * 0.6;
    else if (this.look && !moving && !this.nibble && sk < 0.1 && this.bathK < 0.1) {
      const lp = this.root.worldToLocal(this._v.copy(this.look));
      yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(lp.x, Math.max(0.3, lp.z))));
    }
    this.headPivot.rotation.x = damp(this.headPivot.rotation.x, -theta * 0.92 + pitch, 9, dt);
    this.headPivot.rotation.y = damp(this.headPivot.rotation.y, yaw, 6, dt);
    this.headPivot.rotation.z = damp(this.headPivot.rotation.z, petting ? Math.sin(t * 8) * 0.15 : 0, 5, dt);

    // 手：胸前 ↔ 嘴邊 ↔ 地上
    const handUp = this.handsUp ? 1 : 0;
    this.handUpK = damp(this.handUpK || 0, handUp, 10, dt);
    this.hands.forEach((hd) => {
      const s = hd.userData.side;
      const rub = this.groom ? Math.sin(t * 14 + s) * 0.04 : 0;
      const nib = this.nibble ? Math.sin(t * 22) * 0.01 : 0;
      const chest = this._v.set(s * 0.085, 0.115, 0.29).applyMatrix4(this.pose.matrix);
      const cx = lerp(chest.x, s * 0.05, this.handUpK);
      const cy = lerp(chest.y, chest.y + 0.2 + rub + nib, this.handUpK);
      const cz = lerp(chest.z, chest.z + 0.05, this.handUpK);
      const step = sw * s * 0.07 * this.walk;
      hd.position.set(
        lerp(cx, s * 0.12, q),
        lerp(cy, -0.27 + Math.max(0, -sw * s) * 0.04 * this.walk, q),
        lerp(cz, 0.3 + step, q),
      );
      hd.rotation.x = lerp(-0.4, 0, q);
    });
    this.feet.forEach((f) => {
      const s = f.userData.side;
      const step = -sw * s * 0.07 * this.walk;
      f.position.set(
        lerp(s * 0.15, s * 0.17, q),
        -0.27 + Math.max(0, sw * s) * 0.04 * this.walk + (1 - q) * 0.0,
        lerp(0.13, -0.2 + step, q),
      );
      f.rotation.y = s * lerp(0.35, 0.1, q);
    });

    // 耳朵
    if (t > this.nextTwitch) { this.twitchT = 0.18; this.twitchSide = Math.random() < 0.5 ? -1 : 1; this.nextTwitch = t + 1.5 + Math.random() * 3; }
    if (this.twitchT > 0) this.twitchT -= dt;
    this.ears.forEach((e) => {
      const s = e.userData.side;
      const flat = Math.max(sad ? 0.5 : 0, sk, this.bathK * 0.6);
      const tw = this.twitchT > 0 && s === this.twitchSide ? 0.35 : 0;
      e.rotation.x = damp(e.rotation.x, -flat * 0.9 - tw, 12, dt);
      e.rotation.z = damp(e.rotation.z, -s * (0.5 + flat * 0.3), 8, dt);
    });

    // 眼睛
    if (t > this.nextBlink) { this.blinkT = 0.12; this.nextBlink = t + 2 + Math.random() * 3; }
    if (this.blinkT > 0) this.blinkT -= dt;
    let eyeY = this.blinkT > 0 ? 0.1 : sad ? 0.7 : 1;
    if (petting || this.groom || this.bathK > 0.5) eyeY = 0.15;
    if (sk > 0.3) eyeY = 0.1;
    this.eyes.forEach((e) => (e.scale.y = damp(e.scale.y, eyeY, 25, dt)));

    // 鼻子嗅嗅、鬍鬚抖抖
    const sniffAmt = this.sniffing ? 1 : 0.35;
    this.nose.scale.y = 0.024 * (1 + Math.max(0, Math.sin(t * 18)) * 0.25 * sniffAmt);
    this.whiskers.rotation.x = Math.sin(t * 18) * 0.03 * sniffAmt;

    // 頰囊
    if (!this.nibble) this.cheekTarget = Math.max(0, this.cheekTarget - dt * this.cheekDrain);
    this.cheekFill = damp(this.cheekFill, this.cheekTarget, 5, dt);
    this.cheeks.forEach((c) => {
      const k = 1 + this.cheekFill * 0.7;
      c.scale.set(c.userData.base.x * k, c.userData.base.y * (1 + this.cheekFill * 0.45), c.userData.base.z * (1 + this.cheekFill * 0.3));
    });
  }
}
