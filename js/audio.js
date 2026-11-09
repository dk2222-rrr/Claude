// 背景音樂：用 WebAudio 即時合成的輕鬆溫暖小曲（八音盒＋柔和和弦＋低音），不用下載音檔。
// iPhone 規定要使用者先點一下畫面才能出聲，所以第一次觸控時才開始播放。
const KEY = 'pup-music';
const BPM = 70;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
// F 大調：Fmaj7 → Dm7 → B♭maj7 → C（I–vi–IV–V）
const CHORDS = [
  { root: 41, tones: [53, 57, 60, 64] },
  { root: 38, tones: [50, 53, 57, 60] },
  { root: 46, tones: [50, 53, 58, 62] },
  { root: 36, tones: [52, 55, 60, 62] },
];
const SCALE = [65, 67, 69, 72, 74, 76, 77, 79, 81]; // 旋律用的音（五聲音階附近）
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

let ctx = null;
let master = null;
let wet = null;
let dry = null;
let timer = null;
let nextT = 0;
let bar = 0;
let lastNote = 72;
let started = false;

export const musicOn = () => {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
};

function impulse(sec = 2.6) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

function setup() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const rev = ctx.createConvolver();
  rev.buffer = impulse();
  wet = ctx.createGain();
  wet.gain.value = 0.45;
  dry = ctx.createGain();
  dry.gain.value = 0.8;
  wet.connect(rev).connect(master);
  dry.connect(master);
  return true;
}

// 柔和的和弦鋪底
function pad(m, t, dur, vol) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'triangle';
  o2.type = 'sine';
  o.frequency.value = hz(m);
  o2.frequency.value = hz(m) * 1.003; // 微微走音，聽起來比較溫暖
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 1.2);
  g.gain.setValueAtTime(vol, t + dur - 1.2);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
  o.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(dry);
  g.connect(wet);
  o.start(t); o2.start(t);
  o.stop(t + dur + 0.7); o2.stop(t + dur + 0.7);
}

// 八音盒：很快敲下去、慢慢消失
function bell(m, t, vol) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
  [[1, 1, 'sine'], [2, 0.28, 'sine'], [3, 0.08, 'triangle']].forEach(([mul, a, type]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(m) * mul;
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 2.3);
  });
  g.connect(dry);
  g.connect(wet);
}

function bass(m, t, dur, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = hz(m);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dry);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function scheduleBar(t) {
  const c = CHORDS[bar % CHORDS.length];
  const night = isLate();
  const v = night ? 0.6 : 1;
  c.tones.forEach((m) => pad(m, t, BAR, 0.035 * v));
  bass(c.root, t, BEAT * 2.5, 0.12 * v);
  bass(c.root + 7, t + BEAT * 2, BEAT * 2, 0.07 * v);
  // 旋律：一小節 8 個八分音符，有些是休止；越晚越安靜
  for (let i = 0; i < 8; i++) {
    const rest = Math.random() < (i % 2 ? 0.55 : 0.25) + (night ? 0.2 : 0);
    if (rest) continue;
    // 往和弦音靠近、一步一步走，不要亂跳
    const near = SCALE.filter((m) => Math.abs(m - lastNote) <= 5);
    const pool = near.concat(near.filter((m) => c.tones.some((x) => (x - m) % 12 === 0)));
    lastNote = pool[Math.floor(Math.random() * pool.length)] || 72;
    const swing = i % 2 ? 0.04 : 0;
    bell(lastNote, t + i * BEAT * 0.5 + swing, (i === 0 ? 0.11 : 0.075) * v);
  }
  // 偶爾一個高八度的小點綴
  if (Math.random() < 0.35) bell(lastNote + 12, t + BEAT * 3.5, 0.03 * v);
  bar++;
}

// 台灣時間晚上 10 點後、早上 7 點前小聲一點
function isLate() {
  const h = ((Date.now() / 3600e3 + 8) % 24 + 24) % 24;
  return h >= 22 || h < 7;
}

function tick() {
  if (!ctx || ctx.state !== 'running') return;
  while (nextT < ctx.currentTime + 1.5) {
    scheduleBar(nextT);
    nextT += BAR;
  }
}

function fadeTo(v, sec = 1.5) {
  if (!master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(v, t + sec);
}

export function startMusic() {
  if (!musicOn()) return;
  if (!ctx && !setup()) return;
  ctx.resume?.();
  if (!started) {
    started = true;
    nextT = ctx.currentTime + 0.2;
    timer = setInterval(tick, 300);
  }
  tick();
  fadeTo(0.5, 2.5);
}

export function stopMusic() {
  if (!ctx) return;
  fadeTo(0, 0.6);
  setTimeout(() => { if (!musicOn()) ctx.suspend?.(); }, 700);
}

export function toggleMusic() {
  const on = !musicOn();
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) startMusic();
  else stopMusic();
  return on;
}

// 第一次碰到畫面就開始播放；切到背景時暫停
export function initMusic() {
  const kick = () => { if (musicOn() && (!ctx || ctx.state !== 'running')) startMusic(); };
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('touchend', kick, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.();
    else if (musicOn()) { ctx.resume?.(); nextT = Math.max(nextT, ctx.currentTime + 0.1); }
  });
}
