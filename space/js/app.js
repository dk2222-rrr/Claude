(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const S = Store, Z = Zh;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const FINAL = Checker.FINAL;

  const OFFSETS = [[1440, '1 天前'], [180, '3 小時前'], [60, '1 小時前'], [30, '30 分鐘前'], [10, '10 分鐘前'], [0, '發射時']];
  const PROVIDER_TYPE = { Commercial: '商業公司', Government: '政府機構', Multinational: '跨國組織', Private: '私人', Educational: '學術單位' };
  const PLACES = [
    ['台北', 25.033, 121.565], ['新北', 25.012, 121.465], ['基隆', 25.128, 121.741], ['桃園', 24.993, 121.301], ['新竹', 24.804, 120.971],
    ['苗栗', 24.560, 120.821], ['台中', 24.148, 120.674], ['彰化', 24.081, 120.538], ['南投', 23.910, 120.684], ['雲林', 23.709, 120.431],
    ['嘉義', 23.480, 120.449], ['台南', 22.999, 120.227], ['高雄', 22.627, 120.301], ['屏東', 22.669, 120.486], ['墾丁', 21.946, 120.796],
    ['宜蘭', 24.757, 121.753], ['花蓮', 23.977, 121.604], ['台東', 22.756, 121.144], ['澎湖', 23.571, 119.579], ['金門', 24.432, 118.318],
    ['馬祖', 26.160, 119.950], ['香港', 22.302, 114.177], ['澳門', 22.199, 113.544], ['東京', 35.682, 139.759], ['大阪', 34.694, 135.502],
    ['首爾', 37.566, 126.978], ['新加坡', 1.352, 103.820], ['吉隆坡', 3.139, 101.687],
  ];
  const LAUNCH_FILTERS = [['all', '全部'], ['star', '⭐ 已關注'], ['topic', '🎯 追蹤主題'], ['crew', '👩‍🚀 載人'], ['US', '🇺🇸 美國'], ['CN', '🇨🇳 中國'], ['other', '🌏 其他國家']];
  const SKY_FILTERS = [['major', '⭐ 重要天象'], ['all', '全部'], ['visible', '你看得到的'], ['eclipse', '日月食'], ['meteor', '流星雨'], ['planet', '行星與月亮']];

  const st = {
    tab: 'launches', settings: {}, topics: [], watched: {}, launches: null, previous: null, events: null, news: null, details: {},
    launchView: 'up', launchFilter: 'all',
    newsMode: 'all', newsQ: '', newsItems: null, newsTotal: 0, newsLoading: false, newsError: '', newsViewedAt: 0,
    skyFilter: 'major', sky: null, topicNews: {}, skyBusy: false, skyPrefs: {}, tleError: '',
    checking: false, openId: null, bannerOff: false,
  };

  async function load() {
    st.settings = await Checker.settings();
    st.topics = await Checker.topics();
    st.watched = await S.get('watched', {});
    st.launches = await S.get('launches', null);
    st.previous = await S.get('previous', null);
    st.events = await S.get('llEvents', null);
    st.news = await S.get('news', null);
    st.details = await S.get('details', {});
    st.skyPrefs = await S.get('skyPrefs', {});
    st.newsViewedAt = await S.get('newsViewedAt', 0);
    st.bannerOff = await S.get('bannerOff', false);
  }
  const saveSettings = () => S.set('settings', st.settings);
  const saveTopics = () => S.set('topics', st.topics);

  // ---------- 通知 ----------
  function toast(title, body) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<b>' + esc(title) + '</b>' + esc(body || '');
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }
  async function notify(n) {
    toast(n.title, n.body);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const url = n.url ? new URL(n.url, location.href).href : '';
    const opts = { body: n.body, tag: n.tag, icon: 'icon.svg', badge: 'icon.svg', requireInteraction: !!n.requireInteraction, data: { url } };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) return reg.showNotification(n.title, opts);
      new Notification(n.title, opts);
    } catch (e) { /* 部分瀏覽器不支援，已用 toast 顯示 */ }
  }
  async function askNotif() {
    if (!('Notification' in window)) return toast('這個瀏覽器不支援通知', isIOS() ? '請先「加入主畫面」，再從主畫面的圖示打開' : '');
    const p = await Notification.requestPermission();
    if (p === 'granted') { toast('通知已開啟', '發射前和重要消息會通知你'); registerPeriodic(); }
    else toast('沒有取得通知權限', '可以到瀏覽器設定裡允許通知');
    renderBanner(); renderSettings();
  }
  async function registerPeriodic() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('periodicSync' in reg)) return;
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (p.state === 'granted') await reg.periodicSync.register('space-check', { minInterval: 3 * HOUR });
    } catch (e) { /* 不支援 */ }
  }
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // ---------- 更新資料 ----------
  async function refresh(manual) {
    if (st.checking) return;
    st.checking = true;
    const btn = $('#refresh');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">↻</span> 更新中';
    try {
      const res = await Checker.run({ notify, force: !!manual });
      await load();
      setStatus(res.errors);
      if (manual && !res.errors.length && !res.notes.length) toast('已是最新資料', '');
      if (st.newsMode === 'all') st.newsItems = null;
      renderAll();
    } catch (e) {
      setStatus([e.message]);
    } finally {
      st.checking = false;
      btn.disabled = false;
      btn.textContent = '↻ 更新';
    }
  }
  function setStatus(errors) {
    $('#status').innerHTML = errors && errors.length ? '<span class="err">⚠️ ' + esc(errors[0]) + '</span>' : '';
  }
  async function checkReminders() {
    const res = await Checker.run({ notify, onlyReminders: true });
    if (res.notes.length) { st.watched = await S.get('watched', {}); renderLaunches(); }
  }

  // ---------- 共用片段 ----------
  const launchTopics = (l) => Z.matchTopics(Z.launchText(l), st.topics);
  const topicTags = (tps) => tps.map((t) => '<span class="tag topic">' + esc(t.icon + ' ' + t.name) + '</span>').join('');
  const statusTag = (l) => { const [zh, cls] = Z.status(l.status); return '<span class="tag ' + cls + '">' + esc(zh) + '</span>'; };
  const liveTag = (l) => (l.live ? '<span class="tag live">● 直播中</span>' : '');
  const bg = (u) => (safeUrl(u) ? ' style="background-image:url(&quot;' + esc(u) + '&quot;)"' : '');
  const starBtn = (id) => '<button class="star' + (st.watched[id] ? ' on' : '') + '" data-star="' + esc(id) + '" aria-label="關注這次發射" title="關注（發射前提醒）">' + (st.watched[id] ? '★' : '☆') + '</button>';
  const cdSpan = (t) => '<span class="countdown' + (t - Date.now() < HOUR ? ' soon' : '') + '" data-cd="' + t + '">' + Z.countdown(t - Date.now()) + '</span>';
  const translateUrl = (url) => 'https://translate.google.com/translate?sl=auto&tl=zh-TW&u=' + encodeURIComponent(url);
  const translateText = (text) => 'https://translate.google.com/?sl=en&tl=zh-TW&op=translate&text=' + encodeURIComponent(String(text).slice(0, 4000));
  const extLink = (url, text, cls) => (safeUrl(url) ? '<a class="btn small' + (cls ? ' ' + cls : '') + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + text + '</a>' : '');
  const thumbImg = (u, ph) => (safeUrl(u) ? '<img class="thumb" src="' + esc(u) + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'thumb ph\',textContent:\'' + ph + '\'}))">' : '<div class="thumb ph">' + ph + '</div>');
  function dateBox(t, prec) {
    const d = new Date(t);
    if (isNaN(t)) return '<div class="date"><div class="m">日期</div><div class="d">?</div><div class="w">未定</div></div>';
    if (['M', 'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Y', 'FY'].includes(prec)) {
      const label = prec === 'M' ? (d.getUTCMonth() + 1) + '月' : prec[0] === 'Q' ? prec : prec[0] === 'H' ? (prec === 'H1' ? '上半' : '下半') : '—';
      return '<div class="date"><div class="m">' + d.getUTCFullYear() + '</div><div class="d" style="font-size:17px">' + label + '</div><div class="w">日期未定</div></div>';
    }
    return '<div class="date"><div class="m">' + (d.getMonth() + 1) + '月</div><div class="d">' + d.getDate() + '</div><div class="w">週' + '日一二三四五六'[d.getDay()] + '</div></div>';
  }

  // ---------- 關注發射 ----------
  async function toggleWatch(id) {
    if (st.watched[id]) {
      await Checker.unwatch(id);
      toast('已取消關注', '');
    } else {
      const all = await Checker.allLaunches();
      const l = all.get(id);
      if (!l) return;
      await Checker.watch(l);
      const offs = OFFSETS.filter(([o]) => (st.settings.offsets || []).includes(o)).map(([, s]) => s).join('、');
      toast('⭐ 已關注：' + l.mission, Z.isPrecise(l.prec) ? '會在發射' + (offs || '前') + '通知你' : '發射時間確定、延期或有結果時會通知你');
      if ('Notification' in window && Notification.permission === 'default') setTimeout(askNotif, 600);
    }
    st.watched = await S.get('watched', {});
    renderHero(); renderLaunches();
    if (st.openId === id) { const b = $('#sheetStar'); if (b) b.outerHTML = sheetStar(id); }
  }

  // ---------- 發射分頁 ----------
  function nextLaunch() {
    const now = Date.now();
    const list = (st.launches && st.launches.list) || [];
    return list.find((l) => !FINAL.includes(l.status) && Date.parse(l.net) > now - 30 * MIN && Z.isPrecise(l.prec))
      || list.find((l) => !FINAL.includes(l.status) && Date.parse(l.net) > now - 30 * MIN);
  }
  function renderHero() {
    const l = nextLaunch();
    if (!l) { $('#hero').innerHTML = st.launches ? '' : '<div class="card empty"><div class="big">🛰️</div>正在載入發射資料…</div>'; return; }
    const t = Date.parse(l.net);
    const precise = Z.isPrecise(l.prec);
    $('#hero').innerHTML = '<div class="hero" data-open="' + esc(l.id) + '"' + bg(l.image || l.thumb) + '><div class="in">' +
      '<div class="kicker">下一次發射</div><div class="name">' + esc(l.mission) + '</div>' +
      '<div class="meta">' + esc(l.rocket) + '・' + esc(l.provider) + '</div>' +
      '<div class="meta ellipsis">' + Z.flag(l.country) + ' ' + esc(Z.country(l.country)) + '・' + esc(l.location) + '</div>' +
      (precise ? '<div class="big" data-cd="' + t + '">' + Z.countdown(t - Date.now()) + '</div><div class="meta">' + esc(Z.fmtNet(l.net, l.prec)) + '</div>'
        : '<div class="big" style="font-size:22px">' + esc(Z.fmtNet(l.net, l.prec)) + '</div>') +
      '<div class="tags">' + statusTag(l) + liveTag(l) + topicTags(launchTopics(l)) + '</div>' +
      '</div>' + starBtn(l.id) + '</div>';
  }
  function passFilter(l, f) {
    if (f.startsWith('topic:')) return Z.matchTopics(Z.launchText(l), st.topics.filter((t) => 'topic:' + t.id === f)).length > 0;
    switch (f) {
      case 'star': return !!st.watched[l.id];
      case 'topic': return launchTopics(l).length > 0;
      case 'crew': return ['Human Exploration', 'Tourism'].includes(l.mtype) || /\b(Crew|Shenzhou|Soyuz MS|Gaganyaan|Axiom)\b/i.test(l.name);
      case 'US': case 'CN': return l.country === f;
      case 'other': return l.country !== 'US' && l.country !== 'CN';
      default: return true;
    }
  }
  function launchCard(l, past) {
    const t = Date.parse(l.net), now = Date.now();
    const precise = Z.isPrecise(l.prec);
    const showCd = !past && precise && !FINAL.includes(l.status) && t - now < 7 * DAY && t - now > -HOUR;
    const prov = l.provider.length > 26 && l.providerAbbrev ? l.providerAbbrev : l.provider;
    return '<div class="card launch" data-open="' + esc(l.id) + '">' + thumbImg(l.thumb, '🚀') +
      '<div class="grow"><div class="title">' + esc(l.mission) + '</div>' +
      '<div class="meta">' + esc(l.rocket) + (prov ? '・' + esc(prov) : '') + '</div>' +
      '<div class="meta ellipsis">' + Z.flag(l.country) + ' ' + esc(l.location || l.pad) + '</div>' +
      '<div class="meta">🕒 ' + esc(past ? Z.fmtFull(t) + '（' + Z.ago(t) + '）' : Z.fmtNet(l.net, l.prec)) + (showCd ? ' ' + cdSpan(t) : '') + '</div>' +
      '<div class="tags">' + statusTag(l) + liveTag(l) + (l.mtype ? '<span class="tag">' + esc(Z.mtype(l.mtype)) + '</span>' : '') + topicTags(launchTopics(l)) + '</div>' +
      '</div>' + (FINAL.includes(l.status) ? '' : starBtn(l.id)) + '</div>';
  }
  function renderLaunches() {
    $$('#launchSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.launchView));
    const filters = LAUNCH_FILTERS.slice();
    if (st.launchFilter.startsWith('topic:')) {
      const tp = st.topics.find((t) => 'topic:' + t.id === st.launchFilter);
      if (tp) filters.splice(1, 0, [st.launchFilter, tp.icon + ' ' + tp.name + ' ✕']); else st.launchFilter = 'all';
    }
    $('#launchFilter').innerHTML = filters.map(([k, label]) => '<button class="chip' + (st.launchFilter === k ? ' sel' : '') + '" data-lf="' + esc(k) + '">' + esc(label) + '</button>').join('');
    const src = st.launchView === 'past' ? st.previous : st.launches;
    if (!src) { $('#launchList').innerHTML = '<div class="empty"><div class="big">⏳</div>載入中…</div>'; return; }
    const past = st.launchView === 'past';
    const list = src.list.filter((l) => passFilter(l, st.launchFilter));
    if (!list.length) {
      const msg = st.launchFilter === 'star' ? '還沒有關注任何發射，按 ☆ 就能在發射前收到提醒' : st.launchFilter.startsWith('topic') ? '追蹤主題目前沒有相關的發射' : '沒有符合條件的發射';
      $('#launchList').innerHTML = '<div class="empty"><div class="big">🔭</div>' + esc(msg) + '</div>';
      return;
    }
    $('#launchList').innerHTML = list.map((l) => launchCard(l, past)).join('') +
      '<p class="hint center">資料更新：' + esc(Z.ago(src.at)) + '・來源 Launch Library 2</p>';
  }

  // ---------- 發射詳細資料 ----------
  const sheetStar = (id) => (st.watched[id]
    ? '<button id="sheetStar" class="btn" data-star="' + esc(id) + '">★ 已關注（再按一次取消）</button>'
    : '<button id="sheetStar" class="btn primary" data-star="' + esc(id) + '">☆ 關注並提醒我</button>');
  function launchDetailHtml(l, note) {
    const t = Date.parse(l.net), now = Date.now();
    const precise = Z.isPrecise(l.prec);
    const fin = FINAL.includes(l.status);
    const vids = l.vids || [];
    const win = l.ws && l.we && l.ws !== l.we && precise ? '發射窗口 ' + Z.fmtTime(Date.parse(l.ws)) + '–' + Z.fmtTime(Date.parse(l.we)) : '';
    const facts = [
      ['火箭', l.rocket], ['發射商', l.provider + (PROVIDER_TYPE[l.providerType] ? '（' + PROVIDER_TYPE[l.providerType] + '）' : '')],
      ['任務類型', Z.mtype(l.mtype)], ['目標軌道', Z.ORBIT[l.orbit] || l.orbitName],
      ['發射地點', [Z.flag(l.country) + ' ' + Z.country(l.country), l.pad, l.location].filter((s) => s && s.trim()).join('・')],
      ['天氣許可機率', l.probability != null && l.probability >= 0 ? l.probability + '%' : ''], ['天氣', l.weather],
      ['所屬計畫', (l.programs || []).join('、')], ['失敗原因', l.failreason],
    ].filter(([, v]) => v);
    const links = vids.map((v) => extLink(v.url, (v.live ? '🔴 直播中：' : '▶ ') + esc(v.publisher || v.title || '直播'), v.live ? 'live' : '')).join('') +
      (l.infos || []).slice(0, 3).map((v) => extLink(v.url, 'ℹ️ ' + esc(v.title || '官方資訊'))).join('') +
      (l.mapUrl ? extLink(l.mapUrl, '🗺️ 發射場地圖') : '') +
      extLink('https://www.youtube.com/results?search_query=' + encodeURIComponent(l.name + ' launch live'), '🔎 YouTube 找直播') +
      extLink('https://www.google.com/search?q=' + encodeURIComponent(l.name + ' launch'), '🔎 Google');
    const updates = (l.updates || []).slice(0, 5);
    return '<div class="cover"' + bg(l.image || l.thumb) + '></div><div class="body">' +
      (safeUrl(l.patch) ? '<img class="patch" src="' + esc(l.patch) + '" alt="任務徽章">' : '') +
      '<div class="tags">' + statusTag(l) + liveTag(l) + (l.mtype ? '<span class="tag">' + esc(Z.mtype(l.mtype)) + '</span>' : '') + topicTags(launchTopics(l)) + '</div>' +
      '<h2>' + esc(l.mission) + '</h2><div class="meta">' + esc(l.rocket) + '・' + esc(l.provider) + '</div>' +
      '<div class="card"><div class="title">🕒 ' + esc(Z.fmtNet(l.net, l.prec)) + '</div>' +
      (precise && !fin && t > now - HOUR ? '<div style="font-size:26px;font-weight:800">' + cdSpan(t) + '</div>' : '') +
      (win ? '<div class="meta">' + esc(win) + '</div>' : '') +
      (!fin ? '<div class="row" style="margin-top:10px">' + sheetStar(l.id) + '</div>' : '') + '</div>' +
      (l.desc ? '<h3>任務介紹</h3><p class="desc">' + esc(l.desc) + '</p><div class="links">' + extLink(translateText(l.desc), '🌐 翻譯成中文') + '</div>' : '') +
      '<dl class="facts">' + facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      '<h3>觀看直播與更多資訊</h3><div class="links">' + links + '</div>' +
      (updates.length ? '<h3 style="margin-top:18px">最新動態</h3>' + updates.map((u) => '<div class="update"><div>' + esc(u.text) + '</div><div class="meta">' +
        esc(Z.ago(Date.parse(u.at))) + (u.by ? '・' + esc(u.by) : '') + (safeUrl(u.url) ? '・<a href="' + esc(u.url) + '" target="_blank" rel="noopener">來源</a>' : '') + '</div></div>').join('') : '') +
      '<h3 style="margin-top:18px">相關新聞</h3><div id="relNews"><p class="meta">載入中…</p></div>' +
      (note ? '<p class="hint">' + esc(note) + '</p>' : '') + '</div>';
  }
  function showSheet(html) {
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet(fromPop) {
    if ($('#sheet').hidden) return;
    $('#sheet').hidden = true;
    st.openId = null;
    document.body.style.overflow = '';
    if (!fromPop && history.state && history.state.sheet) history.back();
  }
  async function openLaunch(id) {
    st.openId = id;
    if (history.state && history.state.sheet) history.replaceState({ sheet: 1 }, '', '#launch=' + id);
    else history.pushState({ sheet: 1 }, '', '#launch=' + id);
    const all = await Checker.allLaunches();
    let l = all.get(id);
    showSheet(l ? launchDetailHtml(l) : '<div class="body" style="padding-top:50px"><div class="empty"><div class="big spin">🛰️</div>載入中…</div></div>');
    $('.sheet-panel').scrollTop = 0;
    let note = '';
    const d = st.details[id];
    if (!d || Date.now() - d.at > 30 * MIN) {
      const b = await Api.llBudget();
      if (b.left > 3 || !l) {
        try {
          const data = await Api.launchDetail(id);
          st.details[id] = { at: Date.now(), data };
          const D = await S.get('details', {});
          D[id] = st.details[id];
          await S.set('details', D);
          l = Object.assign({}, l || {}, data);
        } catch (e) { note = '詳細資料（直播連結、最新動態）暫時無法取得：' + e.message; }
      } else note = '這一小時的 API 次數快用完了，直播連結等詳細資料稍後再載入。';
    } else l = Object.assign({}, l || {}, d.data);
    if (st.openId !== id) return;
    if (!l) { showSheet('<div class="body" style="padding-top:50px"><div class="empty"><div class="big">😵</div>' + esc(note || '找不到這次發射') + '</div></div>'); return; }
    const scroll = $('.sheet-panel').scrollTop;
    showSheet(launchDetailHtml(l, note));
    $('.sheet-panel').scrollTop = scroll;
    try {
      const r = await Api.news({ launch: id, limit: 10 });
      if (st.openId !== id) return;
      $('#relNews').innerHTML = r.list.length ? r.list.map(articleCard).join('') : '<p class="meta">還沒有相關新聞。</p>';
    } catch (e) {
      if (st.openId === id) $('#relNews').innerHTML = '<p class="meta">新聞載入失敗：' + esc(e.message) + '</p>';
    }
  }

  // ---------- 新聞 ----------
  function articleCard(a) {
    const tps = Z.matchTopics(Z.newsText(a), st.topics);
    const isNew = st.newsViewedAt && a.published > st.newsViewedAt;
    return '<div class="card"><div class="article"><div class="grow">' +
      '<a class="title" href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">' + esc(a.title) + '</a>' +
      '<div class="meta">' + esc(a.site) + '・' + esc(Z.ago(a.published)) + '</div>' +
      (a.summary ? '<div class="summary">' + esc(a.summary) + '</div>' : '') +
      ((tps.length || isNew) ? '<div class="tags">' + (isNew ? '<span class="tag tbc">新</span>' : '') + topicTags(tps) + '</div>' : '') +
      '</div>' + (safeUrl(a.image) ? '<img class="thumb" src="' + esc(a.image) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>' +
      '<div class="links">' + extLink(a.url, '閱讀原文') + extLink(translateUrl(a.url), '🌐 中文翻譯') +
      (a.launches && a.launches[0] ? '<button class="btn small" data-open="' + esc(a.launches[0]) + '">🚀 相關發射</button>' : '') + '</div></div>';
  }
  function newsTopicsFor(mode) {
    if (mode === 'mine') return st.topics;
    return st.topics.filter((t) => 'topic:' + t.id === mode);
  }
  async function fetchNewsPage(offset) {
    const mode = st.newsMode;
    if (mode === 'all') return Api.news({ offset, limit: 30 });
    if (mode === 'search') return Api.news({ search: st.newsQ, offset, limit: 30 });
    const tps = newsTopicsFor(mode);
    const kws = [...new Set(tps.flatMap((t) => t.keywords || []))].filter(Boolean).slice(0, 40);
    if (!kws.length) return { count: 0, list: [] };
    const [a, b] = await Promise.all([Api.news({ titleAny: kws, offset, limit: 20 }), Api.news({ summaryAny: kws, offset, limit: 20 })]);
    const map = new Map();
    for (const x of [...a.list, ...b.list]) if (Z.matchTopics(Z.newsText(x), tps).length) map.set(x.id, x);
    return { count: Math.max(a.count, b.count), list: [...map.values()].sort((x, y) => y.published - x.published) };
  }
  async function setNewsMode(mode, q) {
    st.newsMode = mode;
    st.newsQ = q || '';
    st.newsError = '';
    st.newsOffset = 0;
    if (mode === 'all') { st.newsItems = null; renderNews(); return; }
    st.newsItems = [];
    await loadMoreNews();
  }
  async function loadMoreNews() {
    if (st.newsLoading) return;
    st.newsLoading = true;
    renderNews();
    const mode = st.newsMode;
    try {
      const base = st.newsItems || (st.news && st.news.list) || [];
      const offset = mode === 'all' ? base.length : (st.newsOffset || 0);
      const r = await fetchNewsPage(offset);
      if (mode !== st.newsMode) return;
      const seen = new Set(base.map((a) => a.id));
      st.newsItems = base.concat(r.list.filter((a) => !seen.has(a.id)));
      st.newsOffset = offset + (mode === 'all' || mode === 'search' ? 30 : 20);
      st.newsTotal = r.count;
    } catch (e) {
      st.newsError = e.message;
    } finally {
      st.newsLoading = false;
      renderNews();
    }
  }
  function renderNews() {
    const chips = [['all', '全部'], ['mine', '🎯 我的主題']].concat(st.topics.map((t) => ['topic:' + t.id, t.icon + ' ' + t.name]));
    if (st.newsMode === 'search') chips.unshift(['search', '🔍 ' + st.newsQ + ' ✕']);
    $('#newsFilter').innerHTML = chips.map(([k, label]) => '<button class="chip' + (st.newsMode === k ? ' sel' : '') + '" data-nf="' + esc(k) + '">' + esc(label) + '</button>').join('');
    const items = st.newsItems || (st.news && st.news.list) || [];
    let html = items.map(articleCard).join('');
    if (!items.length) {
      html = st.newsLoading ? '<div class="empty"><div class="big spin">🛰️</div>載入中…</div>'
        : st.newsError ? '<div class="empty"><div class="big">😵</div>載入失敗：' + esc(st.newsError) + '</div>'
          : !st.news && st.newsMode === 'all' ? '<div class="empty"><div class="big">⏳</div>載入中…</div>'
            : '<div class="empty"><div class="big">📭</div>' + (st.newsMode === 'mine' && !st.topics.length ? '還沒有追蹤主題，到「追蹤」分頁加入吧' : '沒有找到相關新聞') + '</div>';
    } else if (st.newsError) html += '<p class="hint center">⚠️ ' + esc(st.newsError) + '</p>';
    $('#newsList').innerHTML = html;
    const more = $('#newsMore');
    const hasMore = st.newsMode === 'all' ? items.length > 0 : items.length > 0 && (st.newsOffset || 0) < st.newsTotal;
    more.hidden = !hasMore;
    more.disabled = st.newsLoading;
    more.textContent = st.newsLoading ? '載入中…' : '載入更多';
  }
  function topicNewsCount() {
    if (!st.news) return 0;
    return st.news.list.filter((a) => a.published > st.newsViewedAt && Z.matchTopics(Z.newsText(a), st.topics).length).length;
  }
  function renderBadge() {
    const n = st.newsViewedAt ? topicNewsCount() : 0;
    const b = $('#newsBadge');
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
  }

  // ---------- 追蹤主題 ----------
  function renderTopics() {
    $('#topicCount').textContent = st.topics.length ? '（' + st.topics.length + '）' : '';
    const up = ((st.launches && st.launches.list) || []).filter((l) => !FINAL.includes(l.status));
    const news = (st.news && st.news.list) || [];
    $('#topicList').innerHTML = st.topics.length ? st.topics.map((tp) => {
      const ls = up.filter((l) => Z.matchTopics(Z.launchText(l), [tp]).length);
      const tn = st.topicNews[tp.id];
      const ns = tn ? tn.list : news.filter((a) => Z.matchTopics(Z.newsText(a), [tp]).length);
      const mini = ls.slice(0, 2).map((l) => '<div data-open="' + esc(l.id) + '" style="cursor:pointer">🚀 ' + esc(Z.fmtNet(l.net, l.prec)) + '｜' + esc(l.mission) + '</div>').join('') +
        ns.slice(0, 2).map((a) => '<a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">📰 ' + esc(a.title) + '</a>').join('');
      return '<div class="card"><div class="topic-head"><div class="icon">' + esc(tp.icon || '🔖') + '</div><div class="grow"><div class="title">' + esc(tp.name) + '</div>' +
        '<div class="meta">' + (ls.length ? ls.length + ' 次即將發射' : '近期沒有排定的發射') + (tn && tn.list[0] ? '・最新消息 ' + esc(Z.ago(tn.list[0].published)) : '') + '</div></div></div>' +
        (mini ? '<div class="mini">' + mini + '</div>' : '') +
        '<div class="links"><button class="btn small" data-tl="' + esc(tp.id) + '">🚀 發射</button><button class="btn small" data-tn="' + esc(tp.id) + '">📰 新聞</button>' +
        '<button class="btn small danger" data-tdel="' + esc(tp.id) + '">移除</button></div>' +
        '<details><summary class="meta" style="margin-top:8px;cursor:pointer">編輯關鍵字</summary><div class="kw"><input value="' + esc((tp.keywords || []).join(', ')) + '" data-kw="' + esc(tp.id) + '" aria-label="關鍵字">' +
        '<button class="btn small" data-kwsave="' + esc(tp.id) + '">儲存</button></div></details></div>';
    }).join('') : '<div class="empty"><div class="big">🎯</div>還沒有追蹤主題，從下面挑幾個吧</div>';
    const have = new Set(st.topics.map((t) => t.id));
    $('#topicPresets').innerHTML = Z.TOPICS.map((t) => '<button class="chip' + (have.has(t.id) ? ' on' : '') + '" data-preset="' + esc(t.id) + '">' + (have.has(t.id) ? '✓ ' : '＋ ') + esc(t.icon + ' ' + t.name) + '</button>').join('');
  }
  // 每個追蹤主題各抓最新 2 則新聞（Spaceflight News API 沒有嚴格次數限制，快取 30 分鐘）
  async function loadTopicNews(force) {
    const now = Date.now();
    const todo = st.topics.filter((tp) => force || !st.topicNews[tp.id] || now - st.topicNews[tp.id].at > 30 * MIN);
    if (!todo.length) return;
    await Promise.all(todo.map(async (tp) => {
      try {
        const kws = (tp.keywords || []).filter(Boolean).slice(0, 20);
        const r = await Api.news({ titleAny: kws, limit: 6 });
        st.topicNews[tp.id] = { at: now, list: r.list.filter((a) => Z.matchTopics(Z.newsText(a), [tp]).length).slice(0, 2) };
      } catch (e) { /* 失敗就用快取的新聞 */ }
    }));
    if (st.tab === 'topics') renderTopics();
  }
  async function addTopic(tp) {
    if (st.topics.some((t) => t.id === tp.id)) return;
    st.topics.push(Object.assign({}, tp, { keywords: tp.keywords.slice(), addedAt: Date.now() }));
    await saveTopics();
    const n = await Checker.syncAutoWatch();
    st.watched = await S.get('watched', {});
    toast('已追蹤：' + tp.name, n ? '相關的 ' + n + ' 次發射已加入關注' : '有新的發射或新聞會通知你');
    renderAll();
    loadTopicNews(false);
  }
  async function removeTopic(id) {
    const tp = st.topics.find((t) => t.id === id);
    st.topics = st.topics.filter((t) => t.id !== id);
    await saveTopics();
    // 只因為這個主題才自動關注的發射，一起移除
    const w = await S.get('watched', {});
    const all = await Checker.allLaunches();
    for (const [lid, e] of Object.entries(w)) {
      if (!e.auto) continue;
      const l = all.get(lid) || e;
      if (!Z.matchTopics(Z.launchText(l), st.topics).length) delete w[lid];
    }
    await S.set('watched', w);
    st.watched = w;
    if (st.launchFilter === 'topic:' + id) st.launchFilter = 'all';
    if (st.newsMode === 'topic:' + id) { st.newsMode = 'all'; st.newsItems = null; }
    toast('已移除追蹤', tp ? tp.name : '');
    renderAll();
  }
  function renderEvents() {
    const list = (st.events && st.events.list) || [];
    if (!list.length) { $('#eventList').innerHTML = '<div class="empty">' + (st.events ? '目前沒有排定的太空事件' : '載入中…') + '</div>'; return; }
    $('#eventList').innerHTML = list.map((e) => {
      const t = Date.parse(e.date);
      const tps = Z.matchTopics(Z.eventText(e), st.topics);
      return '<div class="card when">' + dateBox(t, e.prec) + '<div class="grow"><div class="title">' + esc(e.name) + '</div>' +
        '<div class="meta">' + esc(Z.eventType(e.type)) + (e.location ? '・' + esc(e.location) : '') + '・' + esc(Z.fmtNet(e.date, e.prec)) + '</div>' +
        (e.desc ? '<div class="summary">' + esc(e.desc) + '</div>' : '') +
        ((tps.length || e.live) ? '<div class="tags">' + liveTag(e) + topicTags(tps) + '</div>' : '') +
        '<div class="links">' + extLink(e.vid, e.live ? '🔴 直播中' : '▶ 直播', e.live ? 'live' : '') + extLink(e.info, 'ℹ️ 資訊') + (e.desc ? extLink(translateText(e.name + '\n' + e.desc), '🌐 翻譯') : '') + '</div>' +
        '</div></div>';
    }).join('');
  }

  // ---------- 天象 ----------
  async function ensureTLE() {
    let T = await S.get('tle', null);
    st.tleError = '';
    if (!T || Date.now() - T.at > 12 * HOUR) {
      try { T = { at: Date.now(), list: await Api.stationTLEs() }; await S.set('tle', T); }
      catch (e) { st.tleError = e.message || '無法取得軌道資料'; }
    }
    return T;
  }
  async function computeSky(force) {
    if (st.skyBusy) return;
    const loc = st.settings.location;
    const key = loc.lat + ',' + loc.lon;
    if (!force && st.sky && st.sky.key === key && Date.now() - st.sky.at < HOUR) return;
    st.skyBusy = true;
    try {
      const now = Date.now();
      const sky = { at: now, key, moon: Sky.moonInfo(new Date()), planets: Sky.planetsTonight(loc, new Date()), events: Sky.events(loc, now, 366), passes: [] };
      const T = await ensureTLE();
      if (T) {
        sky.tleAt = T.at;
        for (const tle of T.list) {
          try { sky.passes.push(...Sky.passes(tle, loc, now - 10 * MIN, 24 * 10)); } catch (e) { console.warn(e); }
        }
        sky.passes.sort((a, b) => a.start - b.start);
      }
      st.sky = sky;
      await updateSkyAlerts();
    } catch (e) {
      console.error(e);
      toast('天象計算失敗', e.message);
    } finally {
      st.skyBusy = false;
    }
    renderSky();
  }
  const evAlertDefault = (ev) => !!(st.settings.notifySky && ev.visible && ev.major);
  const passAlertDefault = (p) => !!(st.settings.notifyIss && p.maxEl >= st.settings.issMinEl);
  const alertOn = (id, def) => (st.skyPrefs[id] != null ? st.skyPrefs[id] : def);
  async function updateSkyAlerts() {
    if (!st.sky) return;
    const list = [];
    for (const ev of st.sky.events) {
      if (!alertOn(ev.id, evAlertDefault(ev))) continue;
      const d = new Date(ev.at);
      const eve = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 18, 0).getTime();
      list.push({ id: ev.id + ':d1', at: eve, title: ev.icon + ' 明天' + (d.getHours() < 6 ? '凌晨' : '') + '：' + ev.title, body: Z.fmtFull(ev.at) + '\n' + ev.detail.slice(0, 110), url: '#sky' });
      if ((ev.type === 'lunar' || ev.type === 'solar') && ev.visible) {
        list.push({ id: ev.id + ':h', at: ev.at - 90 * MIN, title: ev.icon + ' ' + ev.title + '快開始了', body: '食甚 ' + Z.fmtTime(ev.at) + '\n' + ev.detail.slice(0, 110), url: '#sky', urgent: true });
      }
    }
    for (const p of st.sky.passes) {
      if (!alertOn('pass:' + p.id, passAlertDefault(p))) continue;
      list.push({
        id: 'pass:' + p.id, at: p.start - 10 * MIN, urgent: true, url: '#sky',
        title: '🛰️ 10 分鐘後' + p.satName + '飛過',
        body: Z.fmtTime(p.start) + ' 從' + p.startDir + '方出現，最高仰角 ' + Math.round(p.maxEl) + '°（' + p.maxDir + '方），約 ' + p.duration + ' 分鐘後在' + p.endDir + '方' + (p.fadesOut ? '消失' : '落下'),
      });
    }
    await Checker.setSkyAlerts(list.filter((a) => a.at > Date.now() - 3 * HOUR));
  }
  function bellBtn(id, on, label) {
    return '<button class="star bell' + (on ? ' on' : '') + '" data-bell="' + esc(id) + '" data-on="' + (on ? 1 : 0) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + (on ? '🔔' : '🔕') + '</button>';
  }
  function renderSky() {
    const loc = st.settings.location || {};
    $('#locName').textContent = loc.name || '自訂位置';
    $('#locCoord').textContent = (loc.lat >= 0 ? '北緯 ' : '南緯 ') + Math.abs(loc.lat).toFixed(2) + '°、' + (loc.lon >= 0 ? '東經 ' : '西經 ') + Math.abs(loc.lon).toFixed(2) + '°';
    if (!$('#locPreset').options.length) {
      $('#locPreset').innerHTML = '<option value="">換城市…</option>' + PLACES.map(([n], i) => '<option value="' + i + '">' + esc(n) + '</option>').join('');
    }
    $('#skyFilter').innerHTML = SKY_FILTERS.map(([k, label]) => '<button class="chip' + (st.skyFilter === k ? ' sel' : '') + '" data-sf="' + k + '">' + label + '</button>').join('');
    const sky = st.sky;
    if (!sky) {
      const wait = '<div class="empty"><div class="big spin">🪐</div>計算中…</div>';
      $('#moonCard').innerHTML = ''; $('#passList').innerHTML = wait; $('#planetList').innerHTML = '計算中…'; $('#skyList').innerHTML = '';
      return;
    }
    const m = sky.moon;
    $('#moonCard').innerHTML = '<div class="card moon"><div class="emoji">' + m.icon + '</div><div class="grow"><div class="title">今天的月相：' + esc(m.name) + '</div>' +
      '<div class="meta">被照亮 ' + Math.round(m.illum * 100) + '%・月齡 ' + m.age.toFixed(1) + ' 天</div>' +
      '<div class="meta">下次滿月 ' + esc(Z.fmtDay(m.nextFull)) + '・下次新月 ' + esc(Z.fmtDay(m.nextNew)) + '</div></div></div>';

    const now = Date.now();
    const passes = sky.passes.filter((p) => p.end > now);
    $('#passList').innerHTML = (passes.length ? passes.map((p) => {
      const on = alertOn('pass:' + p.id, passAlertDefault(p));
      const soon = p.start - now;
      return '<div class="card pass when">' + dateBox(p.start, 'MIN') + '<div class="grow"><div class="title">' + esc(p.satName) + '</div>' +
        '<div class="big">' + Z.fmtTime(p.start) + ' – ' + Z.fmtTime(p.end) + '</div>' +
        '<div class="meta">從' + p.startDir + '方出現 → 最高 ' + Math.round(p.maxEl) + '°（' + p.maxDir + '方）→ ' + (p.fadesOut ? '在' + p.endDir + '方消失（進入地球陰影）' : '在' + p.endDir + '方落下') + '</div>' +
        '<div class="tags"><span class="tag vis">' + esc(p.bright) + '</span><span class="tag">約 ' + p.duration + ' 分鐘</span>' +
        (soon > 0 ? '<span class="tag">' + esc(Z.inWords(soon)) + '</span>' : '<span class="tag live">正在飛過</span>') + '</div></div>' +
        bellBtn('pass:' + p.id, on, '過境前 10 分鐘提醒') + '</div>';
    }).join('') : '<div class="card empty" style="padding:20px">未來 10 天沒有看得到的過境。<br><span class="meta">太空站經過時剛好是白天，或是在地球的陰影裡，所以看不到；通常過一、兩週就會再出現。</span></div>') +
      '<p class="hint">' + (st.tleError ? '⚠️ 軌道資料更新失敗：' + esc(st.tleError) + (sky.tleAt ? '（使用 ' + esc(Z.ago(sky.tleAt)) + '的資料）' : '') : sky.tleAt ? '軌道資料：CelesTrak，' + esc(Z.ago(sky.tleAt)) + '更新。' : '') +
      '幾天以後的預測可能差幾分鐘，出門前再看一次。</p>';

    const pl = sky.planets;
    $('#planetList').innerHTML = (pl.night ? '<p class="meta" style="margin:0 0 10px">日落 ' + Z.fmtTime(pl.night.set) + '・天色全暗 ' + Z.fmtTime(pl.night.darkFrom) + '・日出 ' + Z.fmtTime(pl.night.rise) + '</p>' : '') +
      '<div class="planets">' + pl.list.map((p) => '<div class="title">' + esc(p.name) + '</div><div class="meta">' + esc(p.visible ? p.text : '今晚看不到（太靠近太陽）') + '</div>' +
        '<div class="meta">' + p.mag.toFixed(1) + ' 等</div>').join('') + '</div>' +
      '<p class="hint" style="margin:10px 0 0">「等」是亮度，數字越小越亮；金星和木星比任何恆星都亮，很好認。</p>';

    const f = st.skyFilter;
    const pick = (e) => {
      switch (f) {
        case 'major': return e.visible && e.major;
        case 'visible': return e.visible;
        case 'eclipse': return e.type === 'lunar' || e.type === 'solar';
        case 'meteor': return e.type === 'meteor';
        case 'planet': return e.type === 'planet' || e.type === 'moon';
        default: return true;
      }
    };
    const evs = sky.events.filter((e) => e.at > now - DAY && pick(e));
    $('#skyList').innerHTML = evs.length ? evs.map((e) => {
      const on = alertOn(e.id, evAlertDefault(e));
      const days = Math.ceil((new Date(e.at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
      return '<div class="card when sky-ev' + (e.visible ? '' : ' dim') + '">' + dateBox(e.at, 'MIN') + '<div class="grow">' +
        '<div class="title">' + e.icon + ' ' + esc(e.title) + '</div>' +
        '<div class="meta">' + esc(Z.fmtFull(e.at)) + '・' + (days <= 0 ? '今天' : days === 1 ? '明天' : days + ' 天後') + '</div>' +
        '<div class="tags">' + (e.visible ? '<span class="tag vis">你看得到</span>' : '<span class="tag">你的位置看不到</span>') + '</div>' +
        '<div class="summary" style="-webkit-line-clamp:6">' + esc(e.detail) + '</div></div>' +
        bellBtn(e.id, on, '前一天提醒') + '</div>';
    }).join('') : '<div class="empty">沒有符合條件的天象</div>';
  }
  async function setLocation(loc) {
    st.settings.location = loc;
    await saveSettings();
    st.sky = null;
    renderSky();
    computeSky(true);
  }

  // ---------- 設定 ----------
  function renderSettings() {
    const ns = $('#notifState');
    if (!('Notification' in window)) {
      ns.textContent = isIOS() && !isStandalone() ? 'iPhone／iPad 要先在 Safari 按「分享 → 加入主畫面」，再從主畫面的圖示打開，才能開啟通知（需要 iOS 16.4 以上）。' : '這個瀏覽器不支援通知。';
      $('#enableNotif').hidden = true;
    } else {
      const p = Notification.permission;
      ns.textContent = p === 'granted' ? '✅ 通知已開啟' : p === 'denied' ? '❌ 通知被封鎖了，請到瀏覽器（或系統）設定裡允許這個網站的通知' : '尚未開啟通知';
      $('#enableNotif').hidden = p !== 'default';
    }
    $('#offsets').innerHTML = OFFSETS.map(([o, label]) => '<label><input type="checkbox" data-off="' + o + '"' + ((st.settings.offsets || []).includes(o) ? ' checked' : '') + '> ' + label + '</label>').join('');
    $$('[data-set]').forEach((el) => {
      const v = st.settings[el.dataset.set];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
    });
    Api.llBudget().then((b) => {
      $('#budget').textContent = '發射資料 API 是免費的，每小時最多 15 次。這一小時已用 ' + b.calls.length + ' 次' + (b.blockedUntil ? '（暫時限流中）' : '') + '。';
    });
    S.get('lastCheck', 0).then((t) => { $('#lastCheck').textContent = t ? '上次更新：' + Z.fmtFull(t) : ''; });
  }
  function renderBanner() {
    let html = '';
    if (!st.bannerOff) {
      if (isIOS() && !isStandalone()) {
        html = '📱 iPhone 要先用 Safari 按「分享 → 加入主畫面」，從主畫面打開才收得到發射提醒。';
      } else if ('Notification' in window && Notification.permission === 'default') {
        html = '🔔 開啟通知，關注的發射在升空前會提醒你，追蹤的主題有新消息也會通知。<div class="row"><button class="btn primary small" data-act="notif">開啟通知</button></div>';
      }
    }
    $('#notifBanner').innerHTML = html ? '<div class="banner"><button class="sheet-close" style="position:static;float:right;margin:-4px -4px 0 8px;width:28px;height:28px;font-size:13px" data-act="banner-off" aria-label="關閉">✕</button>' + html + '</div>' : '';
  }

  function renderAll() {
    renderBanner(); renderHero(); renderLaunches(); renderNews(); renderTopics(); renderEvents(); renderSky(); renderSettings(); renderBadge();
  }

  // ---------- 分頁、網址 ----------
  async function showTab(name) {
    if (!$('#tab-' + name)) return;
    st.tab = name;
    $$('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo(0, 0);
    if (name === 'news') {
      renderNews();
      st.newsViewedAt = Date.now();
      await S.set('newsViewedAt', st.newsViewedAt);
      renderBadge();
    }
    if (name === 'sky') computeSky(false);
    if (name === 'topics') loadTopicNews(false);
    if (name === 'settings') renderSettings();
  }
  function handleHash(hash) {
    const h = String(hash || '').replace(/^.*#/, '');
    if (!h) return;
    const m = /^launch=(.+)$/.exec(h);
    if (m) { showTab('launches'); openLaunch(decodeURIComponent(m[1])); return; }
    if (['launches', 'news', 'topics', 'sky', 'settings'].includes(h)) showTab(h);
  }

  // ---------- 事件 ----------
  function bind() {
    $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
    $('#refresh').addEventListener('click', () => { refresh(true); if (st.tab === 'sky') computeSky(true); });
    $('#launchSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.launchView = b.dataset.v; renderLaunches(); });

    document.addEventListener('click', async (e) => {
      const t = e.target;
      const star = t.closest('[data-star]');
      if (star) { e.stopPropagation(); toggleWatch(star.dataset.star); return; }
      if (t.closest('[data-close]')) { closeSheet(); return; }
      const bell = t.closest('[data-bell]');
      if (bell) {
        const on = bell.dataset.on !== '1';
        st.skyPrefs[bell.dataset.bell] = on;
        await S.set('skyPrefs', st.skyPrefs);
        bell.outerHTML = bellBtn(bell.dataset.bell, on, bell.getAttribute('aria-label'));
        if (on && 'Notification' in window && Notification.permission === 'default') askNotif();
        toast(on ? '🔔 會提醒你' : '🔕 不提醒', '');
        await updateSkyAlerts();
        return;
      }
      const lf = t.closest('[data-lf]');
      if (lf) { st.launchFilter = lf.dataset.lf === st.launchFilter && lf.dataset.lf.startsWith('topic:') ? 'all' : lf.dataset.lf; renderLaunches(); return; }
      const nf = t.closest('[data-nf]');
      if (nf) {
        const k = nf.dataset.nf;
        if (k === 'search') { $('#newsQ').value = ''; setNewsMode('all'); } else setNewsMode(k);
        return;
      }
      const sf = t.closest('[data-sf]');
      if (sf) { st.skyFilter = sf.dataset.sf; renderSky(); return; }
      const preset = t.closest('[data-preset]');
      if (preset) {
        const id = preset.dataset.preset;
        if (st.topics.some((x) => x.id === id)) removeTopic(id);
        else addTopic(Z.TOPICS.find((x) => x.id === id));
        return;
      }
      const tdel = t.closest('[data-tdel]');
      if (tdel) { removeTopic(tdel.dataset.tdel); return; }
      const tl = t.closest('[data-tl]');
      if (tl) { st.launchFilter = 'topic:' + tl.dataset.tl; st.launchView = 'up'; showTab('launches'); renderLaunches(); return; }
      const tn = t.closest('[data-tn]');
      if (tn) { showTab('news'); setNewsMode('topic:' + tn.dataset.tn); return; }
      const kws = t.closest('[data-kwsave]');
      if (kws) {
        const id = kws.dataset.kwsave;
        const input = document.querySelector('[data-kw="' + CSS.escape(id) + '"]');
        const list = input.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        if (!list.length) return toast('至少要有一個關鍵字', '');
        const tp = st.topics.find((x) => x.id === id);
        tp.keywords = list;
        delete st.topicNews[id];
        await saveTopics();
        await Checker.syncAutoWatch();
        st.watched = await S.get('watched', {});
        toast('已更新關鍵字', tp.name);
        renderAll();
        return;
      }
      const act = t.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'notif') askNotif();
        if (act.dataset.act === 'banner-off') { st.bannerOff = true; await S.set('bannerOff', true); renderBanner(); }
        return;
      }
      const open = t.closest('[data-open]');
      if (open && !t.closest('a')) { openLaunch(open.dataset.open); }
    });
    window.addEventListener('popstate', () => closeSheet(true));
    // App 開著時從外部改了網址（例如通知連結）
    window.addEventListener('hashchange', () => {
      if (history.state && history.state.sheet) return;
      const h = location.hash;
      if (!h) return;
      history.replaceState(null, '', location.pathname + location.search);
      handleHash(h);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

    $('#newsSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#newsQ').value.trim();
      if (q) setNewsMode('search', q); else setNewsMode('all');
    });
    $('#newsMore').addEventListener('click', loadMoreNews);

    $('#topicForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const keywords = String(f.get('keywords')).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      const name = String(f.get('name')).trim();
      if (!name || !keywords.length) return;
      await addTopic({ id: 'custom-' + Date.now().toString(36), icon: '🔖', name, keywords });
      e.target.reset();
      $('#customTopic').open = false;
    });

    $('#locPreset').addEventListener('change', (e) => {
      const p = PLACES[Number(e.target.value)];
      e.target.value = '';
      if (p) setLocation({ name: p[0], lat: p[1], lon: p[2] });
    });
    $('#useGeo').addEventListener('click', () => {
      if (!navigator.geolocation) return toast('這個瀏覽器不支援定位', '請改用城市選單');
      $('#useGeo').disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        $('#useGeo').disabled = false;
        setLocation({ name: '目前位置', lat: Math.round(pos.coords.latitude * 1000) / 1000, lon: Math.round(pos.coords.longitude * 1000) / 1000 });
        toast('📍 已更新觀測地點', '位置只存在你的裝置上');
      }, (err) => {
        $('#useGeo').disabled = false;
        toast('無法取得位置', err.code === 1 ? '請允許定位權限，或改用城市選單' : err.message);
      }, { timeout: 15000, maximumAge: 600000 });
    });

    $('#enableNotif').addEventListener('click', askNotif);
    $('#testNotif').addEventListener('click', () => notify({ title: '🚀 測試通知', body: '看到這則就代表通知正常！', tag: 'test' }));
    $('#offsets').addEventListener('change', async () => {
      st.settings.offsets = $$('#offsets input:checked').map((i) => Number(i.dataset.off));
      await saveSettings();
    });
    $$('[data-set]').forEach((el) => el.addEventListener('change', async () => {
      const k = el.dataset.set;
      st.settings[k] = el.type === 'checkbox' ? el.checked : el.hasAttribute('data-num') ? Number(el.value) : el.value;
      await saveSettings();
      if (k === 'autoWatch' && el.checked) { const n = await Checker.syncAutoWatch(); st.watched = await S.get('watched', {}); if (n) toast('已自動關注 ' + n + ' 次發射', ''); renderLaunches(); }
      if (['notifySky', 'notifyIss', 'issMinEl'].includes(k)) { await updateSkyAlerts(); renderSky(); }
    }));

    $('#exportBtn').addEventListener('click', async () => {
      const data = { app: 'space-radar', version: 1, exportedAt: new Date().toISOString(), topics: st.topics, watched: await S.get('watched', {}), settings: st.settings, skyPrefs: st.skyPrefs };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = '太空雷達備份.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (d.app !== 'space-radar') throw new Error('不是太空雷達的備份檔');
        if (Array.isArray(d.topics)) await S.set('topics', d.topics.filter((t) => t && t.id && t.name && Array.isArray(t.keywords)));
        if (d.watched && typeof d.watched === 'object') await S.set('watched', d.watched);
        if (d.settings && typeof d.settings === 'object') await S.set('settings', d.settings);
        if (d.skyPrefs && typeof d.skyPrefs === 'object') await S.set('skyPrefs', d.skyPrefs);
        await load();
        st.sky = null;
        renderAll();
        computeSky(true);
        toast('匯入完成', st.topics.length + ' 個追蹤主題');
      } catch (err) { toast('匯入失敗', err.message); }
    });
    $('#clearCache').addEventListener('click', async () => {
      for (const k of ['launches', 'previous', 'llEvents', 'news', 'details', 'tle']) await S.set(k, null);
      await S.set('details', {});
      await load();
      st.sky = null;
      renderAll();
      refresh(true);
      computeSky(true);
    });

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.open) handleHash(e.data.open); });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      refresh(false);
      if (st.sky && Date.now() - st.sky.at > HOUR) computeSky(true);
    });
  }

  // 每秒更新倒數
  function tick() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-cd]')) {
      const t = Number(el.dataset.cd);
      el.textContent = Z.countdown(t - now);
      if (el.classList.contains('countdown')) el.classList.toggle('soon', t - now < HOUR);
    }
  }

  async function init() {
    await load();
    bind();
    renderAll();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => { if ('Notification' in window && Notification.permission === 'granted') registerPeriodic(); }).catch(() => {});
    }
    const hash = location.hash;
    if (hash) { history.replaceState(null, '', location.pathname + location.search); handleHash(hash); }
    refresh(false);
    setTimeout(() => computeSky(false), 1200);
    setInterval(tick, 1000);
    setInterval(checkReminders, 30000);
    setInterval(() => refresh(false), 5 * MIN);
  }
  init();
})();
