import { World } from './world.js';
import { Sim, hash, dayAnchor, isNight, nightStartBefore, poopSchedule, DAY, NIGHT_OFF, POOP_DAYS } from './sim.js';
import { PALETTES } from './hamster.js';
import { makeLayout } from './layout.js';
import { SHOP, setupOf, shopState, RARITY, CATEGORIES } from './shop.js';
import { createBackend } from './sync.js';
import { withDecay, moodOf, levelInfo, daysTogether, isAnniversaryDay, TOGETHER_WINDOW, hamstersOf, MAX_HAMSTERS, SNACK_COST, scoreOf, poopPenalty, photosLeft, PHOTOS_PER_DAY } from './state.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SESSION_KEY = 'pup-session' + (new URLSearchParams(location.search).get('as') || '');
const FOOD_LABEL = { kibble: '飼料', seed: '葵花籽', fish: '小魚乾' };
const FOOD_EMOJI = { kibble: '🥣', seed: '🌻', fish: '🐟' };

let backend;
let world;
let sim;
let session = null;
let room = null;
let serverEvents = [];
const pending = new Map(); // 還沒同步回來的自己的事件（先在本機模擬，畫面才不會延遲）
let unsub = null;
let subAnchor = 0;
let firstRoom = true;
let firstEvents = true;
const seen = new Set();
let lastPetSeen = 0;
let lastComboSeen = 0;
let lastPartnerPetToast = 0;
const lastPetSent = {};
let lastPhotoAt = 0;
let tempBubble = null;
let nextChatter = 0;
let focusId = null; // 對話泡泡跟著哪一隻
let settleTried = 0;
let photoCache = [];

/* ---------------- 啟動 ---------------- */
async function boot() {
  backend = await createBackend();
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch {}
  $('#loading').classList.add('hidden');
  if (session && (await backend.exists(session.code).catch(() => false))) enterHome();
  else showSetup();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function colorPicker(name, selected = 'golden') {
  return Object.entries(PALETTES).map(([k, p]) => `
    <label class="swatch"><input type="radio" name="${name}" value="${k}" ${k === selected ? 'checked' : ''} />
      <i style="background:#${p.fur.toString(16).padStart(6, '0')}"></i><span>${p.label}</span></label>`).join('');
}

function showSetup() {
  $('#setup').classList.remove('hidden');
  $('#app').classList.add('hidden');
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  $('#createForm').anniversary.value ||= iso;
  $('#colorPick').innerHTML = colorPicker('color');
  $('#modeNote').textContent = backend.mode === 'cloud'
    ? '☁️ 已連上雲端，兩支手機會即時同步'
    : '📱 目前是單機試玩模式（尚未設定 Firebase），資料只存在這台裝置';
  const code = new URLSearchParams(location.search).get('join');
  if (code) { switchTab('join'); $('#joinForm').code.value = code.toUpperCase(); }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#createForm').classList.toggle('hidden', name !== 'create');
  $('#joinForm').classList.toggle('hidden', name !== 'join');
  $('#setupError').textContent = '';
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const code = await backend.createRoom({ myName: f.myName.value.trim(), dogName: f.dogName.value.trim(), anniversary: f.anniversary.value, color: f.color.value });
    saveSession(code);
    enterHome(true);
  } catch (err) { $('#setupError').textContent = err.message; }
});
$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const code = f.code.value.trim().toUpperCase();
  try {
    await backend.joinRoom(code, f.myName.value.trim());
    saveSession(code);
    enterHome();
  } catch (err) { $('#setupError').textContent = err.message; }
});
function saveSession(code) {
  session = { code };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function enterHome(justCreated = false) {
  $('#setup').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (!world) {
    sim = new Sim();
    world = new World($('#scene'), sim);
    world.onFrame = onFrame;
    if (location.search.includes('debug')) Object.assign(window, { world, sim });
    bindScene();
    bindTray();
  }
  firstRoom = firstEvents = true;
  subscribe();
  if (justCreated) setTimeout(() => openSettings(true), 600);
}

// 模擬每天早上 8:00 從窩裡重新開始；大便最多留 3 天，所以抓最近 3 天的事件（看誰撿了哪坨）
function subscribe() {
  unsub?.();
  subAnchor = dayAnchor(Date.now());
  serverEvents = [];
  settleTried = 0;
  unsub = backend.subscribe(session.code, onRoom, onEvents, subAnchor - POOP_DAYS * DAY);
}

/* ---------------- 資料更新 ---------------- */
const me = () => backend.uid;
const partner = () => {
  const id = Object.keys(room?.members || {}).find((k) => k !== me());
  return id ? { id, ...room.members[id] } : null;
};
const hams = () => hamstersOf(room);
const hamName = (id) => hams().find((h) => h.id === id)?.name || '倉鼠';
const allNames = () => hams().map((h) => h.name).join('、');

function mergedEvents() {
  const ids = new Set(serverEvents.map((e) => e.id));
  for (const id of pending.keys()) if (ids.has(id)) pending.delete(id);
  return serverEvents.concat([...pending.values()]);
}
function feedSim() {
  if (!room || !sim) return;
  world.setHamsters(hams());
  const L = makeLayout(setupOf(room));
  world.setLayout(L, setupOf(room).styles);
  sim.setInputs(hash(session.code), hams(), mergedEvents(), Date.now(), L);
  sim.advance(Date.now() + 30000);
  if (!firstEvents) settleOldPoops();
}

// 3 天前沒撿的大便：結算扣分（每天只做一次，兩支手機誰先算都一樣）
function settleOldPoops() {
  const day = sim.A - POOP_DAYS * DAY;
  if (settleTried === day || (room.settledTo || 0) >= day) return;
  settleTried = day;
  const cleaned = new Set([...(room.cleaned || []), ...mergedEvents().filter((e) => e.type === 'clean').map((e) => e.pid)]);
  let count = 0;
  for (const h of hams()) {
    if (h.addedAt >= day + NIGHT_OFF) continue;
    const cageAt = setupOf(room).cageAt;
    count += poopSchedule(hash(session.code), h, day).filter((p) => !cleaned.has(p.id) && p.t >= cageAt).length;
  }
  backend.act(session.code, 'settlePoops', { day, count, at: Date.now() });
}

// 現在籠子裡沒撿的大便
function dirtyPoops(now = Date.now()) {
  return sim?.ready ? sim.poopsAt(now).filter((p) => !p.cleanedAt || p.cleanedAt > now) : [];
}
function liveScore(now = Date.now()) {
  return Math.max(0, scoreOf(room) - dirtyPoops(now).reduce((s, p) => s + poopPenalty(now - p.appearAt), 0));
}

function onRoom(r) {
  const prev = room;
  room = r;
  if (firstRoom) {
    firstRoom = false;
    lastPetSeen = r.lastPet?.at || 0;
    lastComboSeen = r.combo?.at || 0;
  } else {
    const lp = r.lastPet;
    if (lp && lp.at > lastPetSeen) {
      lastPetSeen = lp.at;
      if (lp.by !== me() && Date.now() - lastPartnerPetToast > 20000 && !lp.used) {
        lastPartnerPetToast = Date.now();
        toast(`💞 ${lp.byName} 正在摸倉鼠！${TOGETHER_WINDOW / 1000} 秒內你也摸一下有加成`);
      }
    }
    if (r.combo && r.combo.at > lastComboSeen) {
      lastComboSeen = r.combo.at;
      burst(innerWidth / 2, innerHeight * 0.5, 18, ['💞', '💗', '💖', '✨']);
      toast(`💞 ${r.combo.names.join(' 和 ')} 一起摸摸！心情 +20`);
    }
    const ps = setupOf(prev);
    const ns = setupOf(r);
    if (prev && JSON.stringify(ps.styles) !== JSON.stringify(ns.styles) && ps.items.length === ns.items.length && ps.cage === ns.cage) say('哇～變漂亮了！✨', 3);
    if (prev && (ps.cage !== ns.cage || ps.items.length !== ns.items.length)) {
      const flash = $('#flash');
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      const newItem = ps.cage !== ns.cage ? SHOP.find((x) => x.id === ns.cage) : SHOP.find((x) => x.id === ns.items[ns.items.length - 1]);
      if (newItem?.id === 'annex1' || newItem?.id === 'annex2') { say('有隧道！要去隔壁探險～🚇', 4); }
      if (newItem) say(ps.cage !== ns.cage ? `哇！新家好大！🏡` : `哇！是新的${newItem.label}！`, 4);
    }
    if (prev && Object.keys(prev.members).length < 2 && Object.keys(r.members).length === 2) {
      toast(`🎉 ${partner()?.name} 回家了！現在你們可以一起照顧${allNames()}`);
    }
  }
  feedSim();
  render();
}

function onEvents(list) {
  serverEvents = list;
  if (firstEvents) {
    firstEvents = false;
    list.forEach((e) => seen.add(e.id));
  } else {
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.by === me() || Date.now() - e.at > 60000) continue;
      if (e.type === 'drop') toast(`${FOOD_EMOJI[e.kind]} ${e.byName} 放了${FOOD_LABEL[e.kind]}`);
      if (e.type === 'adopt') toast(`🐹 ${e.byName} 帶 ${e.name} 回家了！`);
      if (e.type === 'note') toast(`💌 ${e.byName} 傳話給你`);
      if (e.type === 'photo') toast(`📷 ${e.byName} 拍了一張照片（📒 相簿裡看得到）`);
      if (e.type === 'clean') toast(`🧹 ${e.byName} 撿了大便`);
      if (e.type === 'buy') toast(`🎁 ${e.byName} 換了「${e.label}」放進籠子`);
    }
  }
  feedSim();
}

/* ---------------- 畫面 ---------------- */
function render() {
  if (!room) return;
  const d = withDecay(room.dog);
  $('#dogName').textContent = allNames();
  const days = daysTogether(d.anniversary);
  $('#daysTogether').textContent = `在一起第 ${days} 天 · ${Object.values(room.members).map((m) => m.name).join(' ♥ ')}`;
  setBar('#barFull', d.fullness);
  setBar('#barJoy', d.joy);
  const lv = levelInfo(d.love);
  $('#levelText').textContent = `Lv.${lv.level} ${lv.title}`;
  $('#barLove').style.width = `${Math.round(lv.progress * 100)}%`;
  $('#photoCount').textContent = room.photos || 0;
  renderScore();
  document.querySelectorAll('.tray-item').forEach((el) => {
    el.classList.toggle('locked', (room.photos || 0) < SNACK_COST[el.dataset.kind]);
  });

  const night = isNight(Date.now());
  world.setNight(night);
  document.body.classList.toggle('night', night);
  let banner = '';
  if (night) banner = '🌙 睡覺時間（24:00–08:00），小聲一點喔';
  else if (isAnniversaryDay(d.anniversary)) banner = `🎂 今天是紀念日！`;
  else if (days % 100 === 0) banner = `🎉 在一起第 ${days} 天！`;
  $('#banner').textContent = banner;
  $('#banner').classList.toggle('hidden', !banner);
  $('#careHint').textContent = careHint();
}

function renderScore() {
  const n = dirtyPoops().length;
  $('#scoreText').textContent = `💝 好感度 ${liveScore()}`;
  $('#poopText').textContent = n ? `💩 ×${n}` : '✨ 乾淨';
  $('#poopText').classList.toggle('dirty', n > 0);
}

function setBar(sel, v) {
  const el = $(sel);
  el.style.width = `${Math.max(3, v)}%`;
  el.classList.toggle('low', v < 25);
}

function todayTally() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t = {};
  Object.keys(room.members).forEach((id) => (t[id] = { kibble: 0, seed: 0, fish: 0, pet: 0, photo: 0, note: 0, clean: 0, total: 0 }));
  mergedEvents().filter((e) => e.at >= start.getTime()).forEach((e) => {
    const x = t[e.by];
    if (!x) return;
    if (e.type === 'drop') x[e.kind]++;
    else if (e.type in x) x[e.type]++;
    x.total++;
  });
  return t;
}

function careHint() {
  const n = dirtyPoops().length;
  if (n) return `籠子裡有 ${n} 坨大便 💩 點一下就能撿起來（超過 3 小時會開始扣分）`;
  const p = partner();
  if (!p) return '把家庭碼傳給另一半，一起養吧 ✨（⚙️ 設定裡）';
  const t = todayTally();
  const a = (t[me()]?.kibble || 0) + (t[me()]?.seed || 0) + (t[me()]?.fish || 0);
  const b = (t[p.id]?.kibble || 0) + (t[p.id]?.seed || 0) + (t[p.id]?.fish || 0);
  if (a === 0 && b === 0) return '今天還沒有人放飼料喔：從下面拖進籠子裡';
  if (a + 2 <= b) return `今天 ${p.name} 餵比較多，換你放點飼料吧`;
  if (b + 2 <= a) return `今天你餵比較多！也提醒 ${p.name} 來看看 💕`;
  return '今天你們分工得很平均 👍';
}

let lastRender = 0;
let lastScore = 0;
let lastAnchorCheck = 0;
function onFrame(now) {
  if (now - lastAnchorCheck > 1000) {
    lastAnchorCheck = now;
    if (session && room && dayAnchor(now) !== subAnchor) { subscribe(); }
    if (sim?.ready && dayAnchor(now) !== sim.A) feedSim();
  }
  if (now - lastRender > 5000) { lastRender = now; render(); }
  else if (now - (lastScore || 0) > 500) { lastScore = now; if (room) { renderScore(); $('#careHint').textContent = careHint(); } }
  positionBubble(now);
}

/* ---------------- 對話泡泡 ---------------- */
function unreadNote() {
  const n = room?.note;
  if (!n || n.by === me()) return null;
  const read = Number(localStorage.getItem('pup-noteRead-' + session.code) || 0);
  return n.at > read ? n : null;
}
function say(text, sec = 3, id) {
  tempBubble = { text, until: performance.now() + sec * 1000 };
  if (id) focusId = id;
}
const CHATTER = {
  happy: ['今天好開心！', '吱！最喜歡你們了 💕', '摸摸我～', '有沒有葵花籽？🌻'],
  ok: ['吱？', '肚子有點餓…', '今天過得好嗎？'],
};
const KIND_TALK = {
  wheelRun: '衝呀～！🎡', bath: '沙浴好舒服～', hide: '', peek: '偷看～👀', dig: '挖挖挖…', eat: '好吃！', drink: '咕嘟咕嘟',
};

function positionBubble() {
  const el = $('#bubble');
  if (!room || !sim?.ready) return;
  const ids = sim.hamsterIds();
  if (!ids.length) return;
  if (!focusId || !ids.includes(focusId)) focusId = ids[0];
  const pose = sim.poseAt(focusId, Date.now());
  const hidden = ['tunnel', 'house'].includes(pose?.place);
  const now = performance.now();
  const note = unreadNote();
  const mood = moodOf(withDecay(room.dog));
  let html = '';
  let cls = 'bubble';
  if (note && !hidden) {
    html = `💌 <b>${esc(note.byName)}</b> 說：<br>${esc(note.text)}<br><small style="color:#b98">（點一下收下）</small>`;
    cls += ' note';
  } else if (tempBubble && tempBubble.until > now) {
    html = esc(tempBubble.text);
  } else if (pose && (pose.kind === 'sleep' || pose.kind === 'nap')) {
    html = 'Zzz… 💤';
    cls += ' sleep';
  } else if (!hidden && pose) {
    if (dirtyPoops().length >= 3) html = '好臭喔…幫我清一下 💩';
    else if (mood === 'hungry') html = '肚子好餓… 🥣';
    else if (mood === 'sad') html = '好想你們… 摸摸我嘛 🥺';
    else if (now > nextChatter) {
      nextChatter = now + 14000 + Math.random() * 18000;
      const t = KIND_TALK[pose.kind];
      const list = CHATTER[mood] || CHATTER.ok;
      if (t !== '') say(t || list[Math.floor(Math.random() * list.length)], 3.2);
    }
  }
  const p = world.headScreenPos(focusId);
  if (!html || !p || (hidden && !html.startsWith('💌')) || !p.inView) { el.classList.add('hidden'); el.dataset.html = ''; return; }
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.className = cls;
  el.style.left = `${Math.max(90, Math.min(innerWidth - 90, p.x))}px`;
  el.style.top = `${Math.max(!$('#banner').classList.contains('hidden') ? 285 : 235, p.y)}px`;
}
$('#bubble').addEventListener('click', () => {
  const n = unreadNote();
  if (!n) return;
  localStorage.setItem('pup-noteRead-' + session.code, String(n.at));
  const r = $('#bubble').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 8, ['💌', '💕', '💗']);
});

/* ---------------- 送出事件（先在本機模擬，再同步） ---------------- */
const newId = (at) => `${at}-${Math.random().toString(36).slice(2, 8)}`;
// delay：讓事件在「稍後」才發生，另一支手機收到時動作還沒開始 → 兩邊同時演出
async function sendEvent(type, extra, delay = 0) {
  const at = Date.now() + delay;
  const evId = newId(at);
  const local = { id: evId, at, type, by: me(), byName: room.members[me()]?.name, ...extra };
  pending.set(evId, local);
  feedSim();
  const res = await backend.act(session.code, type, { ...extra, at, evId }).catch(() => ({ ok: false }));
  if (!res?.ok) { pending.delete(evId); feedSim(); }
  return res;
}

/* ---------------- 籠子裡的手勢：點倉鼠＝摸摸、拖曳＝旋轉、兩指＝縮放／平移 ---------------- */
function bindScene() {
  const canvas = $('#scene');
  const ptrs = new Map();
  let g = null;
  let lastTap = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) g = { type: 'pending', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), ham: world.pickHamster(e.clientX, e.clientY) };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      g = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (d > 10) world.zoom(g.d / d);
      world.pan(mx - g.mx, my - g.my);
      Object.assign(g, { d, mx, my });
      return;
    }
    const dx = e.clientX - g.lx;
    const dy = e.clientY - g.ly;
    if (g.type === 'pending' && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.type = g.ham ? 'rub' : 'orbit';
    if (g.type === 'orbit') world.orbit(dx, dy);
    if (g.type === 'rub') {
      const id = world.pickHamster(e.clientX, e.clientY);
      if (id && performance.now() - (g.lastRub || 0) > 220) { g.lastRub = performance.now(); pet(id, e.clientX, e.clientY); }
    }
    g.lx = e.clientX;
    g.ly = e.clientY;
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (g?.type === 'pending' && performance.now() - g.t < 500) {
      const poop = world.pickPoop(e.clientX, e.clientY);
      if (poop) cleanPoop(poop, e.clientX, e.clientY);
      else if (g.ham) pet(g.ham, e.clientX, e.clientY);
      else {
        if (performance.now() - lastTap < 320) world.resetView();
        lastTap = performance.now();
      }
    }
    if (ptrs.size === 0) g = null;
    else if (ptrs.size === 1 && g?.type === 'pinch') { const [a] = [...ptrs.values()]; g = { type: 'orbit', lx: a.x, ly: a.y }; }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); world.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
}

async function cleanPoop(p, x, y) {
  burst(x, y, 4, ['✨', '🧹', '✨']);
  navigator.vibrate?.(15);
  const res = await sendEvent('clean', { pid: p.id, ageMs: Date.now() - p.appearAt });
  if (res?.ok) toast(res.gain > 0 ? `🧹 撿起來丟掉了！好感度 +${res.gain}` : `🧹 撿起來了，但放太久了（好感度 ${res.gain}）`);
}

function pet(id, x, y) {
  focusId = id;
  world.rigs[id]?.ham.petted();
  navigator.vibrate?.(10);
  const pose = sim.poseAt(id, Date.now());
  if (pose && (pose.kind === 'sleep' || (isNight(Date.now()) && pose.kind === 'nap'))) {
    burst(x, y, 1, ['💤']);
    say(isNight(Date.now()) ? '呼…呼…（睡覺時間別吵牠）' : '唔…', 2, id);
  } else {
    burst(x, y, 2);
    if (Math.random() < 0.3) say(['吱吱！好舒服～', '最喜歡你了 💕', '再摸摸～'][Math.floor(Math.random() * 3)], 2, id);
  }
  if (Date.now() - (lastPetSent[id] || 0) < 1500) return;
  lastPetSent[id] = Date.now();
  sendEvent('pet', { hid: id }, 400);
}

/* ---------------- 拖曳飼料／零食 ---------------- */
function bindTray() {
  const ghost = $('#dragGhost');
  let drag = null;
  document.querySelectorAll('.tray-item').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const kind = el.dataset.kind;
      if ((room?.photos || 0) < SNACK_COST[kind]) {
        toast(`📷 ${FOOD_LABEL[kind]}要 ${SNACK_COST[kind]} 張照片換，先幫牠們拍照吧！`);
        return;
      }
      drag = { kind, id: e.pointerId };
      ghost.textContent = FOOD_EMOJI[kind];
      ghost.classList.remove('hidden');
      moveGhost(e);
    });
  });
  const moveGhost = (e) => {
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY - 30}px`;
    const pt = e.clientY < $('#tray').getBoundingClientRect().top - 10 ? world.dropPoint(e.clientX, e.clientY - 30) : null;
    world.showMarker(pt);
    drag.pt = pt;
  };
  window.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) moveGhost(e); });
  const finish = async (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { kind, pt } = drag;
    drag = null;
    ghost.classList.add('hidden');
    world.showMarker(null);
    if (!pt) return;
    const res = await sendEvent('drop', { kind, x: pt.x, y: pt.y, z: pt.z, level: pt.level });
    if (!res?.ok && res?.reason === 'photos') toast('照片不夠換零食了 📷');
    else if (res?.ok && isNight(Date.now())) toast('牠們在睡覺，明天早上 8 點起床就會吃 🌙');
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

/* ---------------- 拍照：用手機相機拍一張＝1 點，可以換零食 ---------------- */
let camStream = null;
let camFacing = 'user';
function stopCam() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
}

$('#btnPhoto').addEventListener('click', () => room && openCamera());

async function openCamera() {
  stopCam();
  const left = photosLeft(room, me());
  if (left <= 0) {
    toast(`📷 今天的 ${PHOTOS_PER_DAY} 張已經拍完了，明天再來拍吧！`);
    return;
  }
  openSheet(`
    <h3>📷 拍一張照片 <span class="left-badge">今天還能拍 ${left} 張</span></h3>
    <p class="muted" style="text-align:left">拍你們的日常、自拍、今天吃的東西都可以～每拍 1 張得 1 點，可以換零食給倉鼠。每人每天最多 ${PHOTOS_PER_DAY} 張。</p>
    <div class="cam-wrap"><video id="camVideo" autoplay playsinline muted></video><div id="camMsg" class="cam-msg">相機開啟中…</div></div>
    <div class="cam-ctrl">
      <button class="secondary" id="camFlip" aria-label="切換鏡頭">🔄</button>
      <button class="shutter" id="camShot" aria-label="拍照"></button>
      <button class="secondary" id="camPick" aria-label="用系統相機">📱</button>
    </div>
    <input type="file" id="camFile" accept="image/*" capture="user" hidden />
    <p class="mode-note">🌻 葵花籽＝1 張照片　🐟 小魚乾＝2 張照片　｜ 目前有 ${room.photos || 0} 張</p>`);
  $('#camFlip').addEventListener('click', () => { camFacing = camFacing === 'user' ? 'environment' : 'user'; startStream(); });
  $('#camShot').addEventListener('click', shoot);
  $('#camPick').addEventListener('click', () => { $('#camFile').setAttribute('capture', camFacing); $('#camFile').click(); });
  $('#camFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(file); });
    finishPhoto(img, img.naturalWidth, img.naturalHeight, false);
  });
  startStream();
}

async function startStream() {
  stopCam();
  const v = $('#camVideo');
  if (!v) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
    if (!$('#camVideo')) { stopCam(); return; }
    v.srcObject = camStream;
    v.classList.toggle('mirror', camFacing === 'user');
    $('#camMsg').classList.add('hidden');
  } catch (err) {
    // 沒有權限或不支援 → 改用系統相機
    $('#camMsg').innerHTML = '沒辦法直接開相機<br>按右下 📱 用手機相機拍';
  }
}

function shoot() {
  const v = $('#camVideo');
  if (!v || !camStream || !v.videoWidth) { $('#camPick')?.click(); return; }
  finishPhoto(v, v.videoWidth, v.videoHeight, camFacing === 'user');
}

function shrink(canvas, max, q) {
  const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function finishPhoto(src, w, h, mirror) {
  const flash = $('#flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  navigator.vibrate?.(30);
  // 縮到最長邊 1600，加上日期小字
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d');
  if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(src, 0, 0, c.width, c.height);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const s = c.width / 400;
  const d = new Date();
  g.font = `600 ${13 * s}px -apple-system, "PingFang TC", sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 4 * s;
  g.fillText(`🐹 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} · 一起養倉鼠`, 12 * s, c.height - 14 * s);
  const url = c.toDataURL('image/jpeg', 0.9);
  stopCam();

  let gained = '太快了，隔幾秒再拍才算數喔';
  let canAgain = true;
  if (Date.now() - lastPhotoAt > 3000) {
    lastPhotoAt = Date.now();
    const photoId = newId(Date.now());
    const res = await backend.act(session.code, 'photo', { at: Date.now(), photoId });
    if (res?.ok) {
      // 上傳一張縮小的版本，另一半在相簿裡看得到
      const thumb = shrink(c, 720, 0.72);
      backend.addPhoto(session.code, { id: photoId, by: me(), byName: room.members[me()]?.name || '', at: Date.now(), data: thumb }).catch(() => toast('照片上傳失敗，只存在這支手機'));
      photoCache = [{ id: photoId, byName: room.members[me()]?.name, at: Date.now(), data: thumb }, ...photoCache];
      gained = `📷 +1！現在有 ${res.photos} 張可以換零食｜今天還能拍 ${res.left} 張`;
      canAgain = res.left > 0;
    } else if (res?.reason === 'limit') {
      gained = `今天的 ${PHOTOS_PER_DAY} 張已經拍完了，明天再來吧（這張只會存在你的手機）`;
      canAgain = false;
    }
  }
  openSheet(`
    <h3>📸 拍好了！</h3>
    <img class="photo" src="${url}" alt="照片" />
    <p class="muted">${gained}</p>
    <div class="row">${canAgain ? '<button class="secondary" id="again">再拍一張</button>' : ''}<button class="primary" id="savePhoto">儲存／分享</button></div>
    <p class="mode-note">把零食從下面拖進籠子：🌻 葵花籽 1 張　🐟 小魚乾 2 張</p>`);
  $('#again')?.addEventListener('click', openCamera);
  $('#savePhoto').addEventListener('click', async () => {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); }
    } catch {}
  });
}

/* ---------------- 商店：用好感度換籠子和玩具 ---------------- */
let shopTab = 'all';
function openShop(tab = shopTab) {
  shopTab = tab;
  const setup = setupOf(room);
  const pts = liveScore();
  const cageName = { small: '小籠子', medium: '中籠子', big: '雙層大籠子' }[setup.cage];
  // 分組：同一類放一起，預設款排最前面（才能換回來），其餘依價格由便宜到貴
  const byCost = (a, b) => (b.base ? 1 : 0) - (a.base ? 1 : 0) || a.cost - b.cost;
  const SLOT = { bedding: '🧻 墊料', cageColor: '🎨 籠子顏色', wheel: '🎡 滾輪造型', room: '🖼️ 房間主題', nest: '🛏️ 窩的造型', house: '🏠 小屋造型' };
  let groups;
  if (tab === 'all') groups = CATEGORIES.filter((c) => c.id !== 'all').map((c) => ({ title: c.label, items: SHOP.filter((it) => it.cat === c.id && !it.base).sort(byCost) }));
  else if (tab === 'style' || tab === 'home') {
    const base = SHOP.filter((it) => it.cat === tab && it.kind !== 'style').sort(byCost);
    groups = base.length ? [{ title: '✨ 設施', items: base }] : [];
    for (const slot of Object.keys(SLOT)) {
      const items = SHOP.filter((it) => it.cat === tab && it.slot === slot).sort(byCost);
      if (items.length) groups.push({ title: SLOT[slot], items });
    }
  } else groups = [{ title: '', items: SHOP.filter((it) => it.cat === tab).sort(byCost) }];
  const card = (it) => {
    const st = shopState(it, setup);
    const rar = RARITY[it.rarity];
    let foot;
    if (st.s === 'owned') foot = '<span class="tag owned">已擁有 ✓</span>';
    else if (st.s === 'equipped') foot = '<span class="tag owned">使用中 ✓</span>';
    else if (st.s === 'equip') foot = `<button class="secondary buy" data-equip="${it.id}">裝上</button>`;
    else if (st.s === 'needs') foot = `<span class="tag needs">${st.reason}</span>`;
    else if (pts >= it.cost) foot = `<button class="primary buy" data-buy="${it.id}">💝 ${it.cost}</button>`;
    else foot = `<span class="tag poor">💝 ${it.cost}<small>還差 ${it.cost - pts}</small></span>`;
    return `<li class="card r-${it.rarity} s-${st.s}">
      <div class="card-top" style="background:${rar.bg}"><span class="rar" style="background:${rar.color}">${rar.label}</span><b class="emo">${it.emoji}</b></div>
      <div class="card-body"><div class="name">${it.label}</div><div class="desc">${it.desc}</div></div>
      <div class="card-foot">${foot}</div></li>`;
  };
  openSheet(`
    <h3>🛒 倉鼠商店</h3>
    <div class="shop-top"><span>現在住：<b>${cageName}</b>${setup.items.includes('annex1') ? ' ＋遊戲籠' + (setup.items.includes('annex2') ? ' ×2' : '') : ''}</span><span class="pts">💝 <b>${pts}</b></span></div>
    <div class="shop-tabs">${CATEGORIES.map((c) => `<button class="${c.id === tab ? 'on' : ''}" data-tab="${c.id}">${c.label}</button>`).join('')}</div>
    ${groups.map((g) => `${g.title ? `<div class="shop-sec">${g.title}</div>` : ''}<ul class="cards">${g.items.map(card).join('')}</ul>`).join('')}
    <p class="mode-note">✨ 越稀有、越酷炫的東西越貴：普通 → 稀有 → 史詩 → 傳說<br>摸摸、餵食、撿大便、拍照都會增加好感度。換來的東西兩個人一起用，另一支手機也會馬上看到。</p>`);
  document.querySelectorAll('.shop-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    const y = $('.sheet').scrollTop;
    openShop(b.dataset.tab);
    $('.sheet').scrollTop = Math.min(y, 60);
  }));
  document.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', async () => {
    const res = await backend.act(session.code, 'equip', { item: b.dataset.equip, at: Date.now() });
    if (res?.ok) { toast(`✨ 換上「${res.item.label}」`); openShop(tab); }
  }));
  document.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', async () => {
    const it = SHOP.find((x) => x.id === b.dataset.buy);
    if (!confirm(`用 ${it.cost} 好感度換「${it.label}」？`)) return;
    b.disabled = true;
    const res = await backend.act(session.code, 'buy', { item: it.id, at: Date.now() });
    if (res?.ok) {
      closeSheet();
      toast(`🎁 換到「${it.label}」了！`);
      if (it.rarity === 'legendary' || it.rarity === 'epic') burst(innerWidth / 2, innerHeight / 2, 16, ['✨', '🎉', '💖', '⭐']);
    } else {
      toast(res?.reason === 'points' ? '好感度不夠，再多照顧牠們一下吧 💝' : '現在不能換這個喔');
      b.disabled = false;
    }
  }));
}
$('#btnShop').addEventListener('click', () => room && openShop());

/* ---------------- 抽屜：傳話 / 紀錄 / 設定 ---------------- */
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() { stopCam(); $('#sheet').classList.add('hidden'); }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('.sheet-close')) closeSheet(); });

$('#btnNote').addEventListener('click', () => {
  if (!room) return;
  const p = partner();
  openSheet(`
    <h3>💌 透過倉鼠傳話</h3>
    <p class="muted" style="text-align:left">${p ? `${esc(p.name)} 打開 app 時，倉鼠會把這句話帶給對方看` : '另一半加入後就能收到你的話喔'}</p>
    <form class="form" id="noteForm">
      <textarea name="text" maxlength="120" placeholder="今天也辛苦了，晚上一起吃飯？"></textarea>
      <button class="primary" type="submit">交給倉鼠 🐹</button>
    </form>`);
  $('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    const res = await backend.act(session.code, 'note', { text });
    if (res?.ok) { closeSheet(); toast('倉鼠收到了，會幫你送過去 💌'); }
  });
});

const EV_TEXT = {
  drop: (e) => `${FOOD_EMOJI[e.kind]} ${e.byName} 放了${FOOD_LABEL[e.kind]}`,
  clean: (e) => `🧹 ${e.byName} 撿了大便${e.gain != null ? `（${e.gain > 0 ? '+' : ''}${e.gain} 分）` : ''}`,
  pet: (e) => (e.together ? `💞 ${e.with} 和 ${e.byName} 一起摸 ${hamName(e.hid)}` : null),
  note: (e) => `💌 ${e.byName}：「${e.text}」`,
  photo: (e) => `📷 ${e.byName} 拍了照片`,
  adopt: (e) => `🐹 ${e.byName} 帶 ${e.name} 回家`,
  settle: (e) => `😢 有 ${e.count} 坨大便放了 3 天都沒撿，好感度 -${e.count * 5}`,
  buy: (e) => `🛒 ${e.byName} 換了「${e.label || e.item}」`,
};
function fmtTime(at) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  const hm = d.toTimeString().slice(0, 5);
  return today ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

async function openLog(tab = 'log') {
  const t = todayTally();
  const tallyHtml = Object.entries(room.members).map(([id, m]) => {
    const x = t[id] || {};
    return `<div><div class="who">${esc(m.name)}${id === me() ? '（你）' : ''}</div>
      <div class="nums">🥣 飼料 ${x.kibble || 0}　🌻 ${x.seed || 0}　🐟 ${x.fish || 0}<br>🧹 撿大便 ${x.clean || 0}　📷 拍照 ${x.photo || 0}<br>✋ 摸摸 ${x.pet || 0}</div></div>`;
  }).join('');
  const thumbs = new Map(photoCache.map((p) => [p.id, p]));
  const items = [...mergedEvents()].reverse().map((e) => {
    const txt = EV_TEXT[e.type]?.(e);
    if (!txt) return '';
    const ph = e.type === 'photo' && thumbs.get(e.photoId);
    const mine = e.by === me() ? ' mine' : '';
    return `<li class="ev${mine}"><time>${fmtTime(e.at)}</time><span>${esc(txt)}${ph ? `<img class="thumb" data-photo="${ph.id}" src="${ph.data}" alt="" />` : ''}</span></li>`;
  }).filter(Boolean).slice(0, 80).join('');
  const album = photoCache.length
    ? `<div class="album">${photoCache.map((p) => `<figure data-photo="${p.id}"><img src="${p.data}" alt="" /><figcaption>${esc(p.byName || '')} · ${fmtTime(p.at)}</figcaption></figure>`).join('')}</div>`
    : '<p class="muted">還沒有照片，按下面 📷 拍第一張吧！</p>';
  openSheet(`
    <h3>📒 我們的紀錄</h3>
    <div class="tabs log-tabs">
      <button class="tab ${tab === 'log' ? 'active' : ''}" data-ltab="log">紀錄</button>
      <button class="tab ${tab === 'album' ? 'active' : ''}" data-ltab="album">相簿（${photoCache.length}）</button>
    </div>
    <div class="${tab === 'log' ? '' : 'hidden'}">
      <div class="section-title">今天的分工</div>
      <div class="tally">${tallyHtml}</div>
      <div class="section-title">最近 3 天發生的事</div>
      <ul class="log">${items || '<li><span class="muted">還沒有紀錄</span></li>'}</ul>
    </div>
    <div class="${tab === 'album' ? '' : 'hidden'}">${album}</div>`);
  document.querySelectorAll('[data-ltab]').forEach((b) => b.addEventListener('click', () => openLog(b.dataset.ltab)));
  document.querySelectorAll('[data-photo]').forEach((el) => el.addEventListener('click', () => {
    const p = photoCache.find((x) => x.id === el.dataset.photo);
    if (p) openSheet(`<h3>📷 ${esc(p.byName || '')} · ${fmtTime(p.at)}</h3><img class="photo" src="${p.data}" alt="" /><div class="row"><button class="secondary" id="backLog">回到相簿</button></div>`);
    $('#backLog')?.addEventListener('click', () => openLog('album'));
  }));
  // 背景更新照片（另一半拍的也看得到）
  if (!openLog.loading) {
    openLog.loading = true;
    try {
      const list = await backend.listPhotos(session.code, 40);
      const changed = list.length !== photoCache.length || list[0]?.id !== photoCache[0]?.id;
      photoCache = list;
      if (changed && !$('#sheet').classList.contains('hidden') && document.querySelector('.log-tabs')) openLog(tab);
    } catch {}
    openLog.loading = false;
  }
}

function openSettings(welcome = false) {
  const d = room.dog;
  const list = hams();
  const joinUrl = `${location.origin}${location.pathname}?join=${session.code}`;
  openSheet(`
    <h3>${welcome ? '🎉 領養成功！' : '⚙️ 設定'}</h3>
    ${welcome ? `<p class="muted" style="text-align:left">把家庭碼傳給另一半，對方選「加入另一半的家」輸入就能一起養。</p>` : ''}
    <div class="code-box"><div><div class="sub">家庭碼</div><b>${session.code}</b></div><button class="secondary" id="copyCode">複製邀請</button></div>
    <div class="members">${Object.entries(room.members).map(([id, m]) => `<span class="chip">${id === me() ? '🙋 ' : '💕 '}${esc(m.name)}</span>`).join('')}${Object.keys(room.members).length < 2 ? '<span class="chip">⏳ 等另一半加入</span>' : ''}</div>

    <div class="section-title">🐹 籠子裡的倉鼠（${list.length}/${MAX_HAMSTERS}）</div>
    <div class="ham-list">${list.map((h) => `<span class="chip"><i class="dot" style="background:#${(PALETTES[h.color] || PALETTES.golden).fur.toString(16).padStart(6, '0')}"></i>${esc(h.name)}</span>`).join('')}</div>
    ${list.length < MAX_HAMSTERS ? `
    <details class="adopt"><summary>＋ 再領養一隻（最多 ${MAX_HAMSTERS} 隻）</summary>
      <form class="form" id="adoptForm">
        <label>名字<input name="name" maxlength="10" required placeholder="例如：麻糬" /></label>
        <div class="swatches">${colorPicker('color', ['white', 'gray', 'choco'][list.length - 1] || 'golden')}</div>
        <button class="primary" type="submit">帶牠回家 🏠</button>
      </form>
    </details>` : ''}

    <form class="form" id="dogForm" style="margin-top:14px">
      <label>紀念日<input name="anniversary" type="date" value="${esc(d.anniversary)}" /></label>
      <label>我的暱稱<input name="myName" maxlength="12" value="${esc(room.members[me()]?.name)}" /></label>
      <button class="primary" type="submit">儲存</button>
    </form>
    <p class="mode-note" style="margin-top:14px">${backend.mode === 'cloud' ? '☁️ 雲端同步中：兩支手機看到的倉鼠動作一樣' : '📱 單機試玩模式：設定 Firebase 後兩支手機才會同步（見 README）'}</p>
    <div class="row" style="margin-top:12px"><button class="secondary" id="leaveHome">離開這個家</button></div>`);
  $('#copyCode').addEventListener('click', async () => {
    const text = `來跟我一起養 ${allNames()} 🐹\n家庭碼：${session.code}\n${joinUrl}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('已複製邀請 ✨'); }
    } catch {}
  });
  $('#adoptForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const res = await backend.act(session.code, 'adopt', { name: f.name.value.trim(), color: f.color.value, at: Date.now() });
    if (res?.ok) { closeSheet(); toast(`🎉 ${res.hamster.name} 來到新家了！`); focusId = res.hamster.id; }
    else if (res?.reason === 'max') toast(`一個籠子最多 ${MAX_HAMSTERS} 隻喔`);
  });
  $('#dogForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await backend.act(session.code, 'setDog', { anniversary: f.anniversary.value });
    if (f.myName.value.trim()) await backend.act(session.code, 'rename', { name: f.myName.value.trim() });
    closeSheet();
    toast('已儲存 ✅');
  });
  $('#leaveHome').addEventListener('click', () => {
    if (!confirm('確定要離開嗎？之後可以用家庭碼再加入。')) return;
    localStorage.removeItem(SESSION_KEY);
    unsub?.();
    room = null;
    closeSheet();
    showSetup();
  });
}
$('#btnSettings').addEventListener('click', () => room && openSettings());
$('#btnLog').addEventListener('click', () => room && openLog());

/* ---------------- 小工具 ---------------- */
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3300);
}
function burst(x, y, n = 3, emojis = ['💗', '💕', '❤️']) {
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    h.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    h.style.top = `${y + (Math.random() - 0.5) * 30}px`;
    h.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    h.style.animationDelay = `${i * 0.05}s`;
    $('#fx').appendChild(h);
    setTimeout(() => h.remove(), 1500);
  }
}

boot();
