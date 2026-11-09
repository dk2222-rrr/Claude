// 籠子配置：三種主籠子＋擴充遊戲籠（用透明隧道連通）＋每個玩具的位置。
// makeLayout(setup) 依照「買了哪個籠子、哪些玩具」組出目前的配置，場景（world.js）和模擬（sim.js）共用。
// 墊料表面 y=0。樓層編號：1 主籠一樓、2 主籠二樓（大籠子才有）、3 第一個遊戲籠、4 第二個遊戲籠。

const CAGES = {
  small: {
    label: '小籠子',
    W: { x: 1.0, z: 0.7, baseTop: 0.3, baseBottom: -0.25 },
    top: 1.45,
    BOWL: { x: 0.6, z: 0.4, r: 0.15 },
    DRINK: { x: -0.72, z: 0.4 },
    NEST: { x: 0.52, z: -0.36, level: 1, rBasic: 0.2, rBig: 0.27 },
    WHEEL: { x: -0.5, z: -0.32, r: 0.4, depth: 0.3 },
    SAND: { x: -0.08, z: 0.33, r: 0.27 },
    TOILET: { x0: -0.9, x1: -0.62, z0: 0.0, z1: 0.14 },
    SPAWN: { x: 0.15, z: 0.02 },
    TUBE_Z: 0.02,
    SPOTS: { S: [{ x: 0.1, z: -0.46 }], L: [] },
  },
  medium: {
    label: '中籠子',
    W: { x: 1.45, z: 0.9, baseTop: 0.33, baseBottom: -0.28 },
    top: 1.9,
    BOWL: { x: 1.0, z: 0.5, r: 0.17 },
    DRINK: { x: -1.12, z: 0.55 },
    NEST: { x: 1.05, z: -0.45, level: 1, rBasic: 0.22, rBig: 0.32 },
    WHEEL: { x: -0.86, z: -0.45, r: 0.52, depth: 0.36 },
    SAND: { x: -0.32, z: 0.42, r: 0.34 },
    LOG: { x: 0.3, z: -0.6, r: 0.25, inner: 0.215, len: 0.7 },
    HOUSE: { x: 0.45, z: 0.28, w: 0.62, d: 0.46, level: 1 },
    TOILET: { x0: -1.3, x1: -0.92, z0: 0.08, z1: 0.24 },
    SPAWN: { x: 0.1, z: 0.0 },
    TUBE_Z: 0.03,
    SPOTS: { S: [{ x: -0.62, z: -0.02 }], L: [] },
  },
  big: {
    label: '雙層大籠子',
    W: { x: 1.8, z: 1.1, baseTop: 0.36, baseBottom: -0.3 },
    top: 2.3,
    BOWL: { x: 0.85, z: 0.62, r: 0.17 },
    DRINK: { x: -1.46, z: 0.62 },
    NEST: { x: 1.2, z: -0.6, level: 2, rBasic: 0.24, rBig: 0.34 },
    WHEEL: { x: -1.12, z: -0.55, r: 0.6, depth: 0.4 },
    SAND: { x: -0.2, z: 0.5, r: 0.42 },
    LOG: { x: 0.75, z: -0.7, r: 0.25, inner: 0.215, len: 0.74 },
    HOUSE: { x: 0.55, z: -0.82, w: 0.62, d: 0.46, level: 2 },
    PLAT: { x0: 0.15, x1: 1.8, z0: -1.1, z1: -0.1, y: 0.95 },
    RAMP: { x: 1.52, w: 0.38, zTop: -0.1, zBot: 0.95 },
    TOILET: { x0: -1.58, x1: -1.02, z0: 0.76, z1: 0.95 },
    SPAWN: { x: 0.15, z: 0.2 },
    TUBE_Z: -0.4,
    SPOTS: { S: [{ x: 0.36, z: 0.08 }], L: [{ x: -1.22, z: 0.16 }] },
  },
};
// 擴充遊戲籠（本地座標，中心在 0）
export const ANNEX = {
  W: { x: 0.95, z: 0.65, baseTop: 0.3, baseBottom: -0.25 },
  top: 1.3,
  SPOTS: { S: [{ x: -0.55, z: 0.38 }, { x: 0.55, z: 0.38 }], L: [{ x: -0.42, z: -0.3 }, { x: 0.42, z: -0.3 }] },
};
const GAP = 0.6; // 兩個籠子中間隧道的長度

export const CAGE_ORDER = ['small', 'medium', 'big'];
// 玩具：S 小型（放小位置）、L 大型（放大位置）
export const TOYS = {
  chew: { size: 'S', r: 0.16 },
  steps: { size: 'S', r: 0.2 },
  ball: { size: 'S', r: 0.17 },
  swing: { size: 'L', r: 0.34 },
  slide: { size: 'L', r: 0.34 },
};
export const TOY_ORDER = ['chew', 'steps', 'ball', 'swing', 'slide'];
export const DEFAULT_STYLES = { bedding: 'paper', cageColor: 'white', room: 'cream', wheel: 'mint', house: 'wood', nest: 'cotton' };
export const DEFAULT_SETUP = { cage: 'small', items: [], cageAt: 0, styles: { ...DEFAULT_STYLES } };

function circlesOf(id, c) {
  switch (id) {
    case 'bowl': return [{ x: c.BOWL.x, z: c.BOWL.z, r: c.BOWL.r + 0.09 }];
    case 'sand': return [{ x: c.SAND.x, z: c.SAND.z, r: c.SAND.r + 0.12 }];
    case 'wheel': {
      const w = c.WHEEL;
      const r = Math.max(0.26, w.depth * 0.5 + 0.14);
      return [{ x: w.x - w.r * 0.5, z: w.z - 0.04, r }, { x: w.x + w.r * 0.5, z: w.z - 0.04, r }];
    }
    case 'log': return [{ x: c.LOG.x - 0.18, z: c.LOG.z, r: 0.33 }, { x: c.LOG.x + 0.18, z: c.LOG.z, r: 0.33 }];
    case 'ramp': return [{ x: c.RAMP.x, z: 0.15, r: 0.26 }, { x: c.RAMP.x, z: 0.55, r: 0.26 }];
    case 'house': return [{ x: c.HOUSE.x, z: c.HOUSE.z, r: 0.38 }];
  }
  return [];
}
const toyCircles = (t) => (t.size === 'L' ? [{ x: t.x - 0.16, z: t.z, r: 0.24 }, { x: t.x + 0.16, z: t.z, r: 0.24 }] : [{ x: t.x, z: t.z, r: TOYS[t.id].r }]);

// 這個玩具現在放得進去嗎？（依序找空位：主籠子 → 遊戲籠 1 → 遊戲籠 2）
export function toySpotsFor(setup) {
  const c = CAGES[setup?.cage] || CAGES.small;
  const items = new Set(setup?.items || []);
  const spots = { S: [], L: [] };
  for (const sz of ['S', 'L']) c.SPOTS[sz].forEach((p) => spots[sz].push({ ...p, level: 1 }));
  [3, 4].forEach((lvl) => {
    if (!items.has(lvl === 3 ? 'annex1' : 'annex2')) return;
    for (const sz of ['S', 'L']) ANNEX.SPOTS[sz].forEach((p) => spots[sz].push({ ...p, level: lvl, local: true }));
  });
  return spots;
}

export function makeLayout(setup = DEFAULT_SETUP) {
  const cageId = CAGES[setup?.cage] ? setup.cage : 'small';
  const c = CAGES[cageId];
  const items = new Set(setup?.items || []);
  const has = (id) => items.has(id) && !!c[{ wheel: 'WHEEL', sand: 'SAND', log: 'LOG', house: 'HOUSE' }[id]];
  const big = items.has('bignest');
  const annexN = items.has('annex1') ? (items.has('annex2') ? 2 : 1) : 0;
  const L = {
    cage: cageId,
    label: c.label,
    key: `${cageId}|${[...items].sort().join(',')}`,
    cageAt: setup?.cageAt || 0,
    W: c.W,
    top: c.top,
    BOWL: c.BOWL,
    DRINK: c.DRINK,
    TOILET: c.TOILET,
    SPAWN: c.SPAWN,
    NEST: { x: c.NEST.x, z: c.NEST.z, level: c.NEST.level, r: big ? c.NEST.rBig : c.NEST.rBasic, big },
    WHEEL: has('wheel') ? c.WHEEL : null,
    SAND: has('sand') ? c.SAND : null,
    LOG: has('log') ? c.LOG : null,
    HOUSE: has('house') ? c.HOUSE : null,
    PLAT: c.PLAT || null,
    RAMP: c.RAMP || null,
  };
  L.twoFloor = !!L.PLAT;
  L.levelY = (lvl) => (lvl === 2 && L.PLAT ? L.PLAT.y : 0);

  // 擴充遊戲籠：排在主籠子右邊，用隧道一個接一個
  L.annexes = [];
  let edge = c.W.x;
  for (let i = 0; i < annexN; i++) {
    const cx = edge + GAP + ANNEX.W.x;
    L.annexes.push({ level: 3 + i, cx, cz: c.TUBE_Z, W: ANNEX.W, top: ANNEX.top });
    edge = cx + ANNEX.W.x;
  }
  // 連接管：從左邊籠子的右牆到右邊籠子的左牆，中間拱起來（要另外買才會接上）
  L.links = [];
  if (L.RAMP) L.links.push({ type: 'ramp', a: 1, b: 2 });
  let prev = { level: 1, right: c.W.x, z: c.TUBE_Z };
  for (const ax of L.annexes) {
    const owned = items.has(ax.level === 3 ? 'tube1' : 'tube2');
    if (!owned) { prev = { level: ax.level, right: ax.cx + ax.W.x, z: ax.cz }; continue; }
    const x0 = prev.right;
    const x1 = ax.cx - ax.W.x;
    const z = ax.cz;
    const mid = (x0 + x1) / 2;
    L.links.push({
      type: 'tube', a: prev.level, b: ax.level, z,
      inA: { x: x0 - 0.16, y: 0, z }, inB: { x: x1 + 0.16, y: 0, z },
      path: [{ x: x0 + 0.02, y: 0.1, z }, { x: mid, y: 0.42, z }, { x: x1 - 0.02, y: 0.1, z }],
    });
    prev = { level: ax.level, right: ax.cx + ax.W.x, z };
  }
  // 倉鼠走得到的樓層（從主籠子出發，沿著木梯和連接管）
  L.reach = { 1: true };
  for (let changed = true; changed;) {
    changed = false;
    for (const lk of L.links) {
      if (L.reach[lk.a] !== L.reach[lk.b]) { L.reach[lk.a] = L.reach[lk.b] = true; changed = true; }
    }
  }

  // 玩具放到空位上
  const spots = toySpotsFor(setup);
  const used = { S: 0, L: 0 };
  L.toys = [];
  for (const id of TOY_ORDER) {
    if (!items.has(id)) continue;
    const sz = TOYS[id].size;
    const sp = spots[sz][used[sz]++];
    if (!sp) continue;
    const ax = L.annexes.find((a) => a.level === sp.level);
    const x = sp.local ? ax.cx + sp.x : sp.x;
    const z = sp.local ? ax.cz + sp.z : sp.z;
    L.toys.push({ id, size: sz, x, z, level: sp.level });
  }

  // 每一層的範圍與障礙物
  const lvl2 = (id) => id === 'house' && c.HOUSE?.level === 2;
  const owned = ['bowl', ...(L.WHEEL ? ['wheel'] : []), ...(L.SAND ? ['sand'] : []), ...(L.LOG ? ['log'] : []), ...(L.HOUSE ? ['house'] : []), ...(L.RAMP ? ['ramp'] : [])];
  const tag = (id) => (o) => ({ ...o, id });
  L.OB = { 1: owned.filter((id) => !lvl2(id)).flatMap((id) => circlesOf(id, c).map(tag(id))), 2: owned.filter(lvl2).flatMap((id) => circlesOf(id, c).map(tag(id))) };
  for (const ax of L.annexes) L.OB[ax.level] = [];
  for (const t of L.toys) L.OB[t.level].push(...toyCircles(t).map(tag('toy:' + t.id)));
  L.OB1 = L.OB[1];
  L.OB2 = L.OB[2];
  // 大便位置用「所有可能放東西的地方」來避開 → 之後買新玩具，舊的大便位置也不會變
  const allKeys = ['bowl', 'wheel', 'sand', 'log', 'house', 'ramp'].filter((id) => c[{ bowl: 'BOWL', wheel: 'WHEEL', sand: 'SAND', log: 'LOG', house: 'HOUSE', ramp: 'RAMP' }[id]]);
  const toySlots = [...c.SPOTS.S.map((p) => ({ ...p, size: 'S', id: 'chew' })), ...c.SPOTS.L.map((p) => ({ ...p, size: 'L', id: 'swing' }))];
  L.OBA1 = [...allKeys.filter((id) => !lvl2(id)).flatMap((id) => circlesOf(id, c).map(tag(id))), ...toySlots.flatMap((t) => toyCircles(t).map(tag('slot')))];
  L.OBA2 = allKeys.filter(lvl2).flatMap((id) => circlesOf(id, c).map(tag(id)));
  L.BOUNDS = { 1: { x0: -c.W.x + 0.14, x1: c.W.x - 0.14, z0: -c.W.z + 0.14, z1: c.W.z - 0.14, y: 0 } };
  if (L.PLAT) L.BOUNDS[2] = { x0: L.PLAT.x0 + 0.14, x1: L.PLAT.x1 - 0.14, z0: L.PLAT.z0 + 0.14, z1: L.PLAT.z1 - 0.1, y: L.PLAT.y };
  for (const ax of L.annexes) L.BOUNDS[ax.level] = { x0: ax.cx - ax.W.x + 0.14, x1: ax.cx + ax.W.x - 0.14, z0: ax.cz - ax.W.z + 0.14, z1: ax.cz + ax.W.z - 0.14, y: 0 };
  L.levels = Object.keys(L.BOUNDS).map(Number);
  // 整個場景的範圍（相機用）
  const xs = [-c.W.x, c.W.x, ...L.annexes.flatMap((a) => [a.cx - a.W.x, a.cx + a.W.x])];
  L.ext = { x0: Math.min(...xs), x1: Math.max(...xs), z0: -c.W.z, z1: c.W.z };
  return L;
}
