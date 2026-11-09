import { SHOP, setupOf, shopState } from './shop.js';
// 倉鼠的數值、衰退與所有動作的規則（雲端與單機模式共用）

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// 每小時下降多少（100 → 0 約 20～25 小時）
export const DECAY_PER_HOUR = { fullness: 5, joy: 4 };
// 兩人在這段時間內先後摸倉鼠，就算「一起摸摸」
export const TOGETHER_WINDOW = 15000;

export const LEVELS = [
  [0, '小鼠寶寶'],
  [10, '好奇鼠鼠'],
  [30, '貪吃鬼'],
  [60, '撒嬌鼠'],
  [100, '滾輪健將'],
  [160, '頰囊大師'],
  [240, '家中寶貝'],
  [350, '最佳拍檔'],
  [500, '傳說毛球'],
  [700, '永遠的家人'],
];

export function levelInfo(love = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && love >= LEVELS[i + 1][0]) i++;
  const [min, title] = LEVELS[i];
  const next = LEVELS[i + 1]?.[0];
  const progress = next ? (love - min) / (next - min) : 1;
  return { level: i + 1, title, progress, next };
}

export function withDecay(dog, now = Date.now()) {
  const h = Math.max(0, (now - (dog.updatedAt || now)) / 36e5);
  // 太餓的時候心情掉得比較快
  const hungryExtra = dog.fullness < 20 ? 1.5 : 0;
  return {
    ...dog,
    fullness: clamp(dog.fullness - DECAY_PER_HOUR.fullness * h),
    joy: clamp(dog.joy - (DECAY_PER_HOUR.joy + hungryExtra) * h),
    updatedAt: now,
  };
}

// 倉鼠不會死，最多只會難過
export function moodOf(dog) {
  if (dog.fullness < 25) return 'hungry';
  if (dog.joy < 30) return 'sad';
  if ((dog.fullness + dog.joy) / 2 >= 70) return 'happy';
  return 'ok';
}

export function newRoom({ dogName, anniversary, myName, color }, uid) {
  const now = Date.now();
  return {
    createdAt: now,
    dog: { name: dogName, anniversary, fullness: 80, joy: 80, love: 0, updatedAt: now },
    members: { [uid]: { name: myName, joinedAt: now } },
    lastPet: null,
    combo: null,
    note: null,
    petLog: {},
    photos: 1,
    score: SCORE_START,
    setup: { cage: 'small', items: [], cageAt: 0, styles: {}, owned: [] }, // 一開始只有小籠子
    hamsters: [{ id: 'h1', name: dogName, color: color || 'golden', addedAt: now }],
  };
}

export const MAX_HAMSTERS = 3;
export const PHOTOS_PER_DAY = 5;
export const taiwanDay = (t) => Math.floor((t + 8 * 3600e3) / 86400e3);
export const photosLeft = (room, uid, now = Date.now()) => {
  const l = room?.photoLog?.[uid];
  return PHOTOS_PER_DAY - (l && l.day === taiwanDay(now) ? l.n : 0);
};
// 好感度：照顧得好會增加，大便放著不撿會減少；可以到商店換籠子和玩具
export const SCORE_START = 40;
export const POOP_PENALTY_MAX = 5; // 一坨大便最多扣 5 分
export const POOP_GRACE = 3 * 3600e3; // 3 小時內撿都不扣分
// 放超過 3 小時後，每 2 小時扣 1 分
export const poopPenalty = (ageMs) => Math.min(POOP_PENALTY_MAX, Math.floor(Math.max(0, ageMs - POOP_GRACE) / (2 * 3600e3)) + (ageMs > POOP_GRACE ? 1 : 0));
export const scoreOf = (room) => Math.max(0, room?.score ?? SCORE_START);
export const SNACK_COST = { kibble: 0, seed: 1, fish: 2 };

// 舊資料沒有 hamsters 欄位時，用原本的名字補一隻
export function hamstersOf(room) {
  if (room?.hamsters?.length) return room.hamsters;
  return [{ id: 'h1', name: room?.dog?.name || '布丁', color: 'golden', addedAt: room?.createdAt || 0 }];
}

// 每一隻倉鼠自己的飽足（飢餓）和心情（開心）
// 舊資料沒有 hstats 時，從整體的數值開始
export function hamStats(room, now = Date.now()) {
  const base = room?.hstats || {};
  const d = room?.dog || {};
  const out = {};
  for (const h of hamstersOf(room)) {
    const s = base[h.id] || { fullness: d.fullness ?? 80, joy: d.joy ?? 80, updatedAt: d.updatedAt || now };
    out[h.id] = withDecay(s, now);
  }
  return out;
}
// 最餓的那隻（一樣餓就選先來的）
export function hungriest(room, now = Date.now()) {
  const st = hamStats(room, now);
  let best = null;
  for (const h of hamstersOf(room)) if (!best || st[h.id].fullness < st[best].fullness) best = h.id;
  return best;
}

/**
 * 套用一個動作。回傳 { room?, event?, result }
 * room 有值才需要寫回；event 有值才寫進紀錄。
 * extra.at / extra.evId：事件的時間和 id 由畫面先決定，兩支手機的模擬才會一致。
 */
export function applyAction(room, type, uid, extra = {}, now = Date.now()) {
  if (extra.at) now = extra.at;
  const r = JSON.parse(JSON.stringify(room));
  const d = (r.dog = withDecay(r.dog, now));
  const me = r.members?.[uid]?.name || '?';
  const ev = (t, more = {}) => ({
    id: extra.evId || `${now}-${Math.random().toString(36).slice(2, 7)}`,
    type: t, by: uid, byName: me, at: now, ...more,
  });
  const hs = (r.hstats = hamStats(r, now));
  const ids = Object.keys(hs);
  const pickHam = (hid) => (hid && hs[hid] ? hid : hungriest(r, now));
  // 整體數值＝每隻的平均（舊版畫面和心情判斷用）
  const syncDog = () => {
    if (!ids.length) return;
    d.fullness = ids.reduce((a, id) => a + hs[id].fullness, 0) / ids.length;
    d.joy = ids.reduce((a, id) => a + hs[id].joy, 0) / ids.length;
  };

  switch (type) {
    // 把飼料／零食放進籠子
    case 'drop': {
      const kind = extra.kind in SNACK_COST ? extra.kind : 'kibble';
      const cost = SNACK_COST[kind];
      if ((r.photos || 0) < cost) return { result: { ok: false, reason: 'photos' } };
      r.photos = (r.photos || 0) - cost;
      // 吃到的是哪一隻（畫面上跑去吃的那隻；沒有的話算最餓的那隻）
      const hid = pickHam(extra.hid);
      const h = hs[hid];
      const before = h.fullness;
      if (kind === 'kibble') { h.fullness = clamp(h.fullness + 24); d.love += 1; }
      if (kind === 'seed') { h.fullness = clamp(h.fullness + 6); h.joy = clamp(h.joy + 10); d.love += 2; }
      if (kind === 'fish') { h.fullness = clamp(h.fullness + 10); h.joy = clamp(h.joy + 18); d.love += 3; }
      syncDog();
      // 餓的時候餵才加分（一直狂丟不會一直加）
      if (before < 85 || kind !== 'kibble') r.score = scoreOf(r) + (kind === 'kibble' ? 1 : 2);
      const { x, y, z, level } = extra;
      return { room: r, event: ev('drop', { kind, x, y, z, level, hid }), result: { ok: true, hid } };
    }

    case 'pet': {
      const lp = r.lastPet;
      const h = hs[pickHam(extra.hid)];
      let together = false;
      if (lp && lp.by !== uid && now - lp.at < TOGETHER_WINDOW && !lp.used) {
        together = true;
        for (const id of ids) hs[id].joy = clamp(hs[id].joy + 20); // 一起摸摸：每一隻都開心
        d.love += 5;
        r.combo = { at: now, names: [lp.byName, me] };
        r.score = scoreOf(r) + 2;
      }
      const prev = (r.petLog || {})[uid] || 0;
      if (now - prev > 60000) {
        h.joy = clamp(h.joy + 6);
        d.love += 1;
        r.score = scoreOf(r) + 1; // 摸摸會慢慢增加好感度（每人每分鐘最多 1 點）
        r.petLog = { ...(r.petLog || {}), [uid]: now };
      } else {
        h.joy = clamp(h.joy + 2);
      }
      syncDog();
      r.lastPet = { by: uid, byName: me, at: now, used: together };
      // 每次都要寫事件：兩支手機的倉鼠要同時開心
      return { room: r, event: ev('pet', { hid: extra.hid, together, with: together ? lp.byName : null }), result: { ok: true, together } };
    }

    case 'photo': {
      // 每人每天（台灣時間）最多拍 5 張
      const day = taiwanDay(now);
      const log = { ...(r.photoLog || {}) };
      const mine = log[uid]?.day === day ? log[uid].n : 0;
      if (mine >= PHOTOS_PER_DAY) return { result: { ok: false, reason: 'limit' } };
      log[uid] = { day, n: mine + 1 };
      r.photoLog = log;
      r.photos = Math.min(99, (r.photos || 0) + 1);
      r.score = scoreOf(r) + 1;
      return { room: r, event: ev('photo', { photoId: extra.photoId || null }), result: { ok: true, photos: r.photos, left: PHOTOS_PER_DAY - mine - 1 } };
    }

    case 'adopt': {
      const list = hamstersOf(r);
      if (list.length >= MAX_HAMSTERS) return { result: { ok: false, reason: 'max' } };
      const name = String(extra.name || '').trim().slice(0, 10) || '小倉鼠';
      const h = { id: 'h' + now.toString(36), name, color: extra.color || 'golden', addedAt: now };
      r.hamsters = [...list, h];
      r.hstats = { ...hs, [h.id]: { fullness: 75, joy: 80, updatedAt: now } };
      d.love += 3;
      return { room: r, event: ev('adopt', { hid: h.id, name }), result: { ok: true, hamster: h } };
    }

    case 'renameHamster': {
      const list = hamstersOf(r).map((h) => (h.id === extra.hid ? { ...h, name: String(extra.name || h.name).slice(0, 10) } : h));
      r.hamsters = list;
      if (list[0]) d.name = list[0].name;
      return { room: r, result: { ok: true } };
    }

    // 撿大便：越早撿越好，放太久會倒扣
    case 'clean': {
      const done = r.cleaned || [];
      if (done.includes(extra.pid)) return { result: { ok: false, reason: 'already' } };
      const gain = 2 - poopPenalty(extra.ageMs || 0);
      r.score = Math.max(0, scoreOf(r) + gain);
      r.cleaned = [...done, extra.pid].slice(-150);
      return { room: r, event: ev('clean', { pid: extra.pid, gain }), result: { ok: true, gain } };
    }

    // 放超過 3 天都沒人撿的大便：結算扣分（每天只結算一次）
    case 'settlePoops': {
      if ((r.settledTo || 0) >= extra.day) return { result: { ok: false } };
      r.settledTo = extra.day;
      if (!extra.count) return { room: r, result: { ok: true } };
      r.score = Math.max(0, scoreOf(r) - extra.count * POOP_PENALTY_MAX);
      return { room: r, event: ev('settle', { count: extra.count }), result: { ok: true } };
    }

    // 商店：用好感度換籠子／玩具
    case 'buy': {
      const item = SHOP.find((x) => x.id === extra.item);
      if (!item) return { result: { ok: false, reason: 'unknown' } };
      const setup = setupOf(r);
      const st = shopState(item, setup).s;
      if (st !== 'ok') return { result: { ok: false, reason: st } };
      if (scoreOf(r) < item.cost) return { result: { ok: false, reason: 'points' } };
      r.score = scoreOf(r) - item.cost;
      if (item.kind === 'cage') r.setup = { ...setup, cage: item.id, cageAt: now };
      else if (item.kind === 'style') r.setup = { ...setup, owned: [...setup.owned, item.id], styles: { ...setup.styles, [item.slot]: item.value } };
      else r.setup = { ...setup, items: [...setup.items, item.id] };
      return { room: r, event: ev('buy', { item: item.id, label: item.label, cost: item.cost }), result: { ok: true, item } };
    }

    // 換上已經擁有的風格（不用花好感度）
    case 'equip': {
      const item = SHOP.find((x) => x.id === extra.item);
      const setup = setupOf(r);
      if (!item || item.kind !== 'style' || shopState(item, setup).s !== 'equip') return { result: { ok: false } };
      r.setup = { ...setup, styles: { ...setup.styles, [item.slot]: item.value } };
      return { room: r, result: { ok: true, item } };
    }

    case 'note': {
      const text = String(extra.text || '').trim().slice(0, 120);
      if (!text) return { result: { ok: false } };
      r.note = { text, by: uid, byName: me, at: now };
      d.love += 1;
      return { room: r, event: ev('note', { text }), result: { ok: true } };
    }

    case 'setDog': {
      if (extra.name) d.name = String(extra.name).slice(0, 12);
      if (extra.anniversary) d.anniversary = extra.anniversary;
      return { room: r, result: { ok: true } };
    }

    case 'rename': {
      if (r.members[uid] && extra.name) r.members[uid].name = String(extra.name).slice(0, 12);
      return { room: r, result: { ok: true } };
    }
  }
  return { result: { ok: false, reason: 'unknown' } };
}

export function daysTogether(anniversary, now = new Date()) {
  if (!anniversary) return 1;
  const [y, m, dd] = anniversary.split('-').map(Number);
  const a = new Date(y, m - 1, dd);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((t - a) / 864e5) + 1);
}

export function isAnniversaryDay(anniversary, now = new Date()) {
  if (!anniversary) return false;
  const [, m, d] = anniversary.split('-').map(Number);
  return now.getMonth() + 1 === m && now.getDate() === d;
}
