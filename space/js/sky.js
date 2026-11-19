// 天象計算：月相、日月食、流星雨、行星、太空站過境（全部在本機計算，不需網路，除了太空站軌道資料）
// 依賴 vendor/astronomy.min.js（Astronomy）與 vendor/satellite.min.js（satellite）
(function (g) {
  const A = g.Astronomy, sat = g.satellite;
  const DAY = 86400000, MIN = 60000;
  const RAD = Math.PI / 180;

  const obs = (loc) => new A.Observer(loc.lat, loc.lon, loc.height || 0);
  const ms = (t) => (t && t.date ? t.date.getTime() : t instanceof Date ? t.getTime() : t);
  const dirName = (az) => ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.round((((az % 360) + 360) % 360) / 45) % 8];

  // ---------- 月相 ----------
  function phaseName(deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d < 10 || d >= 350) return ['新月', '🌑'];
    if (d < 80) return ['眉月', '🌒'];
    if (d < 100) return ['上弦月', '🌓'];
    if (d < 170) return ['盈凸月', '🌔'];
    if (d < 190) return ['滿月', '🌕'];
    if (d < 260) return ['虧凸月', '🌖'];
    if (d < 280) return ['下弦月', '🌗'];
    return ['殘月', '🌘'];
  }
  function moonIllum(date) { return A.Illumination(A.Body.Moon, date).phase_fraction; }
  function moonInfo(date) {
    date = date || new Date();
    const deg = A.MoonPhase(date);
    const [name, icon] = phaseName(deg);
    const full = A.SearchMoonPhase(180, date, 40), nw = A.SearchMoonPhase(0, date, 40);
    return { name, icon, illum: moonIllum(date), age: deg / 360 * 29.53, nextFull: ms(full), nextNew: ms(nw) };
  }

  // ---------- 流星雨（尖峰用太陽黃經推算，IMO 資料） ----------
  const SHOWERS = [
    { key: 'QUA', name: '象限儀座流星雨', lon: 283.15, zhr: 110, note: '北半球三大流星雨之一，尖峰時間短' },
    { key: 'LYR', name: '天琴座流星雨', lon: 32.32, zhr: 18, note: '偶爾有亮火流星' },
    { key: 'ETA', name: '寶瓶座η流星雨', lon: 45.5, zhr: 50, note: '哈雷彗星的碎屑，清晨東方較佳' },
    { key: 'PER', name: '英仙座流星雨', lon: 140.0, zhr: 100, note: '北半球三大流星雨之一，夏夜最熱門' },
    { key: 'ORI', name: '獵戶座流星雨', lon: 208, zhr: 20, note: '哈雷彗星的碎屑，後半夜較佳' },
    { key: 'LEO', name: '獅子座流星雨', lon: 235.27, zhr: 15, note: '流星速度很快' },
    { key: 'GEM', name: '雙子座流星雨', lon: 262.2, zhr: 150, note: '北半球三大流星雨之一，數量最多' },
    { key: 'URS', name: '小熊座流星雨', lon: 270.7, zhr: 10, note: '冬至前後，數量較少' },
  ];
  function meteorShowers(from, to) {
    const out = [];
    for (const s of SHOWERS) {
      let start = new Date(from - 2 * DAY);
      for (let i = 0; i < 3; i++) {
        const yrs = (start.getUTCFullYear() - 2000);
        const lonOfDate = (s.lon + 0.013969 * yrs) % 360; // J2000 → 當日分點（歲差修正）
        const t = A.SearchSunLongitude(lonOfDate, start, 370);
        if (!t) break;
        const at = ms(t);
        if (at > to) break;
        if (at >= from - DAY) {
          const illum = moonIllum(t.date);
          const moonNote = illum < 0.25 ? '月光影響小，觀測條件好' : illum < 0.6 ? '有些月光干擾' : '月光明亮，只看得到較亮的流星';
          out.push({
            id: 'meteor:' + s.key + ':' + new Date(at).getUTCFullYear(), type: 'meteor', at, icon: '☄️',
            title: s.name + '極大期', visible: true, major: s.zhr >= 50,
            detail: '理想狀況每小時約 ' + s.zhr + ' 顆（實際通常少很多）。' + s.note + '。月亮 ' + Math.round(illum * 100) + '% 亮，' + moonNote + '。',
          });
        }
        start = new Date(at + 300 * DAY);
      }
    }
    return out;
  }

  // ---------- 月食 ----------
  const LUNAR = { penumbral: '半影月食', partial: '月偏食', total: '月全食' };
  function lunarEclipses(loc, from, to) {
    const o = obs(loc), out = [];
    let e = A.SearchLunarEclipse(new Date(from - DAY));
    while (e && ms(e.peak) <= to) {
      const peak = ms(e.peak);
      const alt = (t) => { const eq = A.Equator(A.Body.Moon, new Date(t), o, true, true); return A.Horizon(new Date(t), o, eq.ra, eq.dec, 'normal').altitude; };
      const span = (e.sd_partial || e.sd_penum) * MIN;
      const alts = [alt(peak - span), alt(peak), alt(peak + span)];
      const up = alts.filter((a) => a > 0).length;
      const vis = up === 3 ? '全程可見' : alts[1] > 0 ? '大部分可見' : up ? '部分過程可見（月出或月落時）' : '你的位置看不到';
      const fmt = (t) => new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      const phases = [];
      if (e.sd_partial) phases.push('偏食開始 ' + fmt(peak - e.sd_partial * MIN));
      if (e.sd_total) phases.push('全食 ' + fmt(peak - e.sd_total * MIN) + '–' + fmt(peak + e.sd_total * MIN));
      phases.push('食甚 ' + fmt(peak));
      if (e.sd_partial) phases.push('偏食結束 ' + fmt(peak + e.sd_partial * MIN));
      if (peak >= from - DAY) {
        out.push({
          id: 'lunar:' + new Date(peak).toISOString().slice(0, 10), type: 'lunar', at: peak, icon: '🌘',
          title: LUNAR[e.kind] || '月食', visible: up > 0, major: up > 0 && e.kind !== 'penumbral',
          detail: vis + '。' + phases.join('，') + '。' + (e.kind === 'penumbral' ? '半影月食變化很不明顯，肉眼不容易察覺。' : ''),
        });
      }
      e = A.NextLunarEclipse(e.peak);
    }
    return out;
  }

  // ---------- 日食 ----------
  const SOLAR = { partial: '日偏食', annular: '日環食', total: '日全食', hybrid: '全環食' };
  // 中心食帶經過的地區（只列確定的；其他顯示座標）
  const SOLAR_REGION = {
    '2027-02-06': '南美洲（智利、阿根廷）、大西洋、西非',
    '2027-08-02': '西班牙南部、北非（摩洛哥、埃及）、阿拉伯半島',
    '2028-01-26': '南美洲北部、大西洋、葡萄牙、西班牙',
    '2028-07-22': '澳洲（包含雪梨）、紐西蘭',
  };
  function latlon(lat, lon) {
    return (lat >= 0 ? '北緯 ' : '南緯 ') + Math.abs(lat).toFixed(0) + '°、' + (lon >= 0 ? '東經 ' : '西經 ') + Math.abs(lon).toFixed(0) + '°';
  }
  function solarEclipses(loc, from, to) {
    const o = obs(loc), out = [];
    // 你的位置看得到的日食
    const local = new Map();
    let le = A.SearchLocalSolarEclipse(new Date(from - DAY), o);
    while (le && ms(le.peak.time) <= to) {
      const pts = [le.partial_begin, le.peak, le.partial_end].filter(Boolean);
      if (pts.some((p) => p.altitude > 0)) local.set(new Date(ms(le.peak.time)).toISOString().slice(0, 10), le);
      le = A.NextLocalSolarEclipse(le.peak.time, o);
    }
    let ge = A.SearchGlobalSolarEclipse(new Date(from - DAY));
    while (ge && ms(ge.peak) <= to) {
      const peak = ms(ge.peak);
      const day = new Date(peak).toISOString().slice(0, 10);
      const l = local.get(day) || local.get(new Date(peak - DAY).toISOString().slice(0, 10)) || local.get(new Date(peak + DAY).toISOString().slice(0, 10));
      let detail;
      if (ge.kind === 'partial') detail = '只有部分地區看得到日偏食。';
      else detail = (SOLAR[ge.kind] || '日食') + '帶經過：' + (SOLAR_REGION[day] || latlon(ge.latitude, ge.longitude) + ' 附近') + '。';
      let at = peak;
      if (l) {
        const fmt = (t) => new Date(ms(t)).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        at = ms(l.peak.time);
        detail += '你的位置看得到' + (SOLAR[l.kind] || '日偏食') + '：開始 ' + fmt(l.partial_begin.time) + '，食甚 ' + fmt(l.peak.time) +
          '（太陽被遮 ' + Math.round(l.obscuration * 100) + '%），結束 ' + fmt(l.partial_end.time) + '。⚠️ 一定要用合格的日食眼鏡或減光片，不可直接看太陽。';
      } else {
        detail += '你的位置看不到。';
      }
      if (peak >= from - DAY) {
        out.push({
          id: 'solar:' + day, type: 'solar', at, icon: '🌞', title: SOLAR[ge.kind] || '日食',
          visible: !!l, major: !!l || ge.kind !== 'partial', detail,
        });
      }
      ge = A.NextGlobalSolarEclipse(ge.peak);
    }
    return out;
  }

  // ---------- 超級月亮 ----------
  function supermoons(from, to) {
    const out = [];
    let t = A.SearchMoonPhase(180, new Date(from - DAY), 40);
    while (t && ms(t) <= to) {
      const dist = A.GeoMoon(t).Length() * A.KM_PER_AU;
      if (dist < 362000 && ms(t) >= from - DAY) {
        out.push({
          id: 'supermoon:' + t.date.toISOString().slice(0, 10), type: 'moon', at: ms(t), icon: '🌕', title: '超級月亮',
          visible: true, major: false, detail: '滿月時月球距離地球約 ' + Math.round(dist).toLocaleString('zh-TW') + ' 公里，看起來比平常大一點、亮一點。',
        });
      }
      t = A.SearchMoonPhase(180, new Date(ms(t) + 20 * DAY), 40);
    }
    return out;
  }

  // ---------- 行星：衝日、大距 ----------
  const PLANET_ZH = { Mercury: '水星', Venus: '金星', Mars: '火星', Jupiter: '木星', Saturn: '土星' };
  function planetEvents(from, to) {
    const out = [];
    for (const b of ['Mars', 'Jupiter', 'Saturn']) {
      let t = A.SearchRelativeLongitude(A.Body[b], 0, new Date(from - DAY));
      while (t && ms(t) <= to) {
        if (ms(t) >= from - DAY) {
          out.push({
            id: 'opp:' + b + ':' + t.date.toISOString().slice(0, 10), type: 'planet', at: ms(t), icon: '🪐',
            title: PLANET_ZH[b] + '衝日', visible: true, major: true,
            detail: PLANET_ZH[b] + '整夜可見、最亮也最接近地球，是一年中觀測' + PLANET_ZH[b] + '最好的時候。',
          });
        }
        t = A.SearchRelativeLongitude(A.Body[b], 0, new Date(ms(t) + 30 * DAY));
      }
    }
    for (const b of ['Venus', 'Mercury']) {
      let start = new Date(from - DAY);
      for (let i = 0; i < 8; i++) {
        const e = A.SearchMaxElongation(A.Body[b], start);
        if (!e || ms(e.time) > to) break;
        if (ms(e.time) >= from - DAY) {
          const evening = e.visibility === 'evening';
          out.push({
            id: 'elong:' + b + ':' + e.time.date.toISOString().slice(0, 10), type: 'planet', at: ms(e.time), icon: '✨',
            title: PLANET_ZH[b] + (evening ? '東大距' : '西大距'), visible: true, major: b === 'Venus',
            detail: PLANET_ZH[b] + '離太陽最遠（' + e.elongation.toFixed(0) + '°），' + (evening ? '日落後在西方天空' : '日出前在東方天空') + '最容易看到。',
          });
        }
        start = new Date(ms(e.time) + 10 * DAY);
      }
    }
    return out;
  }

  // 所有天象（依時間排序）
  function events(loc, from, days) {
    from = from || Date.now();
    const to = from + (days || 400) * DAY;
    const all = [];
    const tryAdd = (fn) => { try { all.push(...fn()); } catch (e) { console.warn('天象計算失敗', e); } };
    tryAdd(() => meteorShowers(from, to));
    tryAdd(() => lunarEclipses(loc, from, to));
    tryAdd(() => solarEclipses(loc, from, to));
    tryAdd(() => supermoons(from, to));
    tryAdd(() => planetEvents(from, to));
    return all.filter((e) => e.at >= from - DAY).sort((a, b) => a.at - b.at);
  }

  // ---------- 今晚的行星：天黑後到天亮前，什麼時候、在哪個方向看得到 ----------
  function altAz(body, o, d) {
    const eq = A.Equator(body, d, o, true, true);
    return A.Horizon(d, o, eq.ra, eq.dec, 'normal');
  }
  function planetsTonight(loc, date) {
    const o = obs(loc);
    date = date || new Date();
    // 從 14 小時前往後找日落：白天找到今晚，半夜找到「這一夜」
    const set = A.SearchRiseSet(A.Body.Sun, o, -1, new Date(date.getTime() - 14 * 3600000), 2);
    const rise = set && A.SearchRiseSet(A.Body.Sun, o, +1, set, 2);
    if (!set || !rise) return { night: null, list: [] };
    const S0 = ms(set), R0 = ms(rise), STEP = 10 * MIN;
    const dark = [];
    for (let t = S0; t <= R0; t += STEP) {
      if (altAz(A.Body.Sun, o, new Date(t)).altitude < -8) dark.push(t);
    }
    const list = [];
    for (const b of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
      const body = A.Body[b];
      const vis = [];
      for (const t of dark) {
        const h = altAz(body, o, new Date(t));
        if (h.altitude > 8) vis.push({ t, alt: h.altitude, az: h.azimuth });
      }
      const mag = A.Illumination(body, date).mag;
      if (!vis.length) { list.push({ key: b, name: PLANET_ZH[b], mag, visible: false }); continue; }
      const first = vis[0], last = vis[vis.length - 1], top = vis.reduce((a, c) => (c.alt > a.alt ? c : a));
      const fromDusk = first.t === dark[0], toDawn = last.t === dark[dark.length - 1];
      let text;
      if (fromDusk && toDawn) text = '整夜可見，最高時在' + dirName(top.az) + '方天空';
      else if (fromDusk) text = '天黑後在' + dirName(first.az) + '方天空，約 ' + hm(last.t) + ' 落下';
      else if (toDawn) text = '約 ' + hm(first.t) + ' 從' + dirName(first.az) + '方升起，天亮前在' + dirName(last.az) + '方天空';
      else text = hm(first.t) + '–' + hm(last.t) + ' 在' + dirName(top.az) + '方天空';
      list.push({ key: b, name: PLANET_ZH[b], mag, visible: true, from: first.t, to: last.t, text });
    }
    return { night: { set: S0, rise: R0, darkFrom: dark[0], darkTo: dark[dark.length - 1] }, list };
  }
  const hm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  // ---------- 太空站過境 ----------
  function sunDir(date) {
    const v = A.GeoVector(A.Body.Sun, date, false);
    const n = Math.hypot(v.x, v.y, v.z);
    return [v.x / n, v.y / n, v.z / n];
  }
  function sunAlt(o, date) {
    const eq = A.Equator(A.Body.Sun, date, o, true, true);
    return A.Horizon(date, o, eq.ra, eq.dec, 'normal').altitude;
  }
  function sunlit(pos, date) {
    const u = sunDir(date);
    const p = pos.x * u[0] + pos.y * u[1] + pos.z * u[2];
    if (p > 0) return true;
    const px = pos.x - p * u[0], py = pos.y - p * u[1], pz = pos.z - p * u[2];
    return Math.hypot(px, py, pz) > 6378.137;
  }

  // 用 TLE 預測可以用肉眼看到的過境：太空站被太陽照亮、觀測者在天黑後、仰角 > 10°
  function passes(tle, loc, from, hours, minEl) {
    if (!sat || !tle) return [];
    minEl = minEl == null ? 10 : minEl;
    const satrec = sat.twoline2satrec(tle.l1, tle.l2);
    const gd = { longitude: loc.lon * RAD, latitude: loc.lat * RAD, height: (loc.height || 0) / 1000 };
    const o = obs(loc);
    const look = (t) => {
      const d = new Date(t);
      const pv = sat.propagate(satrec, d);
      if (!pv || !pv.position) return null;
      const ecf = sat.eciToEcf(pv.position, sat.gstime(d));
      const la = sat.ecfToLookAngles(gd, ecf);
      return { t, el: la.elevation / RAD, az: la.azimuth / RAD, range: la.rangeSat, pos: pv.position };
    };
    const STEP = 20000;
    const end = from + (hours || 120) * 3600000;
    const out = [];
    let cur = null;
    // 取樣時間對齊整點格線，重新計算時同一次過境的編號才會一樣
    for (let t = Math.ceil(from / STEP) * STEP; t <= end; t += STEP) {
      const s = look(t);
      if (!s) continue;
      if (s.el > minEl) {
        const dark = sunAlt(o, new Date(t)) < -6;
        const lit = sunlit(s.pos, new Date(t));
        s.vis = dark && lit;
        if (!cur) cur = { samples: [] };
        cur.samples.push(s);
      } else if (cur) {
        out.push(cur); cur = null;
      }
    }
    if (cur) out.push(cur);
    const res = [];
    for (const p of out) {
      const vis = p.samples.filter((s) => s.vis);
      if (vis.length < 3) continue; // 看得到不到一分鐘的就不列
      const first = vis[0], last = vis[vis.length - 1];
      const top = vis.reduce((a, b) => (b.el > a.el ? b : a));
      const all = p.samples;
      res.push({
        id: tle.key + ':' + Math.round(top.t / 600000),
        sat: tle.key, satName: tle.name,
        start: first.t, end: last.t, maxAt: top.t, maxEl: top.el,
        startDir: dirName(first.az), endDir: dirName(last.az), maxDir: dirName(top.az),
        startEl: first.el, endEl: last.el,
        // 太空站在過境中途進入地球陰影（突然消失）
        fadesOut: last !== all[all.length - 1],
        duration: Math.max(1, Math.round((last.t - first.t) / 60000)),
        bright: top.el >= 60 ? '非常亮' : top.el >= 35 ? '明亮' : '偏低，較暗',
      });
    }
    return res;
  }

  function parseTLE(text, key, name) {
    const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const i = lines.findIndex((l) => l.startsWith('1 '));
    if (i < 0 || !lines[i + 1] || !lines[i + 1].startsWith('2 ')) return null;
    return { key, name, l1: lines[i], l2: lines[i + 1] };
  }

  g.Sky = { moonInfo, events, planetsTonight, passes, parseTLE, phaseName, dirName, SHOWERS };
})(typeof self !== 'undefined' ? self : globalThis);
