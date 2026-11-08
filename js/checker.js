// 檢查關注名單的新活動 + 搶票提醒，頁面與 Service Worker 共用
(function (g) {
  const S = g.Store, Src = g.Sources;
  const DEFAULTS = {
    bitAppId: '', tmKey: '', country: 'TW', checkEvery: 60,
    remindOffsets: [1440, 60, 10], autoRemind: true, demo: false,
  };
  const MIN = 60000;

  async function settings() { return Object.assign({}, DEFAULTS, await S.get('settings', {})); }

  function namesFor(a) {
    return [...new Set([a.name, ...(a.aliases || [])].map((s) => (s || '').trim()).filter(Boolean))];
  }

  async function fetchArtist(a, cfg) {
    const out = [], errors = [];
    for (const name of namesFor(a)) {
      if (cfg.bitAppId) {
        try { out.push(...await Src.bandsintown(name, cfg.bitAppId)); }
        catch (e) { errors.push('Bandsintown「' + name + '」：' + e.message); }
      }
      if (cfg.tmKey) {
        try { out.push(...await Src.ticketmaster(name, cfg.tmKey, cfg.country)); }
        catch (e) { errors.push('Ticketmaster「' + name + '」：' + e.message); }
      }
    }
    if (cfg.demo) out.push(...Src.demo(a));
    const map = new Map();
    for (const e of out) map.set(e.id, Object.assign(e, { artistId: a.id, artist: a.name }));
    return { events: [...map.values()], errors };
  }

  const inRegion = (e, cfg) => !cfg.country || !e.countryCode || e.countryCode === cfg.country;
  const eventTime = (e) => { const t = Date.parse(/T/.test(e.date) ? e.date : e.date + 'T23:59'); return isNaN(t) ? Infinity : t; };

  function autoReminders(e) {
    const list = [];
    if (e.onSaleAt) list.push({ id: 'auto:' + e.id + ':public', kind: '開賣', saleAt: e.onSaleAt });
    (e.presales || []).forEach((p, i) => list.push({ id: 'auto:' + e.id + ':pre' + i, kind: p.name, saleAt: p.startAt }));
    return list.map((r) => Object.assign(r, {
      eventId: e.id, artist: e.artist, title: e.title, url: e.url, auto: true, fired: [],
    }));
  }

  // 檢查搶票提醒（不需網路）
  function dueReminders(reminders, cfg, now) {
    const notes = [];
    const offsets = [...new Set([...(cfg.remindOffsets || []), 0])];
    for (const r of reminders) {
      const t = Date.parse(r.saleAt);
      if (isNaN(t) || now > t + 15 * MIN) continue;
      r.fired = r.fired || [];
      const due = offsets.filter((o) => !r.fired.includes(o) && now >= t - o * MIN);
      if (!due.length) continue;
      const o = Math.min(...due);
      r.fired.push(...due);
      const left = Math.max(0, Math.round((t - now) / MIN));
      const when = o === 0 ? '現在開搶！' : left >= 1440 ? Math.round(left / 1440) + ' 天後開搶'
        : left >= 60 ? Math.round(left / 60) + ' 小時後開搶' : left + ' 分鐘後開搶';
      notes.push({
        title: (o === 0 ? '🔥 ' : '⏰ ') + r.artist + '｜' + (r.kind || '搶票') + ' ' + when,
        body: r.title + '\n開賣：' + Src.fmtDate(r.saleAt),
        url: r.url, tag: r.id + ':' + o, requireInteraction: o <= 10,
      });
    }
    return notes;
  }

  async function run({ notify, onlyReminders = false } = {}) {
    const cfg = await settings();
    const now = Date.now();
    const notes = [], errors = [];
    const events = await S.get('events', {});
    const seen = new Set(await S.get('seen', []));
    const checked = new Map();
    const newAutos = [];

    if (!onlyReminders) {
      const watchlist = await S.get('watchlist', []);
      for (const a of watchlist) {
        const res = await fetchArtist(a, cfg);
        errors.push(...res.errors);
        const fresh = res.events.filter((e) => !seen.has(e.id) && inRegion(e, cfg) && eventTime(e) > now);
        if (a.lastChecked) {
          for (const e of fresh.slice(0, 5)) {
            notes.push({
              title: '🎤 ' + a.name + ' 有新活動！',
              body: e.title + '\n' + Src.fmtDate(e.date) + ' ' + [e.city, e.venue].filter(Boolean).join(' '),
              url: e.url, tag: e.id,
            });
          }
          if (fresh.length > 5) notes.push({ title: '🎤 ' + a.name, body: '還有 ' + (fresh.length - 5) + ' 場新活動', tag: a.id + ':more' });
        } else if (fresh.length) {
          notes.push({ title: '🎤 ' + a.name, body: '目前有 ' + fresh.length + ' 場即將舉行的活動', tag: a.id + ':first' });
        }
        for (const e of res.events) {
          seen.add(e.id);
          events[e.id] = Object.assign({ firstSeen: now }, events[e.id] || {}, e, { firstSeen: (events[e.id] || {}).firstSeen || now });
          if (cfg.autoRemind && inRegion(e, cfg)) newAutos.push(...autoReminders(e).filter((r) => Date.parse(r.saleAt) > now));
        }
        checked.set(a.id, { lastChecked: now, lastError: res.errors.join('；') });
      }
      // 清掉已結束的活動與已取消關注的歌手
      const ids = new Set(watchlist.map((a) => a.id));
      for (const [id, e] of Object.entries(events)) {
        if (eventTime(e) < now - 86400000 || !ids.has(e.artistId)) delete events[id];
      }
    }

    // 重新讀取（避免覆蓋使用者在檢查期間的修改）後合併寫回
    const reminders = await S.get('reminders', []);
    const have = new Set(reminders.map((r) => r.id));
    for (const r of newAutos) if (!have.has(r.id)) { reminders.push(r); have.add(r.id); }
    notes.push(...dueReminders(reminders, cfg, now));
    const keep = reminders.filter((r) => !(Date.parse(r.saleAt) < now - 86400000));
    await S.set('reminders', keep);

    if (!onlyReminders) {
      const wl = await S.get('watchlist', []);
      for (const a of wl) if (checked.has(a.id)) Object.assign(a, checked.get(a.id));
      await S.set('watchlist', wl);
      await S.set('events', events);
      await S.set('seen', [...seen].slice(-5000));
      await S.set('lastCheck', now);
    }
    if (notify) for (const n of notes) await notify(n);
    return { notes, errors };
  }

  g.Checker = { run, settings, DEFAULTS, eventTime, inRegion };
})(self);
