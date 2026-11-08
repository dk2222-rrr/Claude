// 3D 場景：倉鼠籠（滾輪、小木屋、棉花窩、飼料碗、水瓶）與倉鼠的自主行為
import * as THREE from 'three';
import { Hamster } from './hamster.js';

const CANCEL = Symbol('cancel');
const rand = (a, b) => a + Math.random() * (b - a);

// 籠子內的重要位置
const W = { x: 1.2, z: 0.9 }; // 內部半寬、半深
const WHEEL = { x: -0.68, y: 0.62, z: -0.42, r: 0.5, depth: 0.42 };
const NEST = { x: 0.68, z: -0.12 };
const BOWL = { x: 0.72, z: 0.55 };

function softShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(120,80,40,0.38)');
  grd.addColorStop(1, 'rgba(120,80,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.target = new THREE.Vector3(0, 0.35, 0.1);
    this.camDist = 6;

    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0xf3dcc0, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1e0, 1.5);
    sun.position.set(2.5, 5, 3.5);
    s.add(sun);
    const rim = new THREE.DirectionalLight(0xd8e6ff, 0.5);
    rim.position.set(-3, 2, -3);
    s.add(rim);

    this.buildCage();
    this.buildWheel();
    this.buildHouseAndNest();
    this.buildBowl();

    this.shadowTex = softShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    this.hamShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), shadowMat);
    this.hamShadow.rotation.x = -Math.PI / 2;
    this.hamShadow.position.y = 0.012;
    s.add(this.hamShadow);

    this.ham = new Hamster();
    this.ham.root.position.set(0, 0, 0.3);
    s.add(this.ham.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.lookPoint = new THREE.Vector3(0, 1.2, 4);

    // 行為狀態
    this.token = 0;
    this.mode = 'idle'; // idle | auto | user
    this.inWheel = false;
    this.wheelVel = 0;
    this.nextAuto = performance.now() + 1500;
    this.lastInteraction = performance.now();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ---------------- 場景 ---------------- */
  buildCage() {
    const s = this.scene;
    // 桌面
    const table = new THREE.Mesh(new THREE.CircleGeometry(6, 48), std(0xf3dfc9, { roughness: 1 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.02;
    s.add(table);
    // 底盤
    const trayMat = std(0xffb7c9, { roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(W.x * 2 + 0.12, 0.06, W.z * 2 + 0.12), trayMat);
    base.position.y = -0.03;
    s.add(base);
    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trayMat);
      m.position.set(x, y, z);
      s.add(m);
    };
    wall(W.x * 2 + 0.12, 0.3, 0.06, 0, 0.15, -W.z - 0.03);
    wall(W.x * 2 + 0.12, 0.16, 0.06, 0, 0.08, W.z + 0.03);
    wall(0.06, 0.3, W.z * 2 + 0.12, -W.x - 0.03, 0.15, 0);
    wall(0.06, 0.3, W.z * 2 + 0.12, W.x + 0.03, 0.15, 0);
    // 木屑墊料
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W.x * 2, 0.02, W.z * 2), std(0xf9e6b8, { roughness: 1 }));
    bed.position.y = 0.005;
    s.add(bed);
    const flakeGeo = new THREE.BoxGeometry(0.07, 0.012, 0.035);
    const flakes = new THREE.InstancedMesh(flakeGeo, std(0xf0cf8c, { roughness: 1 }), 260);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < 260; i++) {
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
      m.compose(new THREE.Vector3(rand(-W.x + 0.05, W.x - 0.05), 0.02, rand(-W.z + 0.05, W.z - 0.05)), q, new THREE.Vector3(1, 1, 1).multiplyScalar(rand(0.6, 1.3)));
      flakes.setMatrixAt(i, m);
      flakes.setColorAt(i, c.setHSL(0.1 + Math.random() * 0.03, 0.7, 0.68 + Math.random() * 0.12));
    }
    s.add(flakes);

    // 鐵絲（只做後面和左右，前面不擋視線）
    const barMat = std(0xfafafa, { roughness: 0.3, metalness: 0.3 });
    const H = 1.9;
    const barGeo = new THREE.CylinderGeometry(0.011, 0.011, H - 0.3, 6);
    const bar = (x, z) => {
      const b = new THREE.Mesh(barGeo, barMat);
      b.position.set(x, 0.3 + (H - 0.3) / 2, z);
      s.add(b);
    };
    for (let x = -W.x; x <= W.x + 0.001; x += 0.12) bar(x, -W.z - 0.03);
    for (let z = -W.z; z <= W.z + 0.001; z += 0.12) { bar(-W.x - 0.03, z); bar(W.x + 0.03, z); }
    const rail = (len, x, y, z, rotY) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 8), barMat);
      r.rotation.z = Math.PI / 2;
      r.rotation.y = rotY;
      r.position.set(x, y, z);
      s.add(r);
    };
    [0.3, H].forEach((y) => {
      rail(W.x * 2 + 0.06, 0, y, -W.z - 0.03, 0);
      rail(W.z * 2 + 0.06, -W.x - 0.03, y, 0, Math.PI / 2);
      rail(W.z * 2 + 0.06, W.x + 0.03, y, 0, Math.PI / 2);
    });
    rail(W.x * 2 + 0.06, 0, H, W.z + 0.03, 0);

    // 水瓶（掛在右邊）
    const bottle = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 20), std(0xbfe3ff, { transparent: true, opacity: 0.6, roughness: 0.1 }));
    bottle.add(glass);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 20), std(0x8fcfff, { transparent: true, opacity: 0.75 }));
    water.position.y = -0.08;
    bottle.add(water);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 16), std(0x8ec5ff));
    cap.position.y = -0.29;
    bottle.add(cap);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), barMat);
    spout.position.set(-0.05, -0.38, 0);
    spout.rotation.z = -0.6;
    bottle.add(spout);
    bottle.position.set(W.x - 0.08, 0.9, 0.15);
    s.add(bottle);
  }

  buildWheel() {
    const g = new THREE.Group();
    g.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    const rotor = new THREE.Group();
    g.add(rotor);
    const rimMat = std(0x9fd4c7, { roughness: 0.4 });
    const rungMat = std(0xffffff, { roughness: 0.4 });
    const { r, depth } = WHEEL;
    [-depth / 2, depth / 2].forEach((z) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 10, 48), rimMat);
      rim.position.z = z;
      rotor.add(rim);
    });
    const rungGeo = new THREE.CylinderGeometry(0.012, 0.012, depth, 6);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const rung = new THREE.Mesh(rungGeo, rungMat);
      rung.rotation.x = Math.PI / 2;
      rung.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      rotor.add(rung);
    }
    // 背板輪輻
    const spokeGeo = new THREE.BoxGeometry(r * 2, 0.035, 0.02);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.z = (i / 3) * Math.PI;
      sp.position.z = -depth / 2;
      rotor.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), std(0xffd36e));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -depth / 2 - 0.02;
    g.add(hub);
    // 支架
    const legMat = std(0xffd36e, { roughness: 0.5 });
    [-1, 1].forEach((sd) => {
      const len = Math.hypot(WHEEL.y, 0.32);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 8), legMat);
      leg.position.set(sd * 0.16, -WHEEL.y / 2, -depth / 2 - 0.05);
      leg.rotation.z = sd * Math.atan2(0.32, WHEEL.y);
      g.add(leg);
    });
    this.wheel = g;
    this.rotor = rotor;
    this.scene.add(g);
  }

  buildHouseAndNest() {
    const s = this.scene;
    const house = new THREE.Group();
    const wood = std(0xd9a066, { roughness: 0.9 });
    const roofMat = std(0xff8f8f, { roughness: 0.7 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), wood);
    box.position.y = 0.21;
    house.add(box);
    [-1, 1].forEach((sd) => {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.5), roofMat);
      roof.position.set(sd * 0.17, 0.53, 0);
      roof.rotation.z = -sd * 0.6;
      house.add(roof);
    });
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), std(0x5a3a28));
    door.position.set(0, 0.17, 0.212);
    house.add(door);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), std(0xfff2b3));
    win.position.set(0.2, 0.3, 0.212);
    house.add(win);
    house.position.set(NEST.x + 0.05, 0, -W.z + 0.26);
    s.add(house);

    // 棉花窩
    const puff = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), std(0xffffff, { roughness: 1 }), 40);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + rand(-0.1, 0.1);
      const rr = rand(0.24, 0.32);
      const sz = rand(0.06, 0.1);
      m.compose(new THREE.Vector3(Math.cos(a) * rr, rand(0.03, 0.08), Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 0.8, sz));
      puff.setMatrixAt(i, m);
    }
    const nest = new THREE.Group();
    nest.add(puff);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 24), std(0xfff4f4, { roughness: 1 }));
    pad.position.y = 0.02;
    nest.add(pad);
    nest.position.set(NEST.x, 0, NEST.z);
    s.add(nest);
  }

  buildBowl() {
    this.bowl = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(0.13 + (i / 10) * 0.06, (i / 10) * 0.09));
    pts.push(new THREE.Vector2(0.17, 0.09), new THREE.Vector2(0.11, 0.015));
    this.bowl.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), std(0xffd36e, { roughness: 0.4, side: THREE.DoubleSide })));
    this.seeds = [];
    const seedMat = std(0x5b4a42, { roughness: 0.6 });
    const seedGeo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 14; i++) {
      const sd = new THREE.Mesh(seedGeo, seedMat);
      sd.scale.set(0.018, 0.012, 0.034);
      const a = i * 2.4;
      const r = 0.03 + (i % 4) * 0.028;
      sd.position.set(Math.cos(a) * r, 0.05 + (i % 3) * 0.012, Math.sin(a) * r);
      sd.rotation.y = a;
      sd.visible = false;
      this.bowl.add(sd);
      this.seeds.push(sd);
    }
    this.bowl.position.set(BOWL.x, 0.01, BOWL.z);
    this.scene.add(this.bowl);
  }

  /* ---------------- 相機 ---------------- */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 直式手機只看籠子中間一段，相機會跟著倉鼠
    const halfW = 0.95;
    this.camDist = Math.min(9, Math.max(4.4, halfW / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect)));
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const p = this.ham.root.position;
    const tx = THREE.MathUtils.clamp(p.x * 0.5, -0.5, 0.5);
    const tz = THREE.MathUtils.clamp(p.z * 0.3, -0.2, 0.25);
    this.target.x = THREE.MathUtils.damp(this.target.x, tx, 2, dt);
    this.target.z = THREE.MathUtils.damp(this.target.z, tz, 2, dt);
    const dir = new THREE.Vector3(0, 0.6, 0.8).normalize();
    this.camera.position.copy(this.target).addScaledVector(dir, this.camDist);
    this.camera.lookAt(this.target);
  }

  /* ---------------- 點擊與螢幕座標 ---------------- */
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
    // 倉鼠很小，給一點寬容範圍
    const c = this.toScreen(this.ham.root.localToWorld(new THREE.Vector3(0, 0.3, 0.1)));
    return Math.hypot(c.x - clientX, c.y - clientY) < 60;
  }
  headScreenPos() {
    return this.toScreen(this.ham.head.localToWorld(new THREE.Vector3(0, 0.38, 0.1)));
  }
  setLook(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -((clientY - r.top) / r.height) * 2 + 1;
    this.lookPoint.set(x * 2.5, 1 + y, 3);
  }

  /* ---------------- 行為 ---------------- */
  get sleeping() { return this.ham.sleeping; }
  get userBusy() { return this.mode === 'user'; }
  touch() { this.lastInteraction = performance.now(); }

  // 開始一段行為；會中斷正在進行的行為
  routine(kind, fn) {
    const tok = ++this.token;
    this.ham.cancel();
    this.mode = kind;
    const step = async (p) => {
      await p;
      if (tok !== this.token) throw CANCEL;
    };
    this.seeds.forEach((sd) => (sd.visible = false));
    const run = async () => {
      try {
        if (this.ham.sleeping) {
          this.ham.sleeping = false;
          await step(this.ham.wait(0.6));
          await step(this.ham.groomFor(0.9)); // 揉揉眼睛
        }
        if (this.inWheel) await this.exitWheel(step);
        await fn(step);
      } catch (e) {
        if (e !== CANCEL) console.error(e);
      } finally {
        if (tok === this.token) {
          this.mode = 'idle';
          this.ham.look = this.lookPoint;
          this.nextAuto = performance.now() + rand(1200, 3500);
        }
      }
    };
    return run();
  }

  async exitWheel(step) {
    this.ham.runK = 0;
    await step(this.ham.face(0));
    await step(this.ham.jumpTo(WHEEL.x, 0, WHEEL.z + 0.45, 0.4));
    this.inWheel = false;
  }

  async wheelRun(step, dur) {
    const h = this.ham;
    h.look = null;
    await step(h.moveTo(WHEEL.x, WHEEL.z + 0.45, 1.0));
    await step(h.face(Math.PI));
    await step(h.jumpTo(WHEEL.x, WHEEL.y - WHEEL.r + 0.02, WHEEL.z, 0.45));
    this.inWheel = true;
    await step(h.face(Math.PI / 2));
    await step(h.wait(dur, (t, dt) => (h.runK = Math.min(1, t * 1.5))));
    h.runK = 0;
    await step(h.wait(0.6));
    await this.exitWheel(step);
  }

  async wander(step) {
    const h = this.ham;
    const n = 1 + Math.floor(Math.random() * 3);
    const slow = h.mood === 'sad' || h.mood === 'hungry';
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = rand(-1.0, 1.0); z = rand(0.0, 0.72); } while (Math.hypot(x - BOWL.x, z - BOWL.z) < 0.35);
      await step(h.moveTo(x, z, slow ? 0.4 : rand(0.6, 1.1)));
      if (Math.random() < 0.6) await step(h.sniff(rand(0.6, 1.4)));
    }
    await step(h.face(rand(-0.4, 0.4)));
  }

  async napSeq(step, dur) {
    const h = this.ham;
    h.look = null;
    await step(h.moveTo(NEST.x, NEST.z, 0.6));
    await step(h.face(-0.3));
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
    this.seeds.forEach((s) => (s.visible = true));
    const dx = BOWL.x - h.root.position.x;
    const dz = BOWL.z - h.root.position.z;
    const d = Math.hypot(dx, dz) || 1;
    await step(h.moveTo(BOWL.x - (dx / d) * 0.34, BOWL.z - (dz / d) * 0.34, 1.0));
    await step(h.faceTowards(BOWL.x, BOWL.z));
    let left = this.seeds.length;
    await step(h.eat(3.5, () => {
      for (let i = 0; i < 2 && left > 0; i++) this.seeds[--left].visible = false;
    }));
    this.seeds.forEach((s) => (s.visible = false));
    await step(h.hops(1));
    await step(h.moveTo(0.1, 0.35, 0.7));
    await step(h.face(0));
    await step(h.hops(2));
  }

  // 給 main.js 用的動作
  feed() { this.touch(); return this.routine('user', (step) => this.feedSeq(step)); }
  runWheel() { this.touch(); return this.routine('user', (step) => this.wheelRun(step, 6)); }
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
    if (idleFor > 45000 && r < 0.35) return this.routine('auto', (step) => this.napSeq(step, rand(25, 50)));
    if (r < (sad ? 0.1 : 0.3)) return this.routine('auto', (step) => this.wheelRun(step, rand(4, 9)));
    if (r < 0.45) return this.routine('auto', (step) => step(h.groomFor(rand(1.2, 2.2))));
    if (r < 0.55) return this.routine('auto', (step) => step(h.sniff(1.5)));
    return this.routine('auto', (step) => this.wander(step));
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const h = this.ham;
    if (this.mode === 'idle' && now > this.nextAuto) this.autoBehave(now);
    if (!h.look && this.mode === 'idle') h.look = this.lookPoint;
    h.update(dt);

    // 滾輪轉動（有慣性）
    this.wheelVel = THREE.MathUtils.damp(this.wheelVel, h.runK * 7, h.runK > 0 ? 3 : 1.2, dt);
    this.rotor.rotation.z -= this.wheelVel * dt;

    this.hamShadow.visible = !this.inWheel && h.lift < 0.05;
    this.hamShadow.position.x = h.root.position.x;
    this.hamShadow.position.z = h.root.position.z;
    this.hamShadow.rotation.z = h.heading;
    const sc = 1 - h.hop * 1.5;
    this.hamShadow.scale.set(sc, sc, 1);

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }
}
