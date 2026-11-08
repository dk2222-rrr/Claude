import { World } from './world.js';
import { createBackend } from './sync.js';
import { withDecay, moodOf, levelInfo, daysTogether, isAnniversaryDay, TOGETHER_WINDOW } from './state.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SESSION_KEY = 'pup-session' + (new URLSearchParams(location.search).get('as') || '');

let backend;
let world;
let session = null; // { code }
let room = null;
let events = [];
let unsub = null;
let firstRoom = true;
let firstEvents = true;
const seen = new Set();
let lastPetSeen = 0;
let lastComboSeen = 0;
let lastPartnerPetToast = 0;
let lastPetSent = 0;
let tempBubble = null; // { text, until }
let nextChatter = 0;

/* ---------------- 啟動 ---------------- */
async function boot() {
  backend = await createBackend();
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch {}
  $('#loading').classList.add('hidden');
  if (session && (await backend.exists(session.code).catch(() => false))) enterHome();
  else showSetup();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function showSetup() {
  $('#setup').classList.remove('hidden');
  $('#app').classList.add('hidden');
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  $('#createForm').anniversary.value ||= iso;
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
    const code = await backend.createRoom({ myName: f.myName.value.trim(), dogName: f.dogName.value.trim(), anniversary: f.anniversary.value });
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
    world = new World($('#scene'));
    world.onFrame = positionBubble;
    if (location.search.includes('debug')) window.world = world;
    bindScene();
  }
  firstRoom = firstEvents = true;
  unsub?.();
  unsub = backend.subscribe(session.code, onRoom, onEvents);
  if (justCreated) setTimeout(() => openSettings(true), 600);
}

/* ---------------- 資料更新 ---------------- */
const me = () => backend.uid;
const partner = () => {
  const id = Object.keys(room?.members || {}).find((k) => k !== me());
  return id ? { id, ...room.members[id] } : null;
};
const petName = () => room?.dog?.name || '倉鼠';

function onRoom(r) {
  const prev = room;
  room = r;
  if (firstRoom) {
    firstRoom = false;
    lastPetSeen = r.lastPet?.at || 0;
    lastComboSeen = r.combo?.at || 0;
  } else {
    // 另一半正在摸摸
    const lp = r.lastPet;
    if (lp && lp.at > lastPetSeen) {
      lastPetSeen = lp.at;
      if (lp.by !== me()) {
        world.ham.petted();
        if (Date.now() - lastPartnerPetToast > 20000 && !lp.used) {
          lastPartnerPetToast = Date.now();
          toast(`💞 ${lp.byName} 正在摸摸${petName()}！${TOGETHER_WINDOW / 1000} 秒內一起摸有加成`);
        }
      }
    }
    if (r.combo && r.combo.at > lastComboSeen) {
      lastComboSeen = r.combo.at;
      celebrateTogether(r.combo.names);
    }
    if (prev && Object.keys(prev.members).length < 2 && Object.keys(r.members).length === 2) {
      toast(`🎉 ${partner()?.name} 回家了！現在你們可以一起照顧${petName()}`);
    }
  }
  render();
}

function onEvents(list) {
  events = list;
  if (firstEvents) {
    firstEvents = false;
    list.forEach((e) => seen.add(e.id));
    return;
  }
  // 另一半剛做的事 → 在這支手機上也播放動畫
  [...list].reverse().forEach((e) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    if (e.by === me() || Date.now() - e.at > 60000) return;
    if (e.type === 'feed') { toast(`🌻 ${e.byName} 餵了${petName()}`); if (!world.userBusy) world.feed(); }
    if (e.type === 'wheel') { toast(`🎡 ${e.byName} 叫${petName()}去跑滾輪`); if (!world.userBusy) world.runWheel(); }
    if (e.type === 'sleep') { toast(`💤 ${e.byName} 哄${petName()}睡覺了`); if (!world.userBusy) world.putToSleep(); }
    if (e.type === 'note') { toast(`💌 ${e.byName} 透過${petName()}傳話給你`); world.happyHop(); }
  });
}

/* ---------------- 畫面 ---------------- */
function currentDog() {
  return room ? withDecay(room.dog) : null;
}

function render() {
  if (!room) return;
  const d = currentDog();
  $('#dogName').textContent = d.name;
  const days = daysTogether(d.anniversary);
  $('#daysTogether').textContent = `在一起第 ${days} 天 · ${Object.values(room.members).map((m) => m.name).join(' ♥ ')}`;
  setBar('#barFull', d.fullness);
  setBar('#barJoy', d.joy);
  const lv = levelInfo(d.love);
  $('#levelText').textContent = `Lv.${lv.level} ${lv.title}`;
  $('#barLove').style.width = `${Math.round(lv.progress * 100)}%`;
  world.ham.setMood(moodOf(d));

  let banner = '';
  if (isAnniversaryDay(d.anniversary)) banner = `🎂 今天是紀念日，也是${d.name}的生日！`;
  else if (days % 100 === 0) banner = `🎉 在一起第 ${days} 天！`;
  $('#banner').textContent = banner;
  $('#banner').classList.toggle('hidden', !banner);

  $('#careHint').textContent = careHint();
}

function setBar(sel, v) {
  const el = $(sel);
  el.style.width = `${Math.max(3, v)}%`;
  el.classList.toggle('low', v < 25);
}

function todayTally() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t = {};
  Object.keys(room.members).forEach((id) => (t[id] = { feed: 0, wheel: 0, pet: 0, note: 0, sleep: 0, total: 0 }));
  events.filter((e) => e.at >= start.getTime()).forEach((e) => {
    const x = t[e.by];
    if (!x) return;
    const k = e.type === 'together' ? 'pet' : e.type;
    if (k in x) x[k]++;
    x.total++;
  });
  return t;
}

function careHint() {
  const p = partner();
  if (!p) return '把家庭碼傳給另一半，一起養吧 ✨（⚙️ 設定裡）';
  const t = todayTally();
  const a = t[me()]?.total || 0;
  const b = t[p.id]?.total || 0;
  if (a === 0 && b === 0) return `今天還沒有人照顧${petName()}喔`;
  if (a + 2 <= b) return `今天 ${p.name} 照顧比較多，換你陪陪${petName()}吧`;
  if (b + 2 <= a) return `今天你辛苦了！也提醒 ${p.name} 來看看${petName()} 💕`;
  return '今天你們分工得很平均 👍';
}

setInterval(() => room && render(), 5000);

/* ---------------- 對話泡泡 ---------------- */
function unreadNote() {
  const n = room?.note;
  if (!n || n.by === me()) return null;
  const read = Number(localStorage.getItem('pup-noteRead-' + session.code) || 0);
  return n.at > read ? n : null;
}

function say(text, sec = 3) {
  tempBubble = { text, until: performance.now() + sec * 1000 };
}

const CHATTER = {
  happy: ['今天好開心！', '吱！最喜歡你們了 💕', '想跑滾輪～🎡', '摸摸我～'],
  ok: ['吱？', '有沒有瓜子…', '今天過得好嗎？'],
};

const banner = () => !$('#banner').classList.contains('hidden');

function positionBubble() {
  const el = $('#bubble');
  if (!room) return;
  const now = performance.now();
  const note = unreadNote();
  let html = '';
  let cls = 'bubble';
  if (note && !world.userBusy && !world.sleeping) {
    html = `💌 <b>${esc(note.byName)}</b> 說：<br>${esc(note.text)}<br><small style="color:#b98">（點一下收下）</small>`;
    cls += ' note';
  } else if (tempBubble && tempBubble.until > now) {
    html = esc(tempBubble.text);
  } else if (world.sleeping) {
    html = 'Zzz… 💤';
    cls += ' sleep';
  } else if (!world.userBusy) {
    const m = world.ham.mood;
    if (m === 'hungry') html = '肚子好餓… 🌻';
    else if (m === 'sad') html = '好想你們… 摸摸我嘛 🥺';
    else if (now > nextChatter) {
      nextChatter = now + 15000 + Math.random() * 20000;
      const list = CHATTER[m] || CHATTER.ok;
      say(list[Math.floor(Math.random() * list.length)], 3.5);
    }
  }
  if (!html) { el.classList.add('hidden'); el.dataset.html = ''; return; }
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.className = cls;
  const p = world.headScreenPos();
  el.style.left = `${Math.max(90, Math.min(innerWidth - 90, p.x))}px`;
  el.style.top = `${Math.max(banner() ? 250 : 200, p.y)}px`;
}

$('#bubble').addEventListener('click', () => {
  const n = unreadNote();
  if (!n) return;
  localStorage.setItem('pup-noteRead-' + session.code, String(n.at));
  const r = $('#bubble').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 8, ['💌', '💕', '💗']);
  world.happyHop();
});

/* ---------------- 互動 ---------------- */
function bindScene() {
  const canvas = $('#scene');
  let rubbing = false;
  let lastRub = 0;
  canvas.addEventListener('pointerdown', (e) => {
    world.setLook(e.clientX, e.clientY);
    if (world.hitHamster(e.clientX, e.clientY)) {
      rubbing = true;
      pet(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    world.setLook(e.clientX, e.clientY);
    if (rubbing && performance.now() - lastRub > 220 && world.hitHamster(e.clientX, e.clientY)) {
      lastRub = performance.now();
      pet(e.clientX, e.clientY);
    }
  });
  const stop = () => (rubbing = false);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

async function pet(x, y) {
  world.touch();
  if (world.sleeping) {
    world.wake();
    say('唔…被吵醒了 😪', 2);
  }
  world.ham.petted();
  burst(x, y, 2);
  navigator.vibrate?.(10);
  if (Date.now() - lastPetSent < 2000) return;
  lastPetSent = Date.now();
  await backend.act(session.code, 'pet'); // 「一起摸摸」的慶祝由 onRoom 觸發
}

function celebrateTogether(names = []) {
  burst(innerWidth / 2, innerHeight * 0.5, 18, ['💞', '💗', '💖', '✨']);
  toast(`💞 ${names.join(' 和 ')} 一起摸摸！心情 +20`);
  say('最喜歡你們兩個了！！', 3);
  world.celebrate();
}

document.querySelectorAll('#actions button').forEach((b) => b.addEventListener('click', () => onAction(b.dataset.act)));

async function onAction(act) {
  if (!room) return;
  if (act === 'log') return openLog();
  if (act === 'note') return openNote();
  const res = await backend.act(session.code, act);
  if (!res?.ok) {
    if (res?.reason === 'full') { say('頰囊塞不下了啦～ 😋', 2); world.happyHop(); }
    if (res?.reason === 'hungry') say('太餓了，玩不動… 🍖', 2.5);
    return;
  }
  if (act === 'feed') { say('瓜子！瓜子！🌻', 1.5); world.feed().then(() => !world.sleeping && say('塞滿頰囊了！謝謝 💕', 2.5)); }
  if (act === 'wheel') { say('衝呀～！', 1.5); world.runWheel(); }
  if (act === 'sleep') { say('呼啊…想睡了', 2); world.putToSleep(); }
}

/* ---------------- 抽屜：傳話 / 紀錄 / 設定 ---------------- */
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() { $('#sheet').classList.add('hidden'); }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('.sheet-close')) closeSheet(); });

function openNote() {
  const p = partner();
  openSheet(`
    <h3>💌 透過${esc(petName())}傳話</h3>
    <p class="muted" style="text-align:left">${p ? `${esc(p.name)} 打開 app 時，${esc(petName())}會把這句話帶給對方看` : '另一半加入後就能收到你的話喔'}</p>
    <form class="form" id="noteForm">
      <textarea name="text" maxlength="120" placeholder="今天也辛苦了，晚上一起吃飯？"></textarea>
      <button class="primary" type="submit">交給${esc(petName())} 🐹</button>
    </form>`);
  $('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    const res = await backend.act(session.code, 'note', { text });
    if (res?.ok) {
      closeSheet();
      toast(`${petName()}收到了，會幫你送過去 💌`);
      world.happyHop();
    }
  });
}

const EV_TEXT = {
  feed: (e) => `🌻 ${e.byName} 餵了瓜子`,
  wheel: (e) => `🎡 ${e.byName} 叫牠跑滾輪`,
  sleep: (e) => `💤 ${e.byName} 哄睡覺`,
  pet: (e) => `✋ ${e.byName} 摸摸`,
  note: (e) => `💌 ${e.byName}：「${e.text}」`,
  together: (e) => `💞 ${e.with} 和 ${e.byName} 一起摸摸`,
};

function fmtTime(at) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  const hm = d.toTimeString().slice(0, 5);
  return today ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function openLog() {
  const t = todayTally();
  const tallyHtml = Object.entries(room.members).map(([id, m]) => {
    const x = t[id] || {};
    return `<div><div class="who">${esc(m.name)}${id === me() ? '（你）' : ''}</div>
      <div class="nums">🌻 餵食 ${x.feed || 0}　🎡 滾輪 ${x.wheel || 0}<br>✋ 摸摸 ${x.pet || 0}　💤 哄睡 ${x.sleep || 0}　💌 ${x.note || 0}</div></div>`;
  }).join('');
  const items = events.slice(0, 60).map((e) => `<li><time>${fmtTime(e.at)}</time><span>${esc((EV_TEXT[e.type] || (() => e.type))(e))}</span></li>`).join('');
  openSheet(`
    <h3>📒 照顧紀錄</h3>
    <div class="section-title">今天的分工</div>
    <div class="tally">${tallyHtml}</div>
    <div class="section-title">最近發生的事</div>
    <ul class="log">${items || '<li><span class="muted">還沒有紀錄</span></li>'}</ul>`);
}

function openSettings(welcome = false) {
  const d = room.dog;
  const joinUrl = `${location.origin}${location.pathname}?join=${session.code}`;
  openSheet(`
    <h3>${welcome ? '🎉 領養成功！' : '⚙️ 設定'}</h3>
    ${welcome ? `<p class="muted" style="text-align:left">把家庭碼傳給另一半，對方選「加入另一半的家」輸入就能一起養 ${esc(d.name)}。</p>` : ''}
    <div class="code-box"><div><div class="sub">家庭碼</div><b>${session.code}</b></div><button class="secondary" id="copyCode">複製邀請</button></div>
    <div class="members">${Object.entries(room.members).map(([id, m]) => `<span class="chip">${id === me() ? '🙋 ' : '💕 '}${esc(m.name)}</span>`).join('')}${Object.keys(room.members).length < 2 ? '<span class="chip">⏳ 等另一半加入</span>' : ''}</div>
    <form class="form" id="dogForm">
      <label>倉鼠名字<input name="name" maxlength="12" value="${esc(d.name)}" /></label>
      <label>紀念日<input name="anniversary" type="date" value="${esc(d.anniversary)}" /></label>
      <label>我的暱稱<input name="myName" maxlength="12" value="${esc(room.members[me()]?.name)}" /></label>
      <button class="primary" type="submit">儲存</button>
    </form>
    <p class="mode-note" style="margin-top:14px">${backend.mode === 'cloud' ? '☁️ 雲端同步中' : '📱 單機試玩模式：設定 Firebase 後兩支手機才會同步（見 README）'}</p>
    <div class="row" style="margin-top:12px"><button class="secondary" id="leaveHome">離開這個家</button></div>`);
  $('#copyCode').addEventListener('click', async () => {
    const text = `來跟我一起養 ${d.name} 🐶\n家庭碼：${session.code}\n${joinUrl}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('已複製邀請 ✨'); }
    } catch {}
  });
  $('#dogForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await backend.act(session.code, 'setDog', { name: f.name.value.trim(), anniversary: f.anniversary.value });
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
