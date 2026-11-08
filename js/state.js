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

export function newRoom({ dogName, anniversary, myName }, uid) {
  const now = Date.now();
  return {
    createdAt: now,
    dog: { name: dogName, anniversary, fullness: 80, joy: 80, love: 0, updatedAt: now },
    members: { [uid]: { name: myName, joinedAt: now } },
    lastPet: null,
    combo: null,
    note: null,
    petLog: {},
  };
}

/**
 * 套用一個動作。回傳 { room?, event?, result }
 * room 有值才需要寫回；event 有值才寫進紀錄。
 */
export function applyAction(room, type, uid, extra = {}, now = Date.now()) {
  const r = JSON.parse(JSON.stringify(room));
  const d = (r.dog = withDecay(r.dog, now));
  const me = r.members?.[uid]?.name || '?';
  const ev = (t, more = {}) => ({
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    type: t, by: uid, byName: me, at: now, ...more,
  });

  switch (type) {
    case 'feed':
      if (d.fullness >= 90) return { result: { ok: false, reason: 'full' } };
      d.fullness = clamp(d.fullness + 30);
      d.joy = clamp(d.joy + 4);
      d.love += 2;
      return { room: r, event: ev('feed'), result: { ok: true } };

    case 'wheel':
      if (d.fullness < 10) return { result: { ok: false, reason: 'hungry' } };
      d.joy = clamp(d.joy + 12);
      d.fullness = clamp(d.fullness - 4);
      d.love += 2;
      return { room: r, event: ev('wheel'), result: { ok: true } };

    case 'sleep':
      d.joy = clamp(d.joy + 3);
      return { room: r, event: ev('sleep'), result: { ok: true } };

    case 'pet': {
      const lp = r.lastPet;
      let together = false;
      let event = null;
      if (lp && lp.by !== uid && now - lp.at < TOGETHER_WINDOW && !lp.used) {
        together = true;
        d.joy = clamp(d.joy + 20);
        d.love += 5;
        r.combo = { at: now, names: [lp.byName, me] };
        event = ev('together', { with: lp.byName });
      }
      const prev = (r.petLog || {})[uid] || 0;
      if (now - prev > 60000) {
        d.joy = clamp(d.joy + 5);
        d.love += 1;
        r.petLog = { ...(r.petLog || {}), [uid]: now };
        event = event || ev('pet');
      } else {
        d.joy = clamp(d.joy + 1);
      }
      r.lastPet = { by: uid, byName: me, at: now, used: together };
      return { room: r, event, result: { ok: true, together } };
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
