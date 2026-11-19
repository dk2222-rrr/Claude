// 資料來源：Launch Library 2（發射、太空事件）、Spaceflight News API（新聞）、CelesTrak（太空站軌道）
// 都是免費、不需要 API key 的公開 API。頁面與 Service Worker 共用。
(function (g) {
  const S = g.Store;
  const LL = 'https://ll.thespacedevs.com/2.3.0';
  const SN = 'https://api.spaceflightnewsapi.net/v4';
  const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';
  const HOUR = 3600000;
  // Launch Library 2 免費版：每個 IP 每小時 15 次。保留一些餘裕給同網路的其他裝置。
  const LL_LIMIT = 12;

  async function getJSON(url, timeout) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeout || 25000) : null;
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : {});
      if (r.status === 429) { const e = new Error('請求太頻繁，稍後會自動重試'); e.code = 429; throw e; }
      if (!r.ok) throw new Error('伺服器回應 ' + r.status);
      return await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('連線逾時');
      if (e instanceof TypeError) throw new Error('無法連線（請確認網路）');
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  // ---------- Launch Library 2（有每小時次數限制） ----------
  async function llBudget() {
    const now = Date.now();
    const calls = (await S.get('llCalls', [])).filter((t) => t > now - HOUR);
    const backoff = await S.get('llBackoff', 0);
    return { calls, left: Math.max(0, LL_LIMIT - calls.length), blockedUntil: backoff > now ? backoff : 0 };
  }
  async function ll(path) {
    const b = await llBudget();
    if (b.blockedUntil) throw new Error('發射資料 API 暫時限流，' + Math.ceil((b.blockedUntil - Date.now()) / 60000) + ' 分鐘後再試');
    if (!b.left) throw new Error('這一小時的發射資料更新次數已用完（免費 API 每小時 15 次），稍後會自動更新');
    b.calls.push(Date.now());
    await S.set('llCalls', b.calls);
    try {
      return await getJSON(LL + path);
    } catch (e) {
      if (e.code === 429) await S.set('llBackoff', Date.now() + 20 * 60000);
      throw e;
    }
  }

  const img = (o) => (o && (o.thumbnail_url || o.image_url)) || '';
  function simplifyLaunch(x) {
    const m = x.mission || {}, p = x.pad || {}, loc = p.location || {}, r = (x.rocket || {}).configuration || {};
    const lsp = x.launch_service_provider || {}, st = x.status || {};
    const parts = String(x.name || '').split(' | ');
    return {
      id: x.id, name: x.name || '', slug: x.slug || '',
      mission: m.name || parts[1] || x.name || '', rocket: r.full_name || r.name || parts[0] || '',
      provider: lsp.name || '', providerAbbrev: lsp.abbrev || '', providerType: (lsp.type || {}).name || '',
      net: x.net, prec: (x.net_precision || {}).abbrev || '', ws: x.window_start, we: x.window_end,
      status: st.abbrev || '', statusName: st.name || '', statusDesc: st.description || '',
      desc: m.description || '', mtype: m.type || '', orbit: (m.orbit || {}).abbrev || '', orbitName: (m.orbit || {}).name || '',
      pad: p.name || '', location: loc.name || '', country: (p.country || {}).alpha_2_code || '', mapUrl: p.map_url || '',
      image: (x.image || {}).image_url || '', thumb: img(x.image),
      live: !!x.webcast_live, programs: (x.program || []).map((q) => q.name),
      probability: x.probability, weather: x.weather_concerns || '', failreason: x.failreason || '',
      updated: x.last_updated || '',
    };
  }
  function simplifyDetail(x) {
    const base = simplifyLaunch(x);
    const sortP = (a, b) => (b.priority || 0) - (a.priority || 0);
    return Object.assign(base, {
      vids: (x.vid_urls || []).slice().sort(sortP).map((v) => ({
        url: v.url, title: v.title || '', publisher: v.publisher || v.source || '', live: !!v.live,
        lang: (v.language || {}).code || '', kind: (v.type || {}).name || '',
      })),
      infos: (x.info_urls || []).slice().sort(sortP).map((v) => ({ url: v.url, title: v.title || v.source || '' })),
      updates: (x.updates || []).map((u) => ({ text: u.comment || '', at: u.created_on, by: u.created_by || '', url: u.info_url || '' })),
      timeline: (x.timeline || []).map((t) => ({ rel: t.relative_time || '', name: (t.type || {}).abbrev || '', desc: (t.type || {}).description || '' })),
      patch: ((x.mission_patches || [])[0] || {}).image_url || '',
      flightclub: x.flightclub_url || '',
    });
  }
  function simplifyEvent(x) {
    return {
      id: x.id, name: x.name || '', type: (x.type || {}).name || '', date: x.date, prec: (x.date_precision || {}).abbrev || '',
      desc: x.description || '', location: x.location || '', thumb: img(x.image), live: !!x.webcast_live,
      vid: ((x.vid_urls || [])[0] || {}).url || '', info: ((x.info_urls || [])[0] || {}).url || '',
      programs: (x.program || []).map((q) => q.name),
    };
  }

  async function upcoming() { return (await ll('/launches/upcoming/?limit=40&mode=normal')).results.map(simplifyLaunch); }
  async function previous() { return (await ll('/launches/previous/?limit=15&mode=normal')).results.map(simplifyLaunch); }
  async function events() { return (await ll('/events/upcoming/?limit=20')).results.map(simplifyEvent); }
  async function launchDetail(id) { return simplifyDetail(await ll('/launches/' + encodeURIComponent(id) + '/?mode=detailed')); }

  // ---------- Spaceflight News API ----------
  function simplifyArticle(a) {
    const summary = String(a.summary || '')
      .replace(/\s*The post .*? appeared first on .*?\.?\s*$/s, '')
      .replace(/\[(…|\.\.\.)\]/g, '…').trim();
    return {
      id: a.id, title: a.title || '', url: a.url, image: a.image_url || '', site: a.news_site || '', summary,
      published: Date.parse(a.published_at) || Date.now(), featured: !!a.featured,
      launches: (a.launches || []).map((l) => l.launch_id), events: (a.events || []).map((e) => e.event_id),
    };
  }
  async function news({ search, launch, offset, limit, titleAny, summaryAny } = {}) {
    const q = new URLSearchParams({ limit: String(limit || 30) });
    if (offset) q.set('offset', String(offset));
    if (search) q.set('search', search);
    if (launch) q.set('launch', launch);
    if (titleAny && titleAny.length) q.set('title_contains_one', titleAny.join(','));
    if (summaryAny && summaryAny.length) q.set('summary_contains_one', summaryAny.join(','));
    const d = await getJSON(SN + '/articles/?' + q);
    return { count: d.count, list: d.results.map(simplifyArticle) };
  }

  // ---------- CelesTrak：國際太空站與天宮太空站的軌道資料（TLE） ----------
  const STATIONS = [
    { key: 'iss', name: '國際太空站', match: /^ISS \(ZARYA\)/ },
    { key: 'css', name: '天宮太空站', match: /^CSS \(TIANHE\)/ },
  ];
  async function stationTLEs() {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
    let text;
    try {
      const r = await fetch(TLE_URL, ctl ? { signal: ctl.signal } : {});
      if (!r.ok) throw new Error('軌道資料伺服器回應 ' + r.status);
      text = await r.text();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('軌道資料連線逾時');
      throw e;
    } finally { if (timer) clearTimeout(timer); }
    const lines = text.split(/\r?\n/).map((s) => s.trimEnd());
    const out = [];
    for (const st of STATIONS) {
      const i = lines.findIndex((l) => st.match.test(l.trim()));
      if (i >= 0 && /^1 /.test(lines[i + 1] || '') && /^2 /.test(lines[i + 2] || '')) {
        out.push({ key: st.key, name: st.name, l1: lines[i + 1].trim(), l2: lines[i + 2].trim() });
      }
    }
    if (!out.length) throw new Error('軌道資料格式不正確');
    return out;
  }

  g.Api = { upcoming, previous, events, launchDetail, news, stationTLEs, llBudget, LL_LIMIT };
})(self);
