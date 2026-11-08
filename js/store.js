// 簡易 IndexedDB key-value 儲存，頁面與 Service Worker 共用
(function (g) {
  const DB = 'concert-alert', VER = 1, ST = 'kv';
  let dbp = null;
  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, VER);
        r.onupgradeneeded = () => r.result.createObjectStore(ST);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function get(key, def) {
    const db = await open();
    return new Promise((res, rej) => {
      const q = db.transaction(ST).objectStore(ST).get(key);
      q.onsuccess = () => res(q.result === undefined ? def : q.result);
      q.onerror = () => rej(q.error);
    });
  }
  async function set(key, val) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(ST, 'readwrite');
      tx.objectStore(ST).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  g.Store = { get, set };
})(self);
