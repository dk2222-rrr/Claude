// 程式生成的 3D 小倉鼠（黃金鼠）：圓滾滾、會塞滿頰囊
import * as THREE from 'three';

const SPHERE = new THREE.SphereGeometry(1, 24, 18);
const GOLD = 0xf2ab62;
const CREAM = 0xfff6ea;

function blob(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(SPHERE, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Hamster {
  constructor() {
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.95 });
    const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 1 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1b1f, roughness: 0.3 });
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pink = new THREE.MeshStandardMaterial({ color: 0xffa3b5, roughness: 0.7 });
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, opacity: 0.4, depthWrite: false });

    this.root = new THREE.Group();
    this.root.scale.setScalar(0.72);
    // pose：以屁股為支點，站起來時往後仰
    this.pose = new THREE.Group();
    this.pose.position.z = -0.26;
    this.root.add(this.pose);
    this.body = new THREE.Group();
    this.body.position.z = 0.26;
    this.pose.add(this.body);
    const b = this.body;

    b.add(blob(gold, 0.3, 0.26, 0.36, 0, 0.28, 0));
    b.add(blob(cream, 0.25, 0.2, 0.3, 0, 0.19, 0.07)); // 白肚肚
    this.tailNub = blob(pink, 0.035, 0.03, 0.04, 0, 0.16, -0.36);
    b.add(this.tailNub);

    // 腳
    const footGeo = SPHERE;
    this.feet = [
      [0.1, 0.29, 1], [-0.1, 0.29, -1], [0.16, -0.16, -1], [-0.16, -0.16, 1],
    ].map(([x, z, ph]) => {
      const f = new THREE.Mesh(footGeo, pink);
      f.scale.set(0.055, 0.028, 0.075);
      f.position.set(x, 0.028, z);
      f.userData = { z, ph };
      b.add(f);
      return f;
    });
    // 小手（吃東西時舉起來）
    this.hands = [-1, 1].map((s) => {
      const h = blob(pink, 0.04, 0.035, 0.04, s * 0.09, 0.12, 0.38);
      h.userData.side = s;
      b.add(h);
      return h;
    });

    // 頭
    this.head = new THREE.Group();
    this.head.position.set(0, 0.33, 0.15);
    b.add(this.head);
    const h = this.head;
    h.add(blob(gold, 0.25, 0.23, 0.23, 0, 0.04, 0.1));
    h.add(blob(cream, 0.17, 0.13, 0.13, 0, -0.04, 0.26)); // 嘴巴白毛
    h.add(blob(pink, 0.026, 0.02, 0.02, 0, 0.02, 0.385)); // 鼻子
    // ω 嘴
    const smileGeo = new THREE.TorusGeometry(0.018, 0.005, 6, 14, Math.PI);
    [-1, 1].forEach((s) => {
      const sm = new THREE.Mesh(smileGeo, black);
      sm.rotation.z = Math.PI;
      sm.position.set(s * 0.018, -0.02, 0.385);
      h.add(sm);
    });
    // 門牙
    h.add(blob(shine, 0.012, 0.016, 0.006, -0.008, -0.05, 0.383));
    h.add(blob(shine, 0.012, 0.016, 0.006, 0.008, -0.05, 0.383));
    // 鬍鬚
    const wMat = new THREE.LineBasicMaterial({ color: 0x9a7b6a, transparent: true, opacity: 0.6 });
    [-1, 1].forEach((s) => {
      [0.03, 0, -0.03].forEach((dy, i) => {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(s * 0.1, -0.0 + dy * 0.5, 0.35),
          new THREE.Vector3(s * 0.26, dy * 2 + 0.01, 0.3 - i * 0.02),
        ]);
        h.add(new THREE.Line(g, wMat));
      });
    });
    // 頰囊（吃東西會鼓起來）
    this.cheeks = [-1, 1].map((s) => {
      const c = blob(cream, 0.11, 0.1, 0.1, s * 0.15, -0.05, 0.2);
      c.userData.base = c.scale.clone();
      h.add(c);
      return c;
    });
    // 眼睛
    this.eyes = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.1, 0.08, 0.3);
      g.add(blob(black, 0.042, 0.048, 0.03));
      g.add(blob(shine, 0.013, 0.016, 0.01, 0.012, 0.018, 0.026));
      h.add(g);
      return g;
    });
    // 腮紅
    [-1, 1].forEach((s) => {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), blush);
      c.position.set(s * 0.17, 0.0, 0.3);
      c.rotation.y = s * 0.55;
      h.add(c);
    });
    // 圓耳朵
    const earGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.025, 24);
    const innerGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.01, 20);
    this.ears = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.15, 0.22, 0.06);
      p.rotation.z = -s * 0.35;
      const e = new THREE.Mesh(earGeo, gold);
      e.rotation.x = Math.PI / 2;
      e.position.y = 0.05;
      p.add(e);
      const inner = new THREE.Mesh(innerGeo, pink);
      inner.rotation.x = Math.PI / 2;
      inner.position.set(0, 0.05, 0.016);
      p.add(inner);
      p.userData.side = s;
      h.add(p);
      return p;
    });

    // 嘴前叼東西的位置
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0, -0.06, 0.38);
    h.add(this.mouth);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    this.heading = 0;
    this.mood = 'ok';
    this.t = 0;
    this.speed = 0;
    this.walk = 0;
    this.walkPhase = 0;
    this.petT = 0;
    this.nextBlink = 2;
    this.blinkT = 0;
    this.hop = 0;
    this.lift = 0; // 額外的高度（進出滾輪）
    this.stand = 0; // 0 趴著 1 站起來
    this.standTarget = 0;
    this.nibble = false;
    this.groom = false;
    this.sleeping = false;
    this.sleepK = 0;
    this.cheekFill = 0;
    this.cheekTarget = 0;
    this.runK = 0; // 在滾輪上跑
    this.queue = [];
    this.cur = null;
    this.look = null;
    this.nextTwitch = 1;
    this.twitchT = 0;
  }

  get busy() {
    return !!this.cur || this.queue.length > 0;
  }
  setMood(m) { this.mood = m; }

  /* ---- 任務 ---- */
  run(task) {
    return new Promise((res) => this.queue.push({ ...task, res }));
  }
  // 中斷目前所有動作（呼叫端用 token 判斷要不要繼續）
  cancel() {
    const all = [this.cur, ...this.queue].filter(Boolean);
    this.cur = null;
    this.queue = [];
    this.speed = 0;
    all.forEach((t) => { t.end?.(); t.res(); });
  }
  moveTo(x, z, speed = 0.9) {
    return this.run({
      update: (dt) => {
        const dx = x - this.root.position.x;
        const dz = z - this.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.03) { this.speed = 0; return true; }
        const target = Math.atan2(dx, dz);
        this.heading += angleDiff(this.heading, target) * Math.min(1, dt * 12);
        const facing = Math.abs(angleDiff(this.heading, target)) < 0.5;
        this.speed = facing ? speed : speed * 0.2;
        const step = Math.min(dist, this.speed * dt);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        return false;
      },
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
  // 跳到某個位置（進出滾輪）
  jumpTo(x, y, z, dur = 0.45) {
    let from;
    return this.run({
      start: () => (from = { x: this.root.position.x, y: this.lift, z: this.root.position.z }),
      update: (dt, t) => {
        const k = Math.min(1, t / dur);
        this.root.position.x = lerp(from.x, x, k);
        this.root.position.z = lerp(from.z, z, k);
        this.lift = lerp(from.y, y, k) + Math.sin(k * Math.PI) * 0.18;
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
      start: () => { this.standTarget = 1; this.nibble = true; },
      update: (dt, t) => {
        const b = Math.floor(t / 0.5);
        if (b > bites) { bites = b; onBite?.(b); this.cheekTarget = Math.min(1, this.cheekTarget + 0.15); }
        return t >= sec;
      },
      end: () => { this.standTarget = 0; this.nibble = false; },
    });
  }
  groomFor(sec) {
    return this.run({
      start: () => { this.standTarget = 1; this.groom = true; },
      update: (dt, t) => t >= sec,
      end: () => { this.standTarget = 0; this.groom = false; },
    });
  }
  sniff(sec = 1.2) {
    return this.run({
      start: () => (this.standTarget = 0.6),
      update: (dt, t) => t >= sec,
      end: () => (this.standTarget = 0),
    });
  }
  hops(n = 2) {
    return this.run({
      update: (dt, t) => {
        const k = t / 0.32;
        this.hop = Math.sin((k % 1) * Math.PI) * 0.16;
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
        this.hop = Math.sin(k * Math.PI) * 0.2;
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
    const petting = this.petT > 0;
    if (petting) this.petT -= dt;
    const sad = m === 'sad' || m === 'hungry';
    this.sleepK = damp(this.sleepK, this.sleeping ? 1 : 0, 3, dt);
    const sk = this.sleepK;

    // 小碎步
    const moving = this.speed > 0.05 || this.runK > 0.1;
    const stepSpeed = this.runK > 0.1 ? 3.2 * this.runK : this.speed;
    this.walk = damp(this.walk, moving ? 1 : 0, 14, dt);
    this.walkPhase += dt * (6 + stepSpeed * 18);
    const sw = Math.sin(this.walkPhase);
    this.feet.forEach((f) => {
      f.position.z = f.userData.z + sw * 0.07 * f.userData.ph * this.walk;
      f.position.y = 0.028 + Math.max(0, sw * f.userData.ph) * 0.03 * this.walk;
    });

    // 身體
    const breatheSpeed = sk > 0.5 ? 1.4 : 3;
    const breathe = Math.sin(t * breatheSpeed) * (0.015 + sk * 0.02);
    this.root.rotation.y = this.heading;
    this.root.position.y = this.hop + this.lift;
    this.body.position.y = Math.abs(sw) * 0.025 * this.walk;
    this.body.scale.set(1 + breathe + sk * 0.08, 1 - breathe * 0.5 - sk * 0.16, 1 - sk * 0.05);
    this.body.rotation.z = damp(this.body.rotation.z, petting ? Math.sin(t * 16) * 0.07 : 0, 12, dt);

    this.stand = damp(this.stand, sk > 0.1 ? 0 : this.standTarget, 8, dt);
    this.pose.rotation.x = -this.stand * 0.55;

    // 手：吃東西／洗臉時舉到嘴邊
    const handUp = this.stand > 0.3;
    this.hands.forEach((hd) => {
      const s = hd.userData.side;
      const rub = this.groom ? Math.sin(t * 14 + s) * 0.03 : 0;
      const nib = this.nibble ? Math.sin(t * 20) * 0.008 : 0;
      hd.position.x = damp(hd.position.x, handUp ? s * 0.05 : s * 0.09, 10, dt);
      hd.position.y = damp(hd.position.y, handUp ? 0.3 + rub + nib : 0.12, 10, dt);
      hd.position.z = damp(hd.position.z, handUp ? 0.48 : 0.38, 10, dt);
    });

    // 頭
    let pitch = sad ? 0.2 : 0;
    if (this.nibble) pitch = 0.25 + Math.sin(t * 20) * 0.05;
    if (this.groom) pitch = 0.35 + Math.sin(t * 7) * 0.1;
    if (sk > 0.1) pitch = lerp(pitch, 0.35, sk);
    let yaw = 0;
    if (this.look && !moving && !this.nibble && sk < 0.1) {
      const lp = this.root.worldToLocal(this.look.clone());
      yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(lp.x, Math.max(0.3, lp.z))));
    }
    this.head.rotation.x = damp(this.head.rotation.x, pitch, 7, dt);
    this.head.rotation.y = damp(this.head.rotation.y, yaw, 6, dt);
    this.head.rotation.z = damp(this.head.rotation.z, petting ? Math.sin(t * 8) * 0.15 : 0, 5, dt);

    // 耳朵：偶爾抖一下，難過或睡覺時往後貼
    if (t > this.nextTwitch) { this.twitchT = 0.2; this.nextTwitch = t + 1.5 + Math.random() * 3; }
    if (this.twitchT > 0) this.twitchT -= dt;
    this.ears.forEach((e) => {
      const s = e.userData.side;
      const flat = Math.max(sad ? 0.6 : 0, sk);
      const tw = this.twitchT > 0 && e.userData.side === (Math.floor(t) % 2 ? 1 : -1) ? 0.3 : 0;
      e.rotation.x = damp(e.rotation.x, -flat * 0.9 - tw, 12, dt);
      e.rotation.z = damp(e.rotation.z, -s * (0.35 + flat * 0.3), 8, dt);
    });

    // 眼睛
    if (t > this.nextBlink) { this.blinkT = 0.12; this.nextBlink = t + 2 + Math.random() * 3; }
    if (this.blinkT > 0) this.blinkT -= dt;
    let eyeY = this.blinkT > 0 ? 0.1 : sad ? 0.7 : 1;
    if (petting || this.groom) eyeY = 0.15;
    if (sk > 0.3) eyeY = 0.08;
    this.eyes.forEach((e) => (e.scale.y = damp(e.scale.y, eyeY, 25, dt)));

    // 頰囊：吃完慢慢消下去
    if (!this.nibble) this.cheekTarget = Math.max(0, this.cheekTarget - dt * 0.12);
    this.cheekFill = damp(this.cheekFill, this.cheekTarget, 5, dt);
    this.cheeks.forEach((c) => {
      const k = 1 + this.cheekFill * 0.75;
      c.scale.set(c.userData.base.x * k, c.userData.base.y * (1 + this.cheekFill * 0.5), c.userData.base.z * k);
    });

    // 鼻子嗅嗅（尾巴也小小動）
    this.tailNub.position.x = Math.sin(t * 6) * 0.01;
  }
}
