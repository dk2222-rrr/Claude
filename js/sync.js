// 資料同步：有 Firebase 設定就用雲端（兩人即時同步），否則用單機 localStorage。
import { firebaseConfig } from './config.js';
import { applyAction, newRoom } from './state.js';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const genCode = () =>
  Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

export async function createBackend() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try {
      return await firebaseBackend(firebaseConfig);
    } catch (e) {
      console.error('Firebase 連線失敗，改用單機模式', e);
    }
  }
  return localBackend();
}

/* ---------------- 單機模式 ---------------- */
function localBackend() {
  // 同一台電腦測試兩人：網址加 ?as=2 就會變成第二個人
  const who = new URLSearchParams(location.search).get('as') || '';
  const uidKey = 'pup-uid' + who;
  let uid = localStorage.getItem(uidKey);
  if (!uid) {
    uid = 'u' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(uidKey, uid);
  }
  const key = (c) => 'pup-room-' + c;
  const load = (c) => JSON.parse(localStorage.getItem(key(c)) || 'null');
  const listeners = new Set();
  const notify = (c) => listeners.forEach((l) => l.code === c && l.fn());
  const save = (c, r) => {
    localStorage.setItem(key(c), JSON.stringify(r));
    notify(c);
  };
  window.addEventListener('storage', (e) => {
    listeners.forEach((l) => e.key === key(l.code) && l.fn());
  });

  return {
    mode: 'local',
    uid,
    async createRoom(info) {
      const code = genCode();
      save(code, { ...newRoom(info, uid), events: [] });
      return code;
    },
    async joinRoom(code, name) {
      const r = load(code);
      if (!r) throw new Error('找不到這個家庭碼');
      if (!r.members[uid] && Object.keys(r.members).length >= 2) throw new Error('這個家已經有兩個人了');
      r.members[uid] = { name, joinedAt: Date.now() };
      save(code, r);
    },
    async exists(code) {
      const r = load(code);
      return !!(r && r.members[uid]);
    },
    subscribe(code, onRoom, onEvents) {
      const l = {
        code,
        fn: () => {
          const r = load(code);
          if (!r) return;
          const { events = [], ...room } = r;
          onRoom(room);
          onEvents(events);
        },
      };
      listeners.add(l);
      setTimeout(l.fn, 0);
      return () => listeners.delete(l);
    },
    async act(code, type, extra) {
      const r = load(code);
      const { events = [], ...room } = r;
      const out = applyAction(room, type, uid, extra, Date.now());
      if (out.room) {
        const ev = out.event ? [out.event, ...events].slice(0, 150) : events;
        save(code, { ...out.room, events: ev });
      }
      return out.result;
    },
  };
}

/* ---------------- Firebase 雲端模式 ---------------- */
async function firebaseBackend(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  const db = fs.getFirestore(app);
  const roomRef = (c) => fs.doc(db, 'rooms', c);
  const evCol = (c) => fs.collection(db, 'rooms', c, 'events');

  return {
    mode: 'cloud',
    uid,
    async createRoom(info) {
      for (let i = 0; i < 5; i++) {
        const code = genCode();
        const snap = await fs.getDoc(roomRef(code));
        if (snap.exists()) continue;
        await fs.setDoc(roomRef(code), newRoom(info, uid));
        return code;
      }
      throw new Error('建立失敗，請再試一次');
    },
    async joinRoom(code, name) {
      await fs.runTransaction(db, async (tx) => {
        const s = await tx.get(roomRef(code));
        if (!s.exists()) throw new Error('找不到這個家庭碼');
        const r = s.data();
        if (!r.members[uid] && Object.keys(r.members).length >= 2) throw new Error('這個家已經有兩個人了');
        tx.update(roomRef(code), { [`members.${uid}`]: { name, joinedAt: Date.now() } });
      });
    },
    async exists(code) {
      const s = await fs.getDoc(roomRef(code));
      return s.exists() && !!s.data().members[uid];
    },
    subscribe(code, onRoom, onEvents) {
      const u1 = fs.onSnapshot(roomRef(code), (s) => s.exists() && onRoom(s.data()));
      const q = fs.query(evCol(code), fs.orderBy('at', 'desc'), fs.limit(150));
      const u2 = fs.onSnapshot(q, (qs) => onEvents(qs.docs.map((d) => ({ id: d.id, ...d.data() }))));
      return () => { u1(); u2(); };
    },
    async act(code, type, extra) {
      const out = await fs.runTransaction(db, async (tx) => {
        const s = await tx.get(roomRef(code));
        const o = applyAction(s.data(), type, uid, extra, Date.now());
        if (o.room) tx.set(roomRef(code), o.room);
        return o;
      });
      if (out.event) {
        const { id, ...ev } = out.event;
        await fs.setDoc(fs.doc(evCol(code), id), ev);
      }
      return out.result;
    },
  };
}
