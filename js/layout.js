// 籠子配置：場景（world.js）和模擬（sim.js）共用，墊料表面 y=0
export const W = { x: 1.8, z: 1.1, baseTop: 0.36, baseBottom: -0.3 };
export const WHEEL = { x: -1.12, y: 0.72, z: -0.55, r: 0.6, depth: 0.4 };
export const SAND = { x: -0.2, z: 0.5, r: 0.42 };
export const BOWL = { x: 0.85, z: 0.62, r: 0.17 };
export const DRINK = { x: -1.46, z: 0.62 };
export const PLAT = { x0: 0.15, x1: 1.8, z0: -1.1, z1: -0.1, y: 0.95 };
export const RAMP = { x: 1.52, w: 0.38, zTop: -0.1, zBot: 0.95 };
export const HOUSE = { x: 0.62, z: -0.82, w: 0.62, d: 0.46 };
export const NEST = { x: 1.12, z: -0.56, r: 0.25 };
export const LOG = { x: 0.75, z: -0.7, r: 0.25, inner: 0.215, len: 0.74 };

// 走路時要繞開的東西（圓形近似）
export const OB1 = [
  { x: SAND.x, z: SAND.z, r: SAND.r + 0.12, id: 'sand' },
  { x: BOWL.x, z: BOWL.z, r: 0.26, id: 'bowl' },
  { x: WHEEL.x, z: WHEEL.z, r: 0.68, id: 'wheel' },
  { x: LOG.x - 0.18, z: LOG.z, r: 0.33, id: 'log' },
  { x: LOG.x + 0.18, z: LOG.z, r: 0.33, id: 'log' },
  { x: RAMP.x, z: 0.15, r: 0.26, id: 'ramp' },
  { x: RAMP.x, z: 0.55, r: 0.26, id: 'ramp' },
];
export const OB2 = [{ x: HOUSE.x, z: HOUSE.z, r: 0.38, id: 'house' }];

export const BOUNDS = {
  1: { x0: -W.x + 0.14, x1: W.x - 0.14, z0: -W.z + 0.14, z1: W.z - 0.14, y: 0 },
  2: { x0: PLAT.x0 + 0.14, x1: PLAT.x1 - 0.14, z0: PLAT.z0 + 0.14, z1: PLAT.z1 - 0.1, y: PLAT.y },
};

export const levelY = (lvl) => (lvl === 2 ? PLAT.y : 0);
