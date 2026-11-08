// 資料來源：歌手搜尋（iTunes）、活動（Bandsintown / Ticketmaster）、範例資料
(function (g) {
  const COUNTRY = {
    'taiwan': 'TW', 'japan': 'JP', 'hong kong': 'HK', 'south korea': 'KR', 'korea': 'KR',
    'republic of korea': 'KR', 'singapore': 'SG', 'malaysia': 'MY', 'china': 'CN',
    'thailand': 'TH', 'philippines': 'PH', 'indonesia': 'ID', 'macau': 'MO', 'macao': 'MO',
    'united states': 'US', 'united kingdom': 'GB', 'australia': 'AU', 'canada': 'CA',
  };
  const ok = (s) => s && !/^19\d\d-/.test(s); // Ticketmaster 用 1900-01-01 表示未定

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function jsonp(url) {
    if (typeof document === 'undefined') return Promise.reject(new Error('JSONP 不可用'));
    return new Promise((res, rej) => {
      const cb = '__cb' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const done = () => { delete g[cb]; s.remove(); };
      g[cb] = (d) => { done(); res(d); };
      s.onerror = () => { done(); rej(new Error('JSONP 失敗')); };
      s.src = url + '&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  async function searchArtists(term) {
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term) +
      '&entity=musicArtist&country=TW&limit=15';
    let data;
    try { data = await getJSON(url); } catch (e) { data = await jsonp(url); }
    return (data.results || []).map((r) => ({
      id: 'itunes:' + r.artistId,
      name: r.artistName,
      genre: r.primaryGenreName || '',
    }));
  }

  async function bandsintown(name, appId) {
    const url = 'https://rest.bandsintown.com/artists/' + encodeURIComponent(name) +
      '/events?app_id=' + encodeURIComponent(appId) + '&date=upcoming';
    const data = await getJSON(url);
    if (!Array.isArray(data)) return [];
    return data.map((e) => {
      const v = e.venue || {};
      const tix = (e.offers || []).find((o) => /ticket/i.test(o.type || '')) || {};
      return {
        id: 'bit:' + e.id,
        source: 'Bandsintown',
        title: e.title || (name + ' @ ' + (v.name || v.city || '')),
        date: e.datetime || '',
        venue: v.name || '', city: v.city || '', country: v.country || '',
        countryCode: COUNTRY[(v.country || '').toLowerCase()] || '',
        url: tix.url || e.url || '',
        onSaleAt: ok(e.on_sale_datetime) ? e.on_sale_datetime : null,
        presales: [],
      };
    });
  }

  async function ticketmaster(name, key, country) {
    const p = new URLSearchParams({
      apikey: key, keyword: name, classificationName: 'music', sort: 'date,asc', size: '50',
    });
    if (country) p.set('countryCode', country);
    const data = await getJSON('https://app.ticketmaster.com/discovery/v2/events.json?' + p);
    const n = name.toLowerCase();
    return ((data._embedded && data._embedded.events) || [])
      .filter((e) => {
        const at = (e._embedded && e._embedded.attractions) || [];
        return at.some((a) => (a.name || '').toLowerCase().includes(n)) ||
          (e.name || '').toLowerCase().includes(n);
      })
      .map((e) => {
        const v = ((e._embedded && e._embedded.venues) || [])[0] || {};
        const st = (e.dates && e.dates.start) || {};
        const sales = e.sales || {};
        const pub = sales.public && sales.public.startDateTime;
        return {
          id: 'tm:' + e.id,
          source: 'Ticketmaster',
          title: e.name,
          date: st.localDate ? st.localDate + (st.localTime ? 'T' + st.localTime.slice(0, 5) : '') : (st.dateTime || ''),
          venue: v.name || '', city: (v.city || {}).name || '', country: (v.country || {}).name || '',
          countryCode: (v.country || {}).countryCode || '',
          url: e.url || '',
          onSaleAt: ok(pub) ? pub : null,
          presales: (sales.presales || []).filter((x) => ok(x.startDateTime))
            .map((x) => ({ name: x.name || '預售', startAt: x.startDateTime })),
        };
      });
  }

  // 範例資料：沒有 API key 時用來體驗功能（標題會標示「範例」）
  function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }
  function demo(artist) {
    const h = hash(artist.name);
    const venues = [['台北小巨蛋', '台北'], ['高雄巨蛋', '高雄'], ['台北流行音樂中心', '台北'], ['台中洲際棒球場', '台中'], ['Zepp New Taipei', '新北']];
    const day = 86400000, now = Date.now();
    const base = Math.floor(now / day) * day;
    return [0, 1].map((i) => {
      const [venue, city] = venues[(h + i) % venues.length];
      const date = new Date(base + (20 + ((h >> (i * 3)) % 60)) * day + 19.5 * 3600000);
      const sale = new Date(base + (2 + ((h >> (i * 5)) % 6)) * day + 12 * 3600000);
      const pad = (x) => String(x).padStart(2, '0');
      return {
        id: 'demo:' + h + ':' + i,
        source: '範例資料',
        title: artist.name + (i ? ' 加場（範例）' : ' 巡迴演唱會（範例）'),
        date: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T19:30',
        venue, city, country: 'Taiwan', countryCode: 'TW', url: '',
        onSaleAt: sale.toISOString(),
        presales: [{ name: '會員預售', startAt: new Date(sale.getTime() - 2 * day).toISOString() }],
      };
    });
  }

  const WEEK = '日一二三四五六';
  function fmtDate(str) {
    if (!str) return '日期未定';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str);
    const d = dateOnly ? new Date(str + 'T00:00') : new Date(str);
    if (isNaN(d)) return str;
    const pad = (x) => String(x).padStart(2, '0');
    const y = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' : '';
    let s = y + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '（' + WEEK[d.getDay()] + '）';
    if (!dateOnly) s += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return s;
  }

  g.Sources = { searchArtists, bandsintown, ticketmaster, demo, fmtDate };
})(self);
