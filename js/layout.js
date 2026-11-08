// 籠子配置：三種籠子＋每個玩具在籠子裡的位置。
// makeLayout(setup) 依照「買了哪個籠子、哪些玩具」組出目前的配置，場景（world.js）和模擬（sim.js）共用。
// 墊料表面 y=0。

const CAGES = {
  small: {
    label: '小籠子',
    W: { x: 1.0, z: 0.7, baseTop: 0.3, baseBottom: -0.25 },
    top: 1.45,
    BOWL: { x: 0.6, z: 0.4, r: 0.15 },
    DRINK: { x: -0.72, z: 0.4 },
    NEST: { x: 0.55, z: -0.33, level: 1, rBasic: 0.2, rBig: 0.27 },
    WHEEL: { x: -0.5, z: -0.32, r: 0.4, depth: 0.3 },
    SAND: { x: -0.05, z: 0.33, r: 0.27 },
    TOILET: { x0: 0.7, x1: 0.85, z0: -0.02, z1: 0.14 },
    SPAWN: { x: 0.1, z: -0.05 },
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
    TOILET: { x0: -1.3, x1: -0.88, z0: 0.05, z1: 0.24 },
    SPAWN: { x: 0.1, z: 0.0 },
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
  },
};
export const CAGE_ORDER = ['small', 'medium', 'big'];
export const DEFAULT_SETUP = { cage: 'small', items: [], cageAt: 0 };

// 每個東西佔的地方（圓形近似，走路會繞開）
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

export function makeLayout(setup = DEFAULT_SETUP) {
  const cageId = CAGES[setup?.cage] ? setup.cage : 'small';
  const c = CAGES[cageId];
  const items = new Set(setup?.items || []);
  const has = (id) => items.has(id) && !!c[{ wheel: 'WHEEL', sand: 'SAND', log: 'LOG', house: 'HOUSE' }[id]];
  const big = items.has('bignest');
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
  // 走路要繞開的（只有真的放進來的東西）
  const lvl2 = (id) => (id === 'house' && c.HOUSE?.level === 2);
  const owned = ['bowl', ...(L.WHEEL ? ['wheel'] : []), ...(L.SAND ? ['sand'] : []), ...(L.LOG ? ['log'] : []), ...(L.HOUSE ? ['house'] : []), ...(L.RAMP ? ['ramp'] : [])];
  L.OB1 = owned.filter((id) => !lvl2(id)).flatMap((id) => circlesOf(id, c).map((o) => ({ ...o, id })));
  L.OB2 = owned.filter(lvl2).flatMap((id) => circlesOf(id, c).map((o) => ({ ...o, id })));
  // 大便位置用「所有可能放東西的地方」來避開 → 之後買新玩具，舊的大便位置也不會變
  const all = ['bowl', 'wheel', 'sand', 'log', 'house', 'ramp'].filter((id) => c[{ bowl: 'BOWL', wheel: 'WHEEL', sand: 'SAND', log: 'LOG', house: 'HOUSE', ramp: 'RAMP' }[id]]);
  L.OBA1 = all.filter((id) => !lvl2(id)).flatMap((id) => circlesOf(id, c).map((o) => ({ ...o, id })));
  L.OBA2 = all.filter(lvl2).flatMap((id) => circlesOf(id, c).map((o) => ({ ...o, id })));
  L.BOUNDS = {
    1: { x0: -c.W.x + 0.14, x1: c.W.x - 0.14, z0: -c.W.z + 0.14, z1: c.W.z - 0.14, y: 0 },
  };
  if (L.PLAT) L.BOUNDS[2] = { x0: L.PLAT.x0 + 0.14, x1: L.PLAT.x1 - 0.14, z0: L.PLAT.z0 + 0.14, z1: L.PLAT.z1 - 0.1, y: L.PLAT.y };
  return L;
}
