(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const S = Store, fmt = Sources.fmtDate;

  const POPULAR = [
    ['五月天', 'Mayday'], ['周杰倫', 'Jay Chou'], ['蔡依林', 'Jolin Tsai'], ['告五人', 'Accusefive'],
    ['草東沒有派對', 'No Party For Cao Dong'], ['落日飛車', 'Sunset Rollercoaster'], ['鄧紫棋', 'G.E.M.'],
    ['林俊傑', 'JJ Lin'], ['張惠妹', 'A-Mei'], ['田馥甄', 'Hebe Tien'], ['Taylor Swift'], ['Coldplay'],
    ['BLACKPINK'], ['BTS'], ['Ed Sheeran'], ['Bruno Mars'], ['YOASOBI'], ['ONE OK ROCK'],
    ['Mrs. GREEN APPLE'], ['Olivia Rodrigo'], ['Oasis'], ['Linkin Park'],
  ];
  const OFFSETS = [[1440, '1 天前'], [180, '3 小時前'], [60, '1 小時前'], [30, '30 分鐘前'], [10, '10 分鐘前'], [5, '5 分鐘前']];

  const st = { watchlist: [], settings: {}, events: {}, reminders: [], filter: 'region', checking: false, viewedAt: 0 };

  async function load() {
    st.watchlist = await S.get('watchlist', []);
    st.settings = await Checker.settings();
    st.events = await S.get('events', {});
    st.reminders = await S.get('reminders', []);
  }
  const saveWatch = () => S.set('watchlist', st.watchlist);
  const saveRem = () => S.set('reminders', st.reminders);

  // ---------- 通知 ----------
  function toast(title, body) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<b>' + esc(title) + '</b>' + esc(body || '');
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 4000);
  }
  async function notify(n) {
    toast(n.title, n.body);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: n.body, tag: n.tag, icon: 'icon.svg', badge: 'icon.svg', requireInteraction: !!n.requireInteraction, data: { url: n.url || '' } };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) return reg.showNotification(n.title, opts);
      new Notification(n.title, opts);
    } catch (e) { /* 部分瀏覽器不支援，已用 toast 顯示 */ }
  }
  async function registerPeriodic() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('periodicSync' in reg)) return;
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (p.state === 'granted') await reg.periodicSync.register('concert-check', { minInterval: 6 * 3600 * 1000 });
    } catch (e) { /* 不支援 */ }
  }

  // ---------- 檢查 ----------
  const hasSource = () => st.settings.tmKey || st.settings.bitAppId || st.settings.demo;
  async function check(manual) {
    if (st.checking) return;
    if (!st.watchlist.length) { if (manual) toast('還沒有關注任何人', '先到「搜尋」加入歌手或樂團'); return; }
    if (!hasSource()) { if (manual) toast('尚未設定資料來源', '請到「設定」填 API key，或開啟範例模式'); return; }
    st.checking = true;
    $('#checkNow').disabled = true;
    $('#status').textContent = '正在檢查 ' + st.watchlist.length + ' 位歌手／樂團的活動…';
    try {
      const res = await Checker.run({ notify });
      await load();
      $('#status').textContent = res.errors.length ? '部分來源失敗：' + res.errors[0] : '';
      if (manual && !res.notes.length) toast('檢查完成', '沒有新的活動');
      renderAll();
    } catch (e) {
      $('#status').textContent = '檢查失敗：' + e.message;
    } finally {
      st.checking = false;
      $('#checkNow').disabled = false;
    }
  }
  async function checkReminders() {
    const res = await Checker.run({ notify, onlyReminders: true });
    if (res.notes.length) { st.reminders = await S.get('reminders', []); renderReminders(); }
  }

  // ---------- 關注名單 ----------
  const isWatched = (name) => st.watchlist.some((a) => a.name.toLowerCase() === name.toLowerCase());
  async function addArtist(a) {
    if (isWatched(a.name)) return toast('已在關注名單', a.name);
    st.watchlist.push({ id: a.id || 'name:' + a.name, name: a.name, aliases: a.aliases || [], genre: a.genre || '', addedAt: Date.now(), lastChecked: null });
    await saveWatch();
    toast('已加入關注', a.name);
    renderAll();
    if (hasSource()) check(false);
  }
  async function removeArtist(id) {
    st.watchlist = st.watchlist.filter((a) => a.id !== id);
    st.reminders = st.reminders.filter((r) => !r.auto || (st.events[r.eventId] || {}).artistId !== id);
    await saveWatch(); await saveRem();
    renderAll();
  }

  function artistLinks(a) {
    const q = encodeURIComponent(a.name);
    const en = encodeURIComponent((a.aliases && a.aliases[0]) || a.name);
    return [
      ['Google 搶票資訊', 'https://www.google.com/search?q=' + q + '+演唱會+售票'],
      ['KKTIX', 'https://kktix.com/events?search=' + q],
      ['拓元', 'https://tixcraft.com/activity'],
      ['Ticketmaster', 'https://www.ticketmaster.com/search?q=' + en],
      ['Bandsintown', 'https://www.bandsintown.com/search?query=' + en],
    ].map(([t, u]) => '<a class="btn small" target="_blank" rel="noopener" href="' + esc(u) + '">' + esc(t) + '</a>').join('');
  }

  // ---------- 畫面 ----------
  function renderPopular() {
    $('#popular').innerHTML = POPULAR.map(([n, al], i) =>
      '<button class="chip' + (isWatched(n) ? ' on' : '') + '" data-pop="' + i + '">' + (isWatched(n) ? '✓ ' : '＋ ') + esc(n) + '</button>').join('');
  }

  function resultRow(a, i) {
    const w = isWatched(a.name);
    return '<div class="card item"><div class="avatar">' + esc([...a.name][0]) + '</div><div class="grow"><div class="name">' + esc(a.name) +
      '</div><div class="meta">' + esc(a.genre || '') + '</div></div><button class="btn small ' + (w ? 'on' : 'primary') + '" data-add="' + i + '"' +
      (w ? ' disabled' : '') + '>' + (w ? '已關注' : '＋ 關注') + '</button></div>';
  }
  let lastResults = [];
  async function doSearch(term) {
    term = term.trim();
    if (!term) return;
    $('#results').innerHTML = '<p class="muted">搜尋中…</p>';
    let list = [];
    try { list = await Sources.searchArtists(term); } catch (e) { /* 改用手動加入 */ }
    if (!list.some((a) => a.name.toLowerCase() === term.toLowerCase())) list.push({ name: term, genre: '直接用這個名字加入' });
    lastResults = list;
    $('#results').innerHTML = list.map(resultRow).join('');
  }

  function renderWatch() {
    $('#watchCount').textContent = st.watchlist.length ? '（' + st.watchlist.length + '）' : '';
    $('#artistOptions').innerHTML = st.watchlist.map((a) => '<option value="' + esc(a.name) + '">').join('');
    if (!st.watchlist.length) {
      $('#watchlist').innerHTML = '<div class="empty"><div class="big">⭐</div>還沒有關注任何人<br><button class="btn primary" data-goto="search" style="margin-top:12px">去搜尋</button></div>';
      return;
    }
    const count = {};
    Object.values(st.events).forEach((e) => { count[e.artistId] = (count[e.artistId] || 0) + 1; });
    $('#watchlist').innerHTML = st.watchlist.map((a) =>
      '<div class="card"><div class="item"><div class="avatar">' + esc([...a.name][0]) + '</div><div class="grow"><div class="name">' + esc(a.name) +
      '</div><div class="meta">' + (count[a.id] ? '🎤 ' + count[a.id] + ' 場活動 · ' : '') +
      (a.lastChecked ? '上次檢查 ' + fmt(new Date(a.lastChecked).toISOString()) : '尚未檢查') + '</div></div>' +
      '<button class="btn small danger" data-remove="' + esc(a.id) + '">取消關注</button></div>' +
      '<div class="alias"><input data-alias="' + esc(a.id) + '" value="' + esc((a.aliases || []).join(', ')) + '" placeholder="別名（英文名，用逗號分隔）"></div>' +
      (a.lastError ? '<div class="err">⚠ ' + esc(a.lastError) + '</div>' : '') +
      '<div class="links">' + artistLinks(a) + '</div></div>').join('');
  }

  function saleInfo(e) {
    const now = Date.now();
    const list = [];
    (e.presales || []).forEach((p) => list.push([p.name, p.startAt]));
    if (e.onSaleAt) list.push(['開賣', e.onSaleAt]);
    return list.filter(([, t]) => Date.parse(t) > now - 3600000)
      .map(([n, t]) => '<span class="tag sale">' + esc(n) + ' ' + esc(fmt(t)) + '</span>').join('');
  }

  function renderEvents() {
    const c = st.settings.country;
    $('#eventFilter').innerHTML = c ? '<button class="chip' + (st.filter === 'region' ? ' sel' : '') + '" data-filter="region">只看 ' + esc($('select[name=country] option[value="' + c + '"]').textContent) + '</button>' +
      '<button class="chip' + (st.filter === 'all' ? ' sel' : '') + '" data-filter="all">全部地區</button>' : '';
    const now = Date.now();
    let list = Object.values(st.events).filter((e) => Checker.eventTime(e) > now);
    if (st.filter === 'region') list = list.filter((e) => Checker.inRegion(e, st.settings));
    list.sort((a, b) => Checker.eventTime(a) - Checker.eventTime(b));
    const fresh = list.filter((e) => e.firstSeen > st.viewedAt).length;
    const b = $('#evBadge'); b.hidden = !fresh; b.textContent = fresh;

    let banner = '';
    if (!hasSource()) banner = '<div class="banner">尚未設定資料來源。請到 <a href="#" data-goto="settings">設定</a> 填入 Ticketmaster 或 Bandsintown 的 API key，或先開啟範例模式體驗。</div>';
    if (!list.length) {
      $('#events').innerHTML = banner + '<div class="empty"><div class="big">🎤</div>' + (st.watchlist.length ? '目前沒有找到即將舉行的活動' : '加入關注後，這裡會列出他們的演唱會') + '</div>';
      return;
    }
    const remIds = new Set(st.reminders.map((r) => r.eventId));
    $('#events').innerHTML = banner + list.map((e) => {
      const d = new Date(/T/.test(e.date) ? e.date : e.date + 'T00:00');
      const isNew = now - e.firstSeen < 3 * 86400000;
      const url = safeUrl(e.url);
      return '<div class="card event"><div class="date"><div class="m">' + (d.getMonth() + 1) + '月</div><div class="d">' + d.getDate() +
        '</div><div class="w">週' + '日一二三四五六'[d.getDay()] + '</div></div><div class="grow" style="flex:1;min-width:0">' +
        '<div>' + (isNew ? '<span class="tag new">NEW</span>' : '') + '<span class="tag">' + esc(e.source) + '</span></div>' +
        '<div class="title">' + esc(e.title) + '</div>' +
        '<div class="meta">⭐ ' + esc(e.artist) + ' · ' + esc(fmt(e.date)) + '</div>' +
        '<div class="meta">📍 ' + esc([e.venue, e.city, e.country].filter(Boolean).join('，')) + '</div>' +
        '<div style="margin-top:6px">' + saleInfo(e) + '</div>' +
        '<div class="links">' + (url ? '<a class="btn small primary" target="_blank" rel="noopener" href="' + esc(url) + '">購票／詳情</a>' : '') +
        (remIds.has(e.id) ? '<span class="btn small on">✓ 已設提醒</span>' : '<button class="btn small" data-remind="' + esc(e.id) + '">⏰ 設搶票提醒</button>') +
        '</div></div></div>';
    }).join('');
  }

  function countdown(t) {
    const ms = t - Date.now();
    if (ms <= 0) return ms > -15 * 60000 ? '🔥 開賣中！' : '已開賣';
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return '倒數 ' + (d ? d + ' 天 ' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function renderReminders() {
    const list = [...st.reminders].sort((a, b) => Date.parse(a.saleAt) - Date.parse(b.saleAt));
    if (!list.length) {
      $('#reminders').innerHTML = '<div class="empty"><div class="big">⏰</div>還沒有搶票提醒<br><span class="hint">在「活動」頁按「設搶票提醒」，或在上面手動新增</span></div>';
      return;
    }
    $('#reminders').innerHTML = list.map((r) => {
      const t = Date.parse(r.saleAt), url = safeUrl(r.url);
      return '<div class="card"><div class="item"><div class="grow"><div class="meta">⭐ ' + esc(r.artist) + ' · ' + esc(r.kind || '開賣') + (r.auto ? ' · 自動' : '') +
        '</div><div class="name">' + esc(r.title) + '</div><div class="meta">開賣 ' + esc(fmt(r.saleAt)) + '</div>' +
        '<div class="countdown' + (t - Date.now() < 3600000 ? ' soon' : '') + '" data-cd="' + t + '">' + countdown(t) + '</div></div>' +
        '<button class="btn small danger" data-delrem="' + esc(r.id) + '">刪除</button></div>' +
        (url ? '<div class="links"><a class="btn small primary" target="_blank" rel="noopener" href="' + esc(url) + '">前往售票頁</a></div>' : '') + '</div>';
    }).join('');
  }

  function renderSettings() {
    const s = st.settings, f = $('#settingsForm');
    f.tmKey.value = s.tmKey; f.bitAppId.value = s.bitAppId; f.country.value = s.country;
    f.checkEvery.value = String(s.checkEvery); f.demo.checked = !!s.demo;
    $('#autoRemind').checked = !!s.autoRemind;
    $('#offsets').innerHTML = OFFSETS.map(([v, t]) => '<label><input type="checkbox" data-offset="' + v + '"' + (s.remindOffsets.includes(v) ? ' checked' : '') + '> ' + t + '</label>').join('') +
      '<label><input type="checkbox" checked disabled> 開賣當下</label>';
    const p = 'Notification' in window ? Notification.permission : 'unsupported';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    $('#notifState').textContent = {
      granted: '✅ 通知已開啟',
      denied: '🚫 通知已被封鎖，請到瀏覽器的網站設定裡允許通知',
      default: '尚未開啟通知',
      unsupported: ios && !standalone ? 'iPhone 要先用 Safari 的「分享 → 加入主畫面」，從主畫面打開才能收通知' : '這個瀏覽器不支援通知',
    }[p];
    $('#enableNotif').hidden = p !== 'default';
    S.get('lastCheck', 0).then((t) => { $('#lastCheck').textContent = t ? '上次完整檢查：' + fmt(new Date(t).toISOString()) : ''; });
  }

  function renderAll() { renderPopular(); renderWatch(); renderEvents(); renderReminders(); renderSettings(); }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'events') {
      st.viewedAt = Date.now();
      try { localStorage.setItem('viewedAt', st.viewedAt); } catch (e) { /* ignore */ }
      renderEvents();
    }
    window.scrollTo(0, 0);
    try { localStorage.setItem('tab', name); } catch (e) { /* ignore */ }
  }

  // ---------- 事件 ----------
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return showTab(d.tab);
    if (d.goto) { ev.preventDefault(); return showTab(d.goto); }
    if (d.pop) { const [n, al] = POPULAR[d.pop]; if (!isWatched(n)) addArtist({ name: n, aliases: al ? [al] : [] }); return; }
    if (d.add) { await addArtist(lastResults[d.add]); $('#results').innerHTML = lastResults.map(resultRow).join(''); return; }
    if (d.remove) { const a = st.watchlist.find((x) => x.id === d.remove); if (confirm('取消關注「' + a.name + '」？')) removeArtist(d.remove); return; }
    if (d.filter) { st.filter = d.filter; return renderEvents(); }
    if (d.delrem) { st.reminders = st.reminders.filter((r) => r.id !== d.delrem); await saveRem(); renderReminders(); renderEvents(); return; }
    if (d.remind) {
      const e = st.events[d.remind];
      let saleAt = e.onSaleAt || (e.presales[0] && e.presales[0].startAt);
      if (!saleAt || Date.parse(saleAt) < Date.now()) {
        showTab('remind');
        const f = $('#remindForm');
        $('#addRemindBox').open = true;
        f.artist.value = e.artist; f.title.value = e.title; f.url.value = safeUrl(e.url);
        f.saleAt.focus();
        return toast('請填入開賣時間', '這場活動沒有提供開賣時間');
      }
      st.reminders.push({ id: 'evt:' + e.id + ':' + Date.now(), eventId: e.id, artist: e.artist, title: e.title, url: e.url, saleAt, kind: e.onSaleAt ? '開賣' : e.presales[0].name, fired: [] });
      await saveRem(); renderEvents(); renderReminders();
      toast('已設定搶票提醒', e.title);
    }
  });

  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); doSearch($('#q').value); });
  $('#checkNow').addEventListener('click', () => check(true));

  $('#watchlist').addEventListener('change', async (e) => {
    const id = e.target.dataset.alias;
    if (!id) return;
    const a = st.watchlist.find((x) => x.id === id);
    a.aliases = e.target.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    await saveWatch();
    toast('已更新別名', a.name + (a.aliases.length ? ' → ' + a.aliases.join(', ') : ''));
  });

  $('#remindForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const saleAt = new Date(f.saleAt.value);
    if (isNaN(saleAt)) return;
    st.reminders.push({ id: 'manual:' + Date.now(), artist: f.artist.value.trim(), title: f.title.value.trim(), kind: f.kind.value.trim() || '開賣', url: safeUrl(f.url.value.trim()), saleAt: saleAt.toISOString(), fired: [] });
    await saveRem();
    f.reset(); f.kind.value = '開賣';
    $('#addRemindBox').open = false;
    renderReminders();
    toast('已新增搶票提醒', '開賣 ' + fmt(saleAt.toISOString()));
    if (!('Notification' in window) || Notification.permission !== 'granted') toast('提醒', '記得到「設定」開啟通知');
  });

  async function saveSettings(patch) {
    st.settings = Object.assign({}, st.settings, patch);
    await S.set('settings', st.settings);
  }
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await saveSettings({ tmKey: f.tmKey.value.trim(), bitAppId: f.bitAppId.value.trim(), country: f.country.value, checkEvery: +f.checkEvery.value, demo: f.demo.checked });
    toast('設定已儲存', '');
    schedule();
    renderAll();
    check(false);
  });
  $('#offsets').addEventListener('change', () => {
    saveSettings({ remindOffsets: [...document.querySelectorAll('[data-offset]:checked')].map((i) => +i.dataset.offset) });
  });
  $('#autoRemind').addEventListener('change', (e) => saveSettings({ autoRemind: e.target.checked }));

  $('#enableNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    renderSettings();
    if (Notification.permission === 'granted') { registerPeriodic(); notify({ title: '🎉 通知已開啟', body: '有新演唱會或搶票時間到了會通知你', tag: 'welcome' }); }
  });
  $('#testNotif').addEventListener('click', () => notify({ title: '🔥 測試｜現在開搶！', body: '這是一則測試通知', tag: 'test' }));

  $('#exportBtn').addEventListener('click', async () => {
    const data = { watchlist: st.watchlist.map(({ id, name, aliases, genre }) => ({ id, name, aliases, genre })), reminders: st.reminders.filter((r) => !r.auto) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'concert-watchlist.json';
    a.click();
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      let n = 0;
      for (const a of data.watchlist || []) if (a.name && !isWatched(a.name)) { st.watchlist.push(Object.assign({ aliases: [], lastChecked: null, addedAt: Date.now() }, a)); n++; }
      const ids = new Set(st.reminders.map((r) => r.id));
      for (const r of data.reminders || []) if (r.id && r.saleAt && !ids.has(r.id)) st.reminders.push(r);
      await saveWatch(); await saveRem();
      renderAll();
      toast('匯入完成', '新增 ' + n + ' 位歌手／樂團');
    } catch (err) { toast('匯入失敗', '檔案格式不正確'); }
    e.target.value = '';
  });

  // ---------- 定時 ----------
  let netTimer;
  function schedule() {
    clearInterval(netTimer);
    netTimer = setInterval(() => check(false), st.settings.checkEvery * 60000);
  }
  setInterval(() => {
    document.querySelectorAll('[data-cd]').forEach((el) => {
      const t = +el.dataset.cd;
      el.textContent = countdown(t);
      el.classList.toggle('soon', t - Date.now() < 3600000);
    });
  }, 1000);
  setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    checkReminders();
    const last = await S.get('lastCheck', 0);
    if (Date.now() - last > st.settings.checkEvery * 60000) check(false);
  });

  // ---------- 啟動 ----------
  (async function init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(registerPeriodic).catch(() => {});
    await load();
    try { st.viewedAt = +localStorage.getItem('viewedAt') || 0; } catch (e) { st.viewedAt = 0; }
    let tab = 'search';
    try { tab = localStorage.getItem('tab') || (st.watchlist.length ? 'events' : 'search'); } catch (e) { /* ignore */ }
    renderAll();
    showTab(tab);
    schedule();
    checkReminders();
    const last = await S.get('lastCheck', 0);
    if (Date.now() - last > st.settings.checkEvery * 60000) check(false);
  })();
})();
