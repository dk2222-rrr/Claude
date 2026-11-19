// 更新資料 + 判斷要發哪些通知，頁面與 Service Worker 共用
(function (g) {
  const S = g.Store, Api = g.Api, Zh = g.Zh;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const FINAL = ['Success', 'Failure', 'Partial Failure'];

  const DEFAULTS = {
    offsets: [60, 10],       // 發射前幾分鐘提醒（0 = 發射時）
    notifyChange: true,      // 關注的發射：時間變更、確定發射
    notifyResult: true,      // 關注的發射：成功／失敗／暫停
    autoWatch: true,         // 追蹤主題的發射自動加入關注
    notifyNewLaunch: true,   // 追蹤主題出現新的發射排程
    notifyNews: true,        // 追蹤主題的新聞
    notifySky: true,         // 重要天象前一天提醒
    notifyIss: false,        // 太空站明亮過境自動提醒
    issMinEl: 40,
    location: { lat: 25.033, lon: 121.565, name: '台北' },
    launchEvery: 60, newsEvery: 30,
  };

  async function settings() { return Object.assign({}, DEFAULTS, await S.get('settings', {})); }

  async function topics() {
    let t = await S.get('topics', null);
    if (!t) {
      t = Zh.TOPICS.filter((x) => Zh.DEFAULT_TOPICS.includes(x.id)).map((x) => Object.assign({}, x, { keywords: x.keywords.slice(), addedAt: Date.now() }));
      await S.set('topics', t);
    }
    return t;
  }

  // 所有已知發射（最近發射 + 即將發射 + 詳細資料，較新的覆蓋較舊的）
  async function allLaunches() {
    const map = new Map();
    const P = await S.get('previous', null), L = await S.get('launches', null), D = await S.get('details', {});
    for (const l of (P && P.list) || []) map.set(l.id, l);
    for (const l of (L && L.list) || []) map.set(l.id, l);
    for (const [id, d] of Object.entries(D)) {
      const cur = map.get(id);
      if (!cur || (d.data.updated || '') >= (cur.updated || '')) map.set(id, Object.assign({}, cur || {}, d.data));
    }
    return map;
  }

  function watchEntry(l, cfg, auto, now) {
    const t = Date.parse(l.net);
    return {
      id: l.id, name: l.name, mission: l.mission, rocket: l.rocket, provider: l.provider, net: l.net, prec: l.prec, status: l.status,
      auto: !!auto, addedAt: now,
      // 加入時已經過了的提醒時間點，不再補發
      fired: (cfg.offsets || []).filter((o) => !isNaN(t) && now >= t - o * MIN),
    };
  }
  async function watch(l) {
    const cfg = await settings();
    const w = await S.get('watched', {});
    w[l.id] = watchEntry(l, cfg, false, Date.now());
    await S.set('watched', w);
    const un = (await S.get('unwatched', [])).filter((id) => id !== l.id);
    await S.set('unwatched', un);
  }
  async function unwatch(id) {
    const w = await S.get('watched', {});
    delete w[id];
    await S.set('watched', w);
    const un = new Set(await S.get('unwatched', []));
    un.add(id);
    await S.set('unwatched', [...un].slice(-500));
  }

  // 追蹤主題的發射自動加入關注（不發通知）
  async function syncAutoWatch() {
    const cfg = await settings();
    if (!cfg.autoWatch) return 0;
    const L = await S.get('launches', null);
    if (!L) return 0;
    const tps = await topics(), now = Date.now();
    const w = await S.get('watched', {}), un = new Set(await S.get('unwatched', []));
    let n = 0;
    for (const l of L.list) {
      if (w[l.id] || un.has(l.id) || FINAL.includes(l.status)) continue;
      if (Zh.matchTopics(Zh.launchText(l), tps).length) { w[l.id] = watchEntry(l, cfg, true, now); n++; }
    }
    if (n) await S.set('watched', w);
    return n;
  }

  const launchUrl = (id) => '#launch=' + id;

  // 發射前提醒（不需網路）
  function launchReminders(watched, cfg, now, details) {
    const notes = [];
    const offsets = [...new Set(cfg.offsets || [])];
    for (const w of Object.values(watched)) {
      if (!Zh.isPrecise(w.prec) || !['Go', 'TBC'].includes(w.status)) continue;
      const t = Date.parse(w.net);
      if (isNaN(t) || now > t + 10 * MIN) continue;
      w.fired = w.fired || [];
      const due = offsets.filter((o) => !w.fired.includes(o) && now >= t - o * MIN);
      if (!due.length) continue;
      const o = Math.min(...due);
      w.fired.push(...due);
      const d = details[w.id] && details[w.id].data;
      const vid = d && d.vids && d.vids[0] && d.vids[0].url;
      notes.push({
        title: (o === 0 ? '🚀 發射時間到！' : '⏰ ' + Zh.inWords(t - now) + '發射') + '｜' + w.mission,
        body: [w.rocket, w.provider].filter(Boolean).join('・') + '\n' + Zh.fmtFull(t) + (vid ? '\n點一下開啟直播' : ''),
        url: vid || launchUrl(w.id), tag: 'launch:' + w.id + ':' + o, requireInteraction: o <= 10,
      });
    }
    return notes;
  }

  // 天象提醒（頁面先算好放在 skyAlerts，這裡只負責準時通知）
  function skyReminders(alerts, now) {
    const notes = [];
    for (const a of alerts) {
      if (a.fired || now < a.at || now > a.at + 3 * HOUR) continue;
      a.fired = true;
      notes.push({ title: a.title, body: a.body, url: a.url || '#sky', tag: 'sky:' + a.id, requireInteraction: !!a.urgent });
    }
    return notes;
  }
  async function setSkyAlerts(list) {
    const old = new Map((await S.get('skyAlerts', [])).map((a) => [a.id, a]));
    const now = Date.now();
    const merged = list.map((a) => Object.assign({}, a, { fired: !!(old.get(a.id) || {}).fired || a.at < now - 3 * HOUR }));
    await S.set('skyAlerts', merged);
  }

  function mergeNews(fresh, old) {
    const map = new Map();
    for (const a of old || []) map.set(a.id, a);
    for (const a of fresh) map.set(a.id, a);
    return [...map.values()].sort((a, b) => b.published - a.published).slice(0, 80);
  }

  async function run({ notify, force = false, onlyReminders = false } = {}) {
    const cfg = await settings();
    const now = Date.now();
    const notes = [], errors = [];
    const tps = await topics();
    const updates = {}, added = {};

    if (!onlyReminders) {
      // ---- 發射資料 ----
      let L = await S.get('launches', null);
      const minAge = force ? 10 * MIN : cfg.launchEvery * MIN;
      if (!L || now - L.at >= minAge) {
        try { L = { at: now, list: await Api.upcoming() }; await S.set('launches', L); }
        catch (e) { errors.push('發射資料：' + e.message); }
      }
      // 最近發射、太空事件更新得比較慢，次數有剩才更新
      let P = await S.get('previous', null);
      if (!P || now - P.at > 3 * HOUR) {
        if ((await Api.llBudget()).left > 4) {
          try { P = { at: now, list: await Api.previous() }; await S.set('previous', P); }
          catch (e) { if (!P) errors.push('最近發射：' + e.message); }
        }
      }
      const E = await S.get('llEvents', null);
      if (!E || now - E.at > 6 * HOUR) {
        if ((await Api.llBudget()).left > 4) {
          try { await S.set('llEvents', { at: now, list: await Api.events() }); }
          catch (e) { if (!E) errors.push('太空事件：' + e.message); }
        }
      }

      // ---- 快發射的關注項目：每 15 分鐘抓一次詳細資料（延期、取消、直播連結） ----
      const watched = await S.get('watched', {});
      const details = await S.get('details', {});
      const near = Object.values(watched).filter((w) => {
        const dt = Date.parse(w.net) - now;
        return Zh.isPrecise(w.prec) && dt < 3 * HOUR && dt > -HOUR && !FINAL.includes(w.status);
      }).sort((a, b) => Date.parse(a.net) - Date.parse(b.net)).slice(0, 2);
      let detailsChanged = false;
      for (const w of near) {
        const d = details[w.id];
        if (d && now - d.at < 15 * MIN) continue;
        try { details[w.id] = { at: now, data: await Api.launchDetail(w.id) }; detailsChanged = true; } catch (e) { /* 次數不夠就等下一輪 */ }
      }
      for (const [id, d] of Object.entries(details)) if (now - d.at > 2 * DAY) { delete details[id]; detailsChanged = true; }
      if (detailsChanged) await S.set('details', details);

      // ---- 追蹤主題：新的發射排程 + 自動關注 ----
      if (L) {
        const seenL = new Set(await S.get('seenLaunches', []));
        const init = await S.get('launchInit', false);
        const un = new Set(await S.get('unwatched', []));
        const newMatches = [];
        for (const l of L.list) {
          const isNew = !seenL.has(l.id);
          seenL.add(l.id);
          if (FINAL.includes(l.status)) continue;
          const m = Zh.matchTopics(Zh.launchText(l), tps);
          if (!m.length) continue;
          if (isNew && init) newMatches.push([l, m]);
          if (cfg.autoWatch && !watched[l.id] && !un.has(l.id)) added[l.id] = watchEntry(l, cfg, true, now);
        }
        if (cfg.notifyNewLaunch) {
          for (const [l, m] of newMatches.slice(0, 3)) {
            notes.push({
              title: m[0].icon + ' 新的發射排程｜' + l.mission,
              body: [l.rocket, l.provider].filter(Boolean).join('・') + '\n' + Zh.fmtNet(l.net, l.prec) + '（' + m.map((x) => x.name).join('、') + '）',
              url: launchUrl(l.id), tag: 'new:' + l.id,
            });
          }
          if (newMatches.length > 3) notes.push({ title: '🚀 還有 ' + (newMatches.length - 3) + ' 個新的發射排程', body: '打開 App 查看', url: '#launches', tag: 'new:more' });
        }
        await S.set('seenLaunches', [...seenL].slice(-3000));
        await S.set('launchInit', true);
      }

      // ---- 關注的發射：時間變更、結果 ----
      const all = await allLaunches();
      for (const w of Object.values(watched)) {
        const l = all.get(w.id);
        if (!l) continue;
        const u = {};
        if (l.status !== w.status) {
          const [zh] = Zh.status(l.status);
          if (cfg.notifyResult && (FINAL.includes(l.status) || ['Hold', 'In Flight'].includes(l.status))) {
            const icon = l.status === 'Success' ? '✅' : l.status === 'In Flight' ? '🚀' : l.status === 'Hold' ? '⏸️' : '❌';
            notes.push({
              title: icon + ' ' + zh + '｜' + l.mission, body: [l.rocket, l.provider].filter(Boolean).join('・') + (l.failreason ? '\n' + l.failreason : ''),
              url: launchUrl(l.id), tag: 'status:' + l.id + ':' + l.status,
            });
          } else if (cfg.notifyChange && l.status === 'Go' && Zh.isPrecise(l.prec) && Date.parse(l.net) > now) {
            notes.push({ title: '🟢 確定發射｜' + l.mission, body: Zh.fmtNet(l.net, l.prec) + '\n' + l.rocket, url: launchUrl(l.id), tag: 'go:' + l.id });
          }
          u.status = l.status;
        }
        const oldT = Date.parse(w.net), newT = Date.parse(l.net);
        if (!isNaN(newT) && Math.abs(newT - oldT) >= MIN) {
          if (cfg.notifyChange && !FINAL.includes(l.status) && (Zh.isPrecise(l.prec) || Zh.isPrecise(w.prec)) && newT > now) {
            notes.push({
              title: '🕒 發射時間變更｜' + l.mission,
              body: '原本：' + Zh.fmtNet(w.net, w.prec) + '\n改為：' + Zh.fmtNet(l.net, l.prec),
              url: launchUrl(l.id), tag: 'net:' + l.id,
            });
          }
          u.fired = (cfg.offsets || []).filter((o) => now >= newT - o * MIN);
        }
        Object.assign(u, { name: l.name, mission: l.mission, rocket: l.rocket, provider: l.provider, net: l.net, prec: l.prec });
        updates[w.id] = u;
      }

      // ---- 新聞 ----
      let N = await S.get('news', null);
      if (force || !N || now - N.at >= cfg.newsEvery * MIN) {
        try { N = { at: now, list: mergeNews((await Api.news({ limit: 40 })).list, N && N.list) }; await S.set('news', N); }
        catch (e) { errors.push('新聞：' + e.message); }
      }
      if (N) {
        const seen = new Set(await S.get('seenNews', []));
        const init = await S.get('newsInit', false);
        const watchedIds = new Set(Object.keys(watched));
        const fresh = N.list.filter((a) => !seen.has(a.id));
        if (init && cfg.notifyNews) {
          const hits = fresh.filter((a) => now - a.published < DAY).map((a) => {
            const m = Zh.matchTopics(Zh.newsText(a), tps);
            const forWatched = a.launches.some((id) => watchedIds.has(id));
            return [a, m, forWatched];
          }).filter(([, m, fw]) => m.length || fw);
          for (const [a, m] of hits.slice(0, 3)) {
            notes.push({
              title: (m[0] ? m[0].icon + ' ' + m[0].name : '📰 關注的發射') + '｜新消息',
              body: a.title + '\n— ' + a.site, url: a.url, tag: 'news:' + a.id,
            });
          }
          if (hits.length > 3) notes.push({ title: '📰 還有 ' + (hits.length - 3) + ' 則追蹤主題的新聞', body: '打開 App 查看', url: '#news', tag: 'news:more' });
        }
        for (const a of N.list) seen.add(a.id);
        await S.set('seenNews', [...seen].slice(-3000));
        await S.set('newsInit', true);
      }
      await S.set('lastCheck', now);
    }

    // ---- 提醒（重新讀取再寫回，避免蓋掉使用者剛剛的修改） ----
    const watched = await S.get('watched', {});
    const un = new Set(await S.get('unwatched', []));
    for (const [id, u] of Object.entries(updates)) if (watched[id]) Object.assign(watched[id], u);
    for (const [id, w] of Object.entries(added)) if (!watched[id] && !un.has(id)) watched[id] = w;
    const details = await S.get('details', {});
    notes.push(...launchReminders(watched, cfg, now, details));
    for (const [id, w] of Object.entries(watched)) {
      const t = Date.parse(w.net);
      if (!isNaN(t) && t < now - 2 * DAY) delete watched[id];
    }
    await S.set('watched', watched);

    const alerts = await S.get('skyAlerts', []);
    notes.push(...skyReminders(alerts, now));
    await S.set('skyAlerts', alerts.filter((a) => a.at > now - DAY));

    if (notify) for (const n of notes) await notify(n);
    return { notes, errors };
  }

  g.Checker = { run, settings, topics, watch, unwatch, syncAutoWatch, allLaunches, setSkyAlerts, DEFAULTS, FINAL };
})(self);
