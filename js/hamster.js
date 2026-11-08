// 3D 小倉鼠：卡通手繪風（描邊＋色階光影）。動作由 sim.js 算出的姿勢驅動。
import * as THREE from 'three';

export const PALETTES = {
  golden: { label: '黃金鼠', fur: 0xe0a668, cream: 0xfcefd9, earIn: 0x8a7470, paw: 0xf6b7b0 },
  white: { label: '奶油白', fur: 0xf6eee4, cream: 0xffffff, earIn: 0xe3aeb2, paw: 0xf7c2bc },
  gray: { label: '銀灰鼠', fur: 0xa7a3a6, cream: 0xf3f0ec, earIn: 0x5d5558, paw: 0xf2b8b2 },
  choco: { label: '巧克力', fur: 0x9d6c4b, cream: 0xf6e6cf, earIn: 0x5a3e33, paw: 0xeeaea6 },
};
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
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...extra });

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
export function ink(mesh, th = 0.0026) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(th));
  o.raycast = () => {};
  o.userData.outline = true;
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

function bodyGeometry(fur, cream) {
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
    c.copy(fur).lerp(cream, w);
  });
  return g;
}
function headGeometry(fur, cream) {
  const g = new THREE.SphereGeometry(1, 40, 30);
  g.scale(0.31, 0.27, 0.27);
  paint(g, (c, x, y, z, nx, ny, nz) => {
    const w = ss(0.0, -0.075, y) * ss(-0.4, 0.15, nz);
    c.copy(fur).lerp(cream, w);
  });
  return g;
}
function tube(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 12, r, 5, false), mat);
}

export class Hamster {
  constructor(paletteName = 'golden') {
    const pal = PALETTES[paletteName] || PALETTES.golden;
    const FUR = new THREE.Color(pal.fur);
    const CREAM = new THREE.Color(pal.cream);
    const fur = toon(0xffffff, { vertexColors: true });
    const tan = toon(FUR);
    const cream = toon(CREAM);
    const pawMat = toon(pal.paw);
    const earIn = toon(pal.earIn);
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

    P.add(ink(new THREE.Mesh(bodyGeometry(FUR, CREAM), fur), 0.003));
    [-1, 1].forEach((s) => {
      const arm = ink(blob(tan, 0.085, 0.14, 0.085, s * 0.215, 0.44, 0.17));
      arm.rotation.z = s * 0.45;
      arm.rotation.x = -0.35;
      P.add(arm);
    });
    P.add(ink(blob(pawMat, 0.04, 0.035, 0.04, 0, 0.16, -0.3)));
    [[0.24, 0.42, -0.18, -0.9], [0.27, 0.32, -0.16, -1.1], [-0.25, 0.38, -0.17, 0.95]].forEach(([x, y, z, rz]) => {
      const t = ink(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), tan), 0.002);
      t.position.set(x, y, z);
      t.rotation.z = rz;
      P.add(t);
    });

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.6, 0);
    P.add(this.headPivot);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.15, 0.02);
    this.headPivot.add(this.head);
    const H = this.head;
    H.add(ink(new THREE.Mesh(headGeometry(FUR, CREAM), fur), 0.003));
    this.cheeks = [-1, 1].map((s) => {
      const c = ink(blob(cream, 0.13, 0.1, 0.12, s * 0.18, -0.085, 0.11));
      c.userData.base = c.scale.clone();
      H.add(c);
      return c;
    });
    [[-0.05, 0.255, 0.02, 0.35], [0.02, 0.27, 0.03, -0.1], [0.08, 0.255, 0.0, -0.5]].forEach(([x, y, z, rz]) => {
      const t = ink(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 8), tan), 0.002);
      t.position.set(x, y, z);
      t.rotation.z = rz;
      H.add(t);
    });
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
    this.eyes = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.135, 0.03, 0.222);
      g.rotation.y = s * 0.45;
      g.add(blob(black, 0.046, 0.054, 0.03));
      g.add(blob(shine, 0.015, 0.018, 0.01, 0.012, 0.02, 0.026));
      H.add(g);
      return g;
    });
    this.nose = ink(blob(noseMat, 0.034, 0.024, 0.02, 0, -0.035, 0.258), 0.0018);
    H.add(this.nose);
    H.add(tube([[0, -0.055, 0.262], [0, -0.075, 0.258]], 0.0045, inkLine));
    H.add(tube([[-0.028, -0.09, 0.25], [-0.012, -0.08, 0.258], [0, -0.075, 0.259]], 0.0045, inkLine));
    H.add(tube([[0.028, -0.09, 0.25], [0.012, -0.08, 0.258], [0, -0.075, 0.259]], 0.0045, inkLine));
    this.whiskers = new THREE.Group();
    H.add(this.whiskers);
    [-1, 1].forEach((s) => {
      [[0.02, 0.04], [-0.01, -0.01], [-0.04, -0.06]].forEach(([y0, y1]) => {
        this.whiskers.add(tube([[s * 0.1, y0 - 0.03, 0.235], [s * 0.3, y1, 0.2], [s * 0.46, y1 - 0.02, 0.13]], 0.0035, inkLine));
      });
    });

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
    // 兩手中間：捧著食物的位置
    this.holdPoint = new THREE.Object3D();
    this.rollG.add(this.holdPoint);

    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.outline) o.castShadow = true;
    });

    // 動畫狀態
    this.heading = 0;
    this.pos = new THREE.Vector3();
    this.inited = false;
    this.t = Math.random() * 10;
    this.walk = 0;
    this.walkPhase = 0;
    this.quadK = 0;
    this.handUpK = 0;
    this.sleepK = 0;
    this.bathK = 0;
    this.runK = 0;
    this.cheekFill = 0;
    this.cheekTarget = 0;
    this.nextBlink = 2;
    this.blinkT = 0;
    this.nextTwitch = 1;
    this.twitchT = 0;
    this.slope = 0;
    this.f = {}; // 本幀的姿勢旗標
    this.look = null;
    this._v = new THREE.Vector3();
  }

  // p：sim.poseAt() 的結果
  drive(p, dt) {
    const target = this._v.set(p.pos.x, p.pos.y, p.pos.z);
    if (!this.inited || this.pos.distanceTo(target) > 0.9) {
      this.pos.copy(target);
      this.inited = true;
      if (p.heading != null) this.heading = p.heading;
    } else {
      const k = 1 - Math.exp(-16 * dt);
      this.pos.lerp(target, k);
    }
    const kind = p.kind;
    let wantHeading = p.heading;
    const f = (this.f = {
      kind,
      k: p.k,
      moving: kind === 'move' && p.speed > 0.02,
      speed: kind === 'move' ? p.speed : 0,
      climbing: p.mode === 'climb',
      creeping: p.mode === 'creep',
      jumping: p.mode === 'jump',
      handsUp: kind === 'groom' || kind === 'eat' || kind === 'stash',
      groom: kind === 'groom' || kind === 'stash',
      nibble: kind === 'eat' || kind === 'drink',
      drinking: kind === 'drink',
      sniffing: kind === 'sniff' || kind === 'peek' || kind === 'stand',
      tall: kind === 'stand',
      loaf: kind === 'loaf' || kind === 'hide' || kind === 'peek' || kind === 'dig' || kind === 'poop' || p.mode === 'creep',
      pooping: kind === 'poop',
      dig: kind === 'dig',
      sleeping: kind === 'sleep' || kind === 'nap',
      bathing: kind === 'bath',
      running: kind === 'wheelRun',
      happy: kind === 'happy',
      shake: kind === 'shake',
      squeeze: p.place === 'tunnel', // 在隧道裡壓低身體
    });
    // 開心：連跳三下＋轉一圈
    let hop = 0;
    if (f.happy) {
      hop = Math.abs(Math.sin(p.k * Math.PI * 3)) * 0.1;
      if (wantHeading != null) wantHeading += ss(0.3, 0.8, p.k) * Math.PI * 2;
    }
    if (f.shake) hop = Math.abs(Math.sin(p.k * Math.PI * 4)) * 0.05;
    if (kind === 'arrive') hop = (1 - p.k) * (1 - p.k) * 0.9;
    this.hop = hop;
    if (wantHeading != null) {
      if (f.happy) this.heading = this.heading + angleDiff(this.heading, wantHeading) * Math.min(1, dt * 20);
      else this.heading += angleDiff(this.heading, wantHeading) * Math.min(1, dt * 10);
    }
    this.slope = damp(this.slope, p.slope || 0, 10, dt);
    if (kind === 'eat' && p.foodKind === 'kibble') this.cheekTarget = Math.min(1, p.k * 1.3);
    if (kind === 'stash') this.cheekTarget = 0;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const f = this.f;
    const petting = (this.petT || 0) > 0;
    if (petting) this.petT -= dt;
    this.sleepK = damp(this.sleepK, f.sleeping ? 1 : 0, 3, dt);
    this.bathK = damp(this.bathK, f.bathing ? 1 : 0, 6, dt);
    this.runK = damp(this.runK, f.running ? 1 : 0, 5, dt);
    const sk = this.sleepK;

    const moving = f.moving || this.runK > 0.1 || f.dig;
    const wantQuad = moving || f.climbing || f.sleeping || f.bathing || f.loaf || f.jumping;
    this.quadK = damp(this.quadK, wantQuad ? 1 : 0, moving ? 14 : 7, dt);
    const q = this.quadK;

    const stepSpeed = this.runK > 0.1 ? 3 * this.runK : f.dig ? 1.6 : f.speed || 0;
    this.walk = damp(this.walk, moving ? 1 : 0, 14, dt);
    this.walkPhase += dt * (8 + stepSpeed * 22);
    const sw = Math.sin(this.walkPhase);

    const breathe = Math.sin(t * (sk > 0.5 ? 1.5 : 3.2)) * (0.012 + sk * 0.02);
    this.root.position.set(this.pos.x, this.pos.y + (this.hop || 0), this.pos.z);
    this.root.rotation.y = this.heading;
    this.rollG.rotation.x = -this.slope;
    const roll = this.bathK * Math.sin(t * 3.6) * 1.25;
    const wiggle = petting ? Math.sin(t * 16) * 0.06 : f.shake ? Math.sin(t * 30) * 0.12 : 0;
    this.rollG.rotation.z = roll + wiggle;
    this.rollG.position.y = 0.3 - this.bathK * 0.08;
    const theta = (f.pooping ? -0.12 + Math.sin(t * 9) * 0.03 : 0) + q * (1.3 + sk * 0.15) - (f.drinking ? 0.25 : 0) - (f.tall ? 0.12 : 0) + (f.dig ? Math.sin(t * 18) * 0.05 : 0);
    this.pose.rotation.x = theta;
    this.pose.position.y = q * 0.07 - sk * 0.05 + Math.abs(sw) * 0.02 * this.walk + (f.tall ? 0.05 : 0);
    const tallS = f.tall ? 1.08 : 1;
    this.squeezeK = damp(this.squeezeK || 0, f.squeeze ? 1 : 0, 8, dt);
    const sq = this.squeezeK;
    this.parts.scale.set(1 + breathe + sk * 0.06 + sq * 0.05, (1 - breathe * 0.4 - sk * 0.12) * tallS, (1 + sk * 0.04) * (1 - sq * 0.18));
    this.pose.position.y -= sq * 0.06;
    this.pose.updateMatrix();

    // 頭
    let pitch = 0;
    if (f.nibble) pitch = 0.2 + Math.sin(t * 22) * 0.05;
    if (f.drinking) pitch = -0.5 + Math.sin(t * 14) * 0.04;
    if (f.groom) pitch = 0.3 + Math.sin(t * 7) * 0.08;
    if (f.climbing) pitch = this.slope * 0.6;
    if (f.dig) pitch = 0.35;
    if (f.tall) pitch = -0.35;
    pitch = lerp(pitch, 0.55, sk);
    pitch += (this.squeezeK || 0) * 0.45;
    let yaw = 0;
    if (f.sniffing) yaw = Math.sin(t * 2.2) * 0.6;
    else if (this.look && !moving && !f.nibble && sk < 0.1 && this.bathK < 0.1) {
      const lp = this.root.worldToLocal(this._v.copy(this.look));
      yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(lp.x, Math.max(0.3, lp.z))));
    }
    const happyTilt = f.happy || petting ? Math.sin(t * 8) * 0.15 : 0;
    this.headPivot.rotation.x = damp(this.headPivot.rotation.x, -theta * 0.92 + pitch, 9, dt);
    this.headPivot.rotation.y = damp(this.headPivot.rotation.y, yaw, 6, dt);
    this.headPivot.rotation.z = damp(this.headPivot.rotation.z, happyTilt, 5, dt);

    // 手：胸前 ↔ 嘴邊 ↔ 地上（挖土時兩手輪流扒）
    this.handUpK = damp(this.handUpK, f.handsUp ? 1 : 0, 10, dt);
    const holdP = new THREE.Vector3();
    this.hands.forEach((hd) => {
      const s = hd.userData.side;
      const rub = f.groom ? Math.sin(t * 14 + s) * 0.04 : 0;
      const nib = f.nibble ? Math.sin(t * 22) * 0.01 : 0;
      const chest = this._v.set(s * 0.085, 0.115, 0.29).applyMatrix4(this.pose.matrix);
      const cx = lerp(chest.x, s * 0.05, this.handUpK);
      const cy = lerp(chest.y, chest.y + 0.2 + rub + nib, this.handUpK);
      const cz = lerp(chest.z, chest.z + 0.05, this.handUpK);
      const dig = f.dig ? Math.sin(t * 20 + (s > 0 ? Math.PI : 0)) : 0;
      const step = sw * s * 0.07 * this.walk;
      hd.position.set(
        lerp(cx, s * 0.12, q),
        lerp(cy, -0.27 + Math.max(0, -sw * s) * 0.04 * this.walk + Math.max(0, dig) * 0.06, q),
        lerp(cz, 0.3 + step + dig * 0.05, q),
      );
      hd.rotation.x = lerp(-0.4, 0, q);
      holdP.add(hd.position);
    });
    this.holdPoint.position.copy(holdP.multiplyScalar(0.5)).add(this._v.set(0, 0.03, 0.05));
    this.feet.forEach((ft) => {
      const s = ft.userData.side;
      const step = -sw * s * 0.07 * this.walk;
      ft.position.set(lerp(s * 0.15, s * 0.17, q), -0.27 + Math.max(0, sw * s) * 0.04 * this.walk, lerp(0.13, -0.2 + step, q));
      ft.rotation.y = s * lerp(0.35, 0.1, q);
    });

    // 耳朵
    if (t > this.nextTwitch) { this.twitchT = 0.18; this.twitchSide = Math.random() < 0.5 ? -1 : 1; this.nextTwitch = t + 1.5 + Math.random() * 3; }
    if (this.twitchT > 0) this.twitchT -= dt;
    this.ears.forEach((e) => {
      const s = e.userData.side;
      const flat = Math.max(sk, this.bathK * 0.6, f.creeping || f.squeeze ? 0.9 : 0);
      const tw = this.twitchT > 0 && s === this.twitchSide ? 0.35 : 0;
      e.rotation.x = damp(e.rotation.x, -flat * 0.9 - tw, 12, dt);
      e.rotation.z = damp(e.rotation.z, -s * (0.5 + flat * 0.3), 8, dt);
    });

    // 眼睛
    if (t > this.nextBlink) { this.blinkT = 0.12; this.nextBlink = t + 2 + Math.random() * 3; }
    if (this.blinkT > 0) this.blinkT -= dt;
    let eyeY = this.blinkT > 0 ? 0.1 : 1;
    if (petting || f.groom || f.happy || this.bathK > 0.5) eyeY = 0.15;
    if (f.pooping) eyeY = 0.45;
    if (sk > 0.3) eyeY = 0.1;
    this.eyes.forEach((e) => (e.scale.y = damp(e.scale.y, eyeY, 25, dt)));

    const sniffAmt = f.sniffing ? 1 : 0.35;
    this.nose.scale.y = 0.024 * (1 + Math.max(0, Math.sin(t * 18)) * 0.25 * sniffAmt);
    this.whiskers.rotation.x = Math.sin(t * 18) * 0.03 * sniffAmt;

    // 頰囊（外觀用，各自慢慢消）
    if (!(f.kind === 'eat')) this.cheekTarget = Math.max(0, this.cheekTarget - dt * (f.kind === 'stash' ? 0.9 : 0.05));
    this.cheekFill = damp(this.cheekFill, this.cheekTarget, 5, dt);
    this.cheeks.forEach((c) => {
      const k = 1 + this.cheekFill * 0.7;
      c.scale.set(c.userData.base.x * k, c.userData.base.y * (1 + this.cheekFill * 0.45), c.userData.base.z * (1 + this.cheekFill * 0.3));
    });
  }

  petted() { this.petT = 1.2; }
}
