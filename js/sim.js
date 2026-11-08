// 確定性的倉鼠模擬：兩支手機用同一個種子＋同一串事件，算出一模一樣的動作。
// 只用 + - * / sqrt 與整數亂數，避免不同裝置的三角函數誤差影響決策。
//
// 一天的節奏（台灣時間）：08:00 在窩裡醒來 → 白天隨機活動（也會小睡）→ 21:00 回窩睡覺。
// 台灣 08:00 = UTC 00:00，21:00 = UTC 13:00。
import { WHEEL, SAND, DRINK, PLAT, RAMP, HOUSE, NEST, LOG, OB1, OB2, BOUNDS, BOWL, TOILET, levelY } from './layout.js';

export const DAY = 86400000;
export const NIGHT_OFF = 13 * 3600000;
export const dayAnchor = (t) => Math.floor(t / DAY) * DAY;
export const isNight = (t) => t - dayAnchor(t) >= NIGHT_OFF;
export const nightStartBefore = (anchor) => anchor - (DAY - NIGHT_OFF);

const PI = Math.PI;
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rnd(st) {
  st.s = (st.s + 0x6d2b79f5) >>> 0;
  let t = st.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (st, a, b) => a + rnd(st) * (b - a);
const d2 = (a, b) => { const dx = a.x - b.x; const dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); };
const d3 = (a, b) => { const dx = a.x - b.x; const dy = a.y - b.y; const dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const heading = (a, b) => Math.atan2(b.x - a.x, b.z - a.z); // 只用在畫面上的朝向
const clone = (o) => structuredClone(o);

// ---- 重要位置 ----
const TUN_Y = LOG.r - LOG.inner;
const P = {
  wheelFront: { x: WHEEL.x, y: 0, z: WHEEL.z + WHEEL.depth / 2 + 0.25 },
  wheelIn: { x: WHEEL.x, y: WHEEL.y - WHEEL.r + 0.015, z: WHEEL.z },
  sandEntry: { x: SAND.x, y: 0, z: SAND.z - SAND.r - 0.2 },
  sandIn: { x: SAND.x, y: 0.085, z: SAND.z },
  drink: { x: DRINK.x, y: 0, z: DRINK.z },
  logL: LOG.x - LOG.len / 2,
  logR: LOG.x + LOG.len / 2,
  logFront: { x: LOG.x, y: 0, z: LOG.z + LOG.r + 0.25 },
  logTop: { x: LOG.x, y: LOG.r * 2, z: LOG.z },
  rampBot: { x: RAMP.x, y: 0, z: RAMP.zBot + 0.06 },
  rampEdge: { x: RAMP.x, y: PLAT.y, z: RAMP.zTop },
  rampTopIn: { x: RAMP.x, y: PLAT.y, z: RAMP.zTop - 0.22 },
  houseDoor: { x: HOUSE.x, y: PLAT.y, z: HOUSE.z + HOUSE.d / 2 + 0.2 },
  houseIn: { x: HOUSE.x, y: PLAT.y, z: HOUSE.z - 0.03 },
};
export const NEST_SPOTS = [[-0.08, 0.03], [0.11, -0.06], [0.02, 0.13]].map(([dx, dz]) => ({ x: NEST.x + dx, y: PLAT.y + 0.03, z: NEST.z + dz }));
const ENCLOSED = new Set(['wheel', 'sand', 'log', 'tunnel', 'house']);
const ATOMIC = new Set(['eat', 'happy', 'stash', 'arrive', 'poop']);
export const POOP_DAYS = 3; // 大便最多留在籠子裡 3 天（今天＋前兩天）
export const HIDDEN_PLACES = new Set(['tunnel', 'house']);

const ACTS = [
  ['wander', 22], ['sit', 7], ['groom', 8], ['loaf', 6], ['stand', 5], ['dig', 6], ['wheel', 12], ['sand', 6],
  ['drink', 6], ['tunnel', 10], ['logTop', 5], ['house', 6], ['nap', 5], ['otherLevel', 8],
];
const ACT_TOTAL = ACTS.reduce((s, a) => s + a[1], 0);
const COOL = { sand: 90e3, drink: 60e3, nap: 150e3, wheel: 20e3, tunnel: 25e3, house: 40e3, logTop: 40e3, dig: 20e3 };
const LOCKED = new Set(['wheel', 'sand', 'drink', 'tunnel', 'logTop', 'house']);
export const EAT_SEC = { kibble: 4, seed: 3, fish: 4.5 };

function inObstacle(lvl, x, z, pad = 0, skip) {
  return (lvl === 1 ? OB1 : OB2).some((o) => o !== skip && d2(o, { x, z }) < o.r + pad);
}
function inBounds(lvl, x, z) {
  const b = BOUNDS[lvl];
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && !(lvl === 1 && x > RAMP.x - 0.26 && z > -0.2);
}

// 線段穿過障礙物就繞過去
function route(from, to, lvl) {
  const obs = lvl === 1 ? OB1 : OB2;
  const b = BOUNDS[lvl];
  const pts = [];
  let cur = { x: from.x, z: from.z };
  for (let iter = 0; iter < 4; iter++) {
    let hit = null;
    let bestT = Infinity;
    let hp = null;
    for (const o of obs) {
      if (d2(cur, o) < o.r || d2(to, o) < o.r) continue;
      const dx = to.x - cur.x;
      const dz = to.z - cur.z;
      const L2 = dx * dx + dz * dz || 1;
      const t = clamp(((o.x - cur.x) * dx + (o.z - cur.z) * dz) / L2, 0, 1);
      const p = { x: cur.x + dx * t, z: cur.z + dz * t };
      if (d2(p, o) < o.r && t < bestT) { bestT = t; hit = o; hp = p; }
    }
    if (!hit) break;
    let nx = hp.x - hit.x;
    let nz = hp.z - hit.z;
    let n = Math.sqrt(nx * nx + nz * nz);
    if (n < 1e-4) { nx = -(to.z - cur.z); nz = to.x - cur.x; n = Math.sqrt(nx * nx + nz * nz) || 1; }
    const wp = { x: clamp(hit.x + (nx / n) * (hit.r + 0.06), b.x0, b.x1), z: clamp(hit.z + (nz / n) * (hit.r + 0.06), b.z0, b.z1) };
    pts.push(wp);
    cur = wp;
  }
  pts.push({ x: to.x, z: to.z });
  return pts;
}

function randomSpot(st, lvl) {
  const b = BOUNDS[lvl];
  for (let i = 0; i < 30; i++) {
    const x = rr(st, b.x0, b.x1);
    const z = rr(st, b.z0, b.z1);
    if (inBounds(lvl, x, z) && !inObstacle(lvl, x, z, 0.04)) return { x, y: levelY(lvl), z };
  }
  return lvl === 2 ? { x: 1.0, y: PLAT.y, z: -0.3 } : { x: 0.1, y: 0, z: 0.1 };
}

// 吃東西時站的位置：盡量站在食物後面、臉朝鏡頭
function eatSpot(f) {
  const cands = [[0, -0.26], [-0.22, -0.13], [0.22, -0.13], [-0.26, 0], [0.26, 0], [0, 0.26]];
  const skip = (f.level === 1 ? OB1 : OB2).find((o) => d2(o, f) < o.r);
  for (const [dx, dz] of cands) {
    const x = f.x + dx;
    const z = f.z + dz;
    if (inBounds(f.level, x, z) && !inObstacle(f.level, x, z, 0, skip)) return { x, y: levelY(f.level), z, face: heading({ x, z }, f) };
  }
  return { x: f.x, y: levelY(f.level), z: f.z - 0.2, face: 0 };
}

/* ================= 大便時間表 =================
   只由「種子＋日期＋倉鼠」決定，不用跑模擬也算得出來，
   所以前幾天沒撿的大便兩支手機都知道在哪。 */
export function poopSchedule(seed, ham, A) {
  const st = { s: hash(seed + ':poop:' + A + ':' + ham.id) };
  const start = Math.max(A + 30 * 60e3, (ham.addedAt || 0) + 20 * 60e3);
  const end = A + NIGHT_OFF - 30 * 60e3;
  if (start >= end) return [];
  const n = 5 + Math.floor(rnd(st) * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.floor(start + ((end - start) * (i + rnd(st) * 0.8)) / n);
    let p;
    if (rnd(st) < 0.6) p = { x: rr(st, TOILET.x0, TOILET.x1), y: 0, z: rr(st, TOILET.z0, TOILET.z1), level: 1 };
    else {
      const lvl = rnd(st) < 0.7 ? 1 : 2;
      p = { ...randomSpot(st, lvl), level: lvl };
    }
    out.push({ id: `${ham.id}:${A}:${i}`, hid: ham.id, t, x: p.x, y: p.y + 0.01, z: p.z, level: p.level, appearAt: null, rot: rnd(st) * 6.28 });
  }
  return out;
}

/* ================= 行程規劃 ================= */
class Plan {
  constructor(sim, h, t) {
    this.sim = sim;
    this.h = h;
    this.t = t;
    this.segs = [];
    this.legs = null;
  }
  flush() {
    if (this.legs && this.legs.length) {
      this.segs.push({ kind: 'move', t0: this.legs[0].t0, t1: this.t, legs: this.legs });
    }
    this.legs = null;
  }
  leg(to, mode, speed, place, level, fixedSec) {
    const h = this.h;
    const from = { ...h.pos };
    const dist = d3(from, to);
    if (fixedSec == null && dist < 0.01) { h.place = place; h.level = level; return; }
    const sec = fixedSec ?? Math.max(0.08, dist / speed);
    if (!this.legs) this.legs = [];
    this.legs.push({ t0: this.t, t1: this.t + sec * 1000, from, to: { ...to }, mode, place, level });
    this.t += sec * 1000;
    if (d2(from, to) > 0.02) h.face = heading(from, to);
    h.pos = { ...to };
    h.place = place;
    h.level = level;
  }
  stay(kind, sec, extra = {}) {
    this.flush();
    const h = this.h;
    if (extra.face != null) h.face = extra.face;
    const s = { kind, t0: this.t, t1: this.t + sec * 1000, pos: { ...h.pos }, face: h.face, place: h.place, level: h.level, ...extra };
    this.segs.push(s);
    this.t = s.t1;
    return s;
  }
  exit() {
    const h = this.h;
    switch (h.place) {
      case 'wheel': this.leg(P.wheelFront, 'jump', 0, 'floor1', 1, 0.45); break;
      case 'sand': this.leg(P.sandEntry, 'jump', 0, 'floor1', 1, 0.45); break;
      case 'log': this.leg(P.logFront, 'jump', 0, 'floor1', 1, 0.5); break;
      case 'house': this.leg(P.houseDoor, 'walk', 0.5, 'floor2', 2); break;
      case 'tunnel': {
        const left = h.pos.x < LOG.x;
        this.leg({ x: left ? P.logL : P.logR, y: TUN_Y, z: LOG.z }, 'creep', 0.45, 'tunnel', 1);
        this.leg({ x: left ? P.logL - 0.25 : P.logR + 0.25, y: 0, z: LOG.z }, 'walk', 0.6, 'floor1', 1);
        break;
      }
    }
  }
  walkOn(lvl, to, speed) {
    const pts = route(this.h.pos, to, lvl);
    for (const p of pts) this.leg({ x: p.x, y: levelY(lvl), z: p.z }, 'walk', speed, 'floor' + lvl, lvl);
  }
  goTo(to, lvl, speed = 0.85) {
    this.exit();
    const h = this.h;
    if (h.level !== lvl) {
      if (h.level === 1) {
        this.walkOn(1, P.rampBot, speed);
        this.leg(P.rampEdge, 'climb', 0.7, 'floor2', 2);
        this.leg(P.rampTopIn, 'walk', 0.6, 'floor2', 2);
      } else {
        this.walkOn(2, P.rampTopIn, speed);
        this.leg(P.rampEdge, 'walk', 0.5, 'floor2', 2);
        this.leg(P.rampBot, 'climb', 0.85, 'floor1', 1);
      }
    }
    this.walkOn(lvl, to, speed);
  }
}

/* ================= 模擬 ================= */
export class Sim {
  constructor() {
    this.ready = false;
  }

  // seed：家的種子；hamsters：[{id,name,color,addedAt}]；events：[{id,type,at,...}]
  setInputs(seed, hamsters, events, now) {
    const A = dayAnchor(now);
    this.cleans = new Map(events.filter((e) => e.type === 'clean').map((e) => [e.pid, e.at]));
    const stream = this.buildStream(A, hamsters, events);
    const pre = events.filter((e) => e.type === 'drop' && e.at < A && e.at >= nightStartBefore(A)).sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
    const key = seed + '|' + A + '|' + hamsters.map((h) => h.id + ':' + h.addedAt).join(',') + '|' + pre.map((e) => e.id).join(',');
    if (!this.ready || key !== this.key) {
      this.key = key;
      this.seed = seed >>> 0;
      this.A = A;
      this.N = A + NIGHT_OFF;
      this.next = A + DAY;
      this.hamsters = [...hamsters].sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : 1));
      this.preFoods = pre;
      this.stream = stream;
      this.reset();
      this.ready = true;
      return;
    }
    // 找出第一個不一樣的事件，從那之前的存檔重算
    const old = this.stream;
    let i = 0;
    while (i < old.length && i < stream.length && old[i].id === stream[i].id && old[i].at === stream[i].at) i++;
    this.stream = stream;
    if (i === old.length && i === stream.length) return;
    const tm = Math.min(old[i]?.at ?? Infinity, stream[i]?.at ?? Infinity);
    this.rewind(tm);
  }

  buildStream(A, hamsters, events) {
    const end = A + DAY;
    const s = events
      .filter((e) => (e.type === 'drop' || e.type === 'pet') && e.at >= A && e.at < end)
      .map((e) => ({ id: e.id, at: e.at, type: e.type, hid: e.hid, kind: e.kind, x: e.x, y: e.y, z: e.z, level: e.level }));
    for (const h of hamsters) if (h.addedAt > A && h.addedAt < end) s.push({ id: 'join-' + h.id, at: h.addedAt, type: 'join', hid: h.id });
    s.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return s;
  }

  reset() {
    const A = this.A;
    this.st = { evIdx: 0, nightDone: false, hams: {}, order: [], foods: {}, locks: {}, poops: {} };
    this.snaps = [];
    this.lastSnapT = -Infinity;
    this.until = A;
    for (const f of this.preFoods) this.addFood(f);
    // 前兩天的大便（沒撿的話還在）
    for (let d = POOP_DAYS - 1; d >= 1; d--) {
      const day = A - d * DAY;
      for (const h of this.hamsters) {
        if (h.addedAt >= day + NIGHT_OFF) continue;
        for (const p of poopSchedule(this.seed, h, day)) this.st.poops[p.id] = { ...p, appearAt: p.t };
      }
    }
    this.hamsters.filter((h) => h.addedAt <= A).forEach((h) => this.spawn(h, A, true));
  }

  spawn(info, t, atAnchor) {
    const st = this.st;
    const idx = st.order.length;
    const h = {
      id: info.id, idx, segs: [], pos: { ...NEST_SPOTS[idx % 3] }, level: 2, place: 'floor2', face: 0.6,
      nextT: Infinity, intent: null, rng: { s: hash(this.seed + ':' + this.A + ':' + info.id) }, cool: {}, food: null,
    };
    st.hams[h.id] = h;
    st.order.push(h.id);
    h.poops = [];
    for (const p of poopSchedule(this.seed, info, this.A)) { st.poops[p.id] = p; h.poops.push(p.id); }
    if (atAnchor || isNight(t)) {
      const wake = this.A + 1500 + idx * 2600;
      h.segs.push({ kind: 'sleep', t0: atAnchor ? nightStartBefore(this.A) : t, t1: isNight(t) ? this.next : wake, pos: { ...h.pos }, face: h.face, place: h.place, level: 2 });
      if (!isNight(t)) { h.nextT = wake; h.intent = { type: 'wake' }; }
    } else {
      // 新來的倉鼠：被放進一樓
      h.pos = { x: 0.15 + idx * 0.22, y: 0, z: 0.2 };
      h.level = 1;
      h.place = 'floor1';
      h.face = 0;
      h.segs.push({ kind: 'arrive', t0: t, t1: t + 1400, pos: { ...h.pos }, face: 0, place: 'floor1', level: 1 });
      h.nextT = t + 1400;
    }
  }

  addFood(e) {
    this.st.foods[e.id] = { id: e.id, kind: e.kind || 'kibble', x: e.x, y: e.y, z: e.z, level: e.level || 1, at: e.at, claimedBy: null, eatT0: null, eatenAt: null, goneAt: null };
  }

  /* ---- 存檔／倒帶 ---- */
  takeSnap(t) {
    const st = this.st;
    const hams = {};
    for (const id of st.order) {
      const h = st.hams[id];
      let k = h.segs.length;
      while (k > 0 && h.segs[k - 1].t1 > t) k--;
      const { segs, ...rest } = h;
      hams[id] = { keep: k, tail: clone(segs.slice(k)), rest: clone(rest) };
    }
    this.snaps.push({ t, evIdx: st.evIdx, nightDone: st.nightDone, order: [...st.order], foods: clone(st.foods), locks: clone(st.locks), poops: clone(st.poops), hams });
    this.lastSnapT = t;
  }
  rewind(tm) {
    let si = this.snaps.length - 1;
    while (si >= 0 && this.snaps[si].t > tm) si--;
    if (si < 0) { this.reset(); return; }
    const s = this.snaps[si];
    this.snaps.length = si + 1;
    const st = this.st;
    const hams = {};
    for (const id of s.order) {
      const cur = st.hams[id];
      const sh = s.hams[id];
      const segs = cur.segs.slice(0, sh.keep).concat(clone(sh.tail));
      hams[id] = { ...clone(sh.rest), segs };
    }
    this.st = { evIdx: s.evIdx, nightDone: s.nightDone, order: [...s.order], foods: clone(s.foods), locks: clone(s.locks), poops: clone(s.poops), hams };
    this.until = s.t;
    this.lastSnapT = s.t;
  }

  /* ---- 主迴圈 ---- */
  advance(until) {
    if (!this.ready) return;
    const st = this.st;
    for (let guard = 0; guard < 300000; guard++) {
      const ev = this.stream[st.evIdx];
      const tE = ev ? ev.at : Infinity;
      const tN = st.nightDone ? Infinity : this.N;
      let hD = null;
      let tD = Infinity;
      for (const id of st.order) {
        const h = st.hams[id];
        if (h.nextT < tD) { tD = h.nextT; hD = h; }
      }
      const tMin = Math.min(tE, tN, tD);
      if (tMin > until || tMin === Infinity) break;
      if (tMin - this.lastSnapT >= 120000) this.takeSnap(tMin);
      if (tE === tMin) { st.evIdx++; this.onEvent(ev); }
      else if (tN === tMin) { st.nightDone = true; this.onNight(); }
      else this.decide(hD, tD);
    }
    this.until = Math.max(this.until, until);
  }

  posAt(h, t) {
    const s = this.segAt(h, t);
    if (!s) return { ...h.pos, level: h.level };
    if (s.kind !== 'move') return { ...s.pos, level: s.level };
    const L = s.legs.find((l) => t < l.t1) || s.legs[s.legs.length - 1];
    const k = clamp((t - L.t0) / (L.t1 - L.t0 || 1), 0, 1);
    return { ...lerp3(L.from, L.to, k), level: L.level };
  }
  segAt(h, t) {
    const segs = h.segs;
    let lo = 0;
    let hi = segs.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].t0 <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? segs[ans] : null;
  }

  interrupt(h, T, intent) {
    const st = this.st;
    let i = h.segs.length - 1;
    while (i > 0 && h.segs[i].t0 > T) i--;
    const s = h.segs[i];
    let cut = T;
    if (!s) return;
    if (s.kind === 'move') {
      let li = s.legs.findIndex((l) => T < l.t1);
      if (li < 0) li = s.legs.length - 1;
      const L = s.legs[li];
      if (L.mode === 'walk' && T > L.t0 && T < L.t1) {
        const k = (T - L.t0) / (L.t1 - L.t0);
        L.to = lerp3(L.from, L.to, k);
        L.t1 = T;
      }
      s.legs.length = li + 1;
      s.t1 = L.t1;
      cut = s.t1;
      h.pos = { ...L.to };
      h.place = L.place;
      h.level = L.level;
    } else {
      cut = ATOMIC.has(s.kind) ? s.t1 : Math.max(T, s.t0);
      s.t1 = cut;
      h.pos = { ...s.pos };
      h.place = s.place;
      h.level = s.level;
      h.face = s.face;
    }
    h.segs.length = i + 1;
    // 還沒開始吃的食物放回去
    if (h.food) {
      const f = st.foods[h.food];
      if (f && !(f.eatT0 != null && f.eatT0 < cut)) { f.claimedBy = null; f.eatT0 = null; f.eatenAt = null; }
      h.food = null;
    }
    if (h.poop) {
      const pp = st.poops[h.poop];
      if (pp && pp.appearAt != null && pp.appearAt > cut) pp.appearAt = null;
      h.poop = null;
    }
    for (const k in st.locks) {
      const L = st.locks[k];
      if (L.hid === h.id && L.until > cut) L.until = cut + (ENCLOSED.has(h.place) ? 900 : 0);
    }
    h.nextT = cut;
    h.intent = intent;
  }

  onEvent(ev) {
    const st = this.st;
    if (ev.type === 'join') {
      const info = this.hamsters.find((x) => x.id === ev.hid);
      if (info && !st.hams[info.id]) this.spawn(info, ev.at, false);
      return;
    }
    if (ev.type === 'drop') {
      this.addFood(ev);
      if (isNight(ev.at)) return;
      const f = st.foods[ev.id];
      let best = null;
      let bestC = Infinity;
      for (const id of st.order) {
        const h = st.hams[id];
        if (h.nextT === Infinity || h.food || h.intent?.type === 'eat') continue;
        const p = this.posAt(h, ev.at);
        const c = d2(p, f) + (p.level !== f.level ? 1.5 : 0);
        if (c < bestC) { bestC = c; best = h; }
      }
      if (best) {
        this.interrupt(best, ev.at, { type: 'eat', fid: f.id });
        f.claimedBy = best.id;
        best.food = f.id;
      }
      return;
    }
    if (ev.type === 'pet') {
      const h = st.hams[ev.hid];
      if (!h || h.nextT === Infinity || isNight(ev.at)) return;
      const s = this.segAt(h, ev.at);
      if (s && (s.kind === 'happy' || s.kind === 'eat' || s.kind === 'arrive')) return;
      this.interrupt(h, ev.at, { type: 'happy' });
    }
  }

  onNight() {
    const st = this.st;
    for (const id of st.order) {
      const h = st.hams[id];
      if (h.nextT !== Infinity) this.interrupt(h, this.N, { type: 'night' });
    }
    for (const id in st.foods) {
      const f = st.foods[id];
      if (f.at < this.N && f.eatT0 == null && f.goneAt == null) f.goneAt = this.N;
    }
    // 來不及拉的大便：睡前拉在原定的位置
    for (const id in st.poops) {
      const p = st.poops[id];
      if (p.appearAt == null && p.t <= this.N) p.appearAt = this.N;
    }
  }

  nearestFood(h, t) {
    const st = this.st;
    let best = null;
    let bestC = Infinity;
    for (const id in st.foods) {
      const f = st.foods[id];
      if (f.claimedBy || f.goneAt != null || f.eatenAt != null || f.at > t) continue;
      const c = d2(h.pos, f) + (h.level !== f.level ? 1.5 : 0);
      if (c < bestC || (c === bestC && f.id < best.id)) { bestC = c; best = f; }
    }
    return best;
  }

  lockFree(name, t) {
    const L = this.st.locks[name];
    return !L || L.until <= t;
  }

  decide(h, t) {
    const st = this.st;
    const p = new Plan(this, h, t);
    const R = h.rng;
    const intent = h.intent;
    h.intent = null;
    h.nextT = Infinity;

    if (isNight(t)) {
      p.goTo(NEST_SPOTS[h.idx % 3], 2, 0.7);
      p.stay('groom', 1, { face: 0.5 });
      p.stay('sleep', (this.next - p.t) / 1000 + 3600);
      p.flush();
      h.segs.push(...p.segs);
      return; // nextT 維持 Infinity：睡到明天
    }

    let food = null;
    if (intent?.type === 'eat') food = st.foods[intent.fid];
    if (intent?.type === 'happy') p.stay('happy', 1.5);
    else if (intent?.type === 'wake') { p.stay('groom', 1.6, { face: 0.4 }); p.stay('sit', 1.2); }
    else {
      if (!food) food = this.nearestFood(h, t);
      const poop = food ? null : this.duePoop(h, t);
      if (food) this.planEat(p, h, food);
      else if (poop) this.planPoop(p, h, poop);
      else this.planRandom(p, h, R, t);
    }
    p.flush();
    if (p.t <= t) p.stay('sit', 1);
    h.segs.push(...p.segs);
    h.nextT = p.t;
  }

  duePoop(h, t) {
    for (const id of h.poops || []) {
      const pp = this.st.poops[id];
      if (pp.appearAt == null && pp.t <= t) return pp;
    }
    return null;
  }
  planPoop(p, h, pp) {
    h.poop = pp.id;
    // 大便要在屁股後面：盡量面向鏡頭蹲著
    const opts = [[0, 0.16, 0], [0, -0.16, PI], [0.16, 0, PI / 2], [-0.16, 0, -PI / 2]];
    let stand = null;
    for (const [dx, dz, face] of opts) {
      const x = pp.x + dx;
      const z = pp.z + dz;
      if (inBounds(pp.level, x, z) && !inObstacle(pp.level, x, z)) { stand = { x, z, face }; break; }
    }
    stand = stand || { x: pp.x, z: pp.z + 0.12, face: 0 };
    p.goTo({ x: stand.x, y: levelY(pp.level), z: stand.z }, pp.level, 0.8);
    const s = p.stay('poop', 1.4, { face: stand.face });
    pp.appearAt = s.t1 - 400;
    // 拉完往旁邊走開一點
    const away = { x: stand.x + (rnd(h.rng) < 0.5 ? -0.3 : 0.3), y: levelY(pp.level), z: stand.z + rr(h.rng, -0.1, 0.1) };
    if (inBounds(pp.level, away.x, away.z) && !inObstacle(pp.level, away.x, away.z, 0.02)) p.goTo(away, pp.level, 0.6);
    p.stay('sniff', 0.6);
  }

  planEat(p, h, f) {
    f.claimedBy = h.id;
    h.food = f.id;
    const spot = eatSpot(f);
    p.goTo(spot, f.level, 1.05);
    const s = p.stay('eat', EAT_SEC[f.kind] || 4, { face: spot.face, food: f.id, foodKind: f.kind });
    f.eatT0 = s.t0;
    f.eatenAt = s.t1;
    if (f.kind === 'kibble' && rnd(h.rng) < 0.5) {
      p.goTo(NEST_SPOTS[h.idx % 3], 2, 0.9);
      p.stay('stash', 1.8, { face: rr(h.rng, -0.8, 0.8) });
    } else if (f.kind !== 'kibble') {
      p.stay('happy', 1.3);
    }
  }

  lock(name, h, until) {
    this.st.locks[name] = { hid: h.id, until };
  }

  planRandom(p, h, R, t) {
    let pick = rnd(R) * ACT_TOTAL;
    let act = 'wander';
    for (const [name, w] of ACTS) { if ((pick -= w) < 0) { act = name; break; } }
    if (COOL[act] && t - (h.cool[act] ?? -1e15) < COOL[act]) act = 'wander';
    if (LOCKED.has(act) && !this.lockFree(act, t)) act = 'wander';
    if (COOL[act]) h.cool[act] = t;
    const startT = p.t;

    switch (act) {
      case 'sit': p.stay('sit', rr(R, 2, 4)); break;
      case 'groom': p.stay('groom', rr(R, 1.5, 2.6)); break;
      case 'loaf': p.stay('loaf', rr(R, 3, 6)); break;
      case 'stand': p.stay('stand', rr(R, 1.5, 3)); break;
      case 'dig': {
        p.goTo(randomSpot(R, 1), 1, rr(R, 0.7, 1));
        p.stay('dig', rr(R, 2.5, 4), { face: rr(R, -2.5, 2.5) });
        p.stay('sniff', 0.7);
        break;
      }
      case 'wheel': {
        p.goTo(P.wheelFront, 1, 0.9);
        p.stay('sniff', 0.5, { face: PI });
        p.leg(P.wheelIn, 'jump', 0, 'wheel', 1, 0.45);
        p.stay('wheelRun', rr(R, 4, 10), { face: PI / 2 });
        p.stay('wheelSit', rr(R, 0.8, 2), { face: PI / 2 });
        p.leg(P.wheelFront, 'jump', 0, 'floor1', 1, 0.45);
        break;
      }
      case 'sand': {
        p.goTo(P.sandEntry, 1, 0.9);
        p.stay('sniff', 0.6, { face: 0 });
        p.leg(P.sandIn, 'jump', 0, 'sand', 1, 0.45);
        p.stay('sniff', 0.6);
        p.stay('bath', rr(R, 3, 5));
        p.stay('groom', 1.2);
        p.leg(P.sandEntry, 'jump', 0, 'floor1', 1, 0.45);
        p.stay('shake', 0.8);
        break;
      }
      case 'drink': {
        p.goTo(P.drink, 1, 0.9);
        p.stay('drink', rr(R, 2, 3.5), { face: -PI / 2 });
        break;
      }
      case 'tunnel': {
        const left = h.pos.x < LOG.x;
        const dir = left ? 1 : -1;
        const inX = left ? P.logL : P.logR;
        const farX = left ? P.logR : P.logL;
        p.goTo({ x: inX - dir * 0.25, y: 0, z: LOG.z }, 1, 0.9);
        p.stay('sniff', 0.6, { face: dir * PI / 2 });
        p.leg({ x: inX, y: TUN_Y, z: LOG.z }, 'creep', 0.5, 'tunnel', 1);
        p.leg({ x: LOG.x + rr(R, -0.08, 0.08), y: TUN_Y, z: LOG.z }, 'creep', 0.45, 'tunnel', 1);
        p.stay('hide', rr(R, 2, 6));
        if (rnd(R) < 0.65) {
          p.leg({ x: farX - dir * 0.05, y: TUN_Y, z: LOG.z }, 'creep', 0.45, 'tunnel', 1);
          p.stay('peek', rr(R, 1.5, 3));
          p.leg({ x: farX, y: TUN_Y, z: LOG.z }, 'creep', 0.45, 'tunnel', 1);
          p.leg({ x: farX + dir * 0.25, y: 0, z: LOG.z }, 'walk', 0.6, 'floor1', 1);
        } else {
          p.leg({ x: inX, y: TUN_Y, z: LOG.z }, 'creep', 0.45, 'tunnel', 1);
          p.leg({ x: inX - dir * 0.25, y: 0, z: LOG.z }, 'walk', 0.6, 'floor1', 1);
        }
        break;
      }
      case 'logTop': {
        p.goTo(P.logFront, 1, 0.9);
        p.stay('stand', 0.8, { face: PI });
        p.leg(P.logTop, 'jump', 0, 'log', 1, 0.5);
        p.stay('loaf', rr(R, 2, 4), { face: rr(R, -0.7, 0.7) });
        p.stay('loaf', rr(R, 1.5, 3), { face: rr(R, -0.7, 0.7) });
        p.leg(P.logFront, 'jump', 0, 'floor1', 1, 0.5);
        break;
      }
      case 'house': {
        p.goTo(P.houseDoor, 2, 0.85);
        p.stay('sniff', 0.6, { face: PI });
        p.leg(P.houseIn, 'walk', 0.45, 'house', 2);
        p.stay(rnd(R) < 0.5 ? 'loaf' : 'nap', rr(R, 4, 12), { face: 0 });
        p.leg(P.houseDoor, 'walk', 0.5, 'floor2', 2);
        break;
      }
      case 'nap': {
        p.goTo(NEST_SPOTS[h.idx % 3], 2, 0.7);
        p.stay('groom', 0.8, { face: 0.5 });
        p.stay('nap', rr(R, 15, 40));
        p.stay('groom', 1);
        break;
      }
      case 'otherLevel':
      case 'wander': {
        const lvl = act === 'otherLevel' ? (h.level === 1 ? 2 : 1) : h.level;
        const n = 1 + Math.floor(rnd(R) * 3);
        for (let i = 0; i < n; i++) {
          p.goTo(randomSpot(R, lvl), lvl, rr(R, 0.6, 1));
          const r = rnd(R);
          if (r < 0.4) p.stay('sniff', rr(R, 0.8, 1.6));
          else if (r < 0.6) p.stay('sit', rr(R, 0.8, 1.8));
        }
        p.stay('sit', rr(R, 0.6, 1.4), { face: rr(R, -0.6, 0.6) });
        break;
      }
    }
    if (LOCKED.has(act)) this.lock(act, h, p.t);
    if (p.t === startT) p.stay('sit', 1);
  }

  /* ---- 給畫面用 ---- */
  hamsterIds() {
    return this.ready ? this.st.order : [];
  }
  poseAt(id, t) {
    const h = this.st.hams[id];
    if (!h) return null;
    const s = this.segAt(h, t);
    if (!s) return null;
    if (s.kind === 'move') {
      let L = s.legs.find((l) => t < l.t1) || s.legs[s.legs.length - 1];
      const k = clamp((t - L.t0) / (L.t1 - L.t0 || 1), 0, 1);
      const pos = lerp3(L.from, L.to, k);
      if (L.mode === 'jump') pos.y += 4 * k * (1 - k) * 0.14;
      const hd = d2(L.from, L.to);
      const sec = (L.t1 - L.t0) / 1000;
      return {
        kind: 'move', mode: L.mode, pos, place: L.place, level: L.level,
        heading: hd > 0.02 ? heading(L.from, L.to) : null,
        speed: L.mode === 'jump' ? 0 : hd / sec,
        slope: L.mode === 'climb' ? Math.atan2(L.to.y - L.from.y, hd || 1) : 0,
        k, t0: L.t0, t1: L.t1,
      };
    }
    return {
      kind: s.kind, pos: { ...s.pos }, place: s.place, level: s.level, heading: s.face, speed: 0, slope: 0,
      k: clamp((t - s.t0) / (s.t1 - s.t0 || 1), 0, 1), t0: s.t0, t1: s.t1, food: s.food, foodKind: s.foodKind,
    };
  }
  foods() {
    return this.ready ? Object.values(this.st.foods) : [];
  }
  // 現在籠子裡看得到的大便
  poopsAt(t) {
    if (!this.ready) return [];
    const out = [];
    for (const id in this.st.poops) {
      const p = this.st.poops[id];
      if (p.appearAt == null || p.appearAt > t) continue;
      const c = this.cleans?.get(id);
      out.push({ ...p, cleanedAt: c ?? null });
    }
    return out;
  }
}
