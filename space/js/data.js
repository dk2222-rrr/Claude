// 中文對照表、追蹤主題預設、時間格式，頁面與 Service Worker 共用
(function (g) {
  const STATUS = {
    Go: ['確定發射', 'go'], TBC: ['待確認', 'tbc'], TBD: ['時間未定', 'tbd'], Hold: ['暫停倒數', 'hold'],
    'In Flight': ['飛行中', 'live'], Success: ['發射成功', 'ok'], Failure: ['發射失敗', 'fail'], 'Partial Failure': ['部分失敗', 'fail'],
  };
  const MISSION_TYPE = {
    Communications: '通訊', 'Earth Science': '地球觀測', 'Government/Top Secret': '政府／機密', Technology: '技術驗證',
    'Test Flight': '試飛', Resupply: '補給', 'Human Exploration': '載人', 'Planetary Science': '行星探測',
    Astrophysics: '天文物理', Navigation: '導航', 'Robotic Exploration': '無人探測', Tourism: '太空旅遊',
    'Dedicated Rideshare': '共乘發射', Heliophysics: '太陽物理', 'Space Science': '太空科學', Meteorology: '氣象',
    Unknown: '用途未公開', 'Lunar Exploration': '探月', 'Suborbital': '次軌道',
  };
  const ORBIT = {
    LEO: '低地球軌道', SSO: '太陽同步軌道', GTO: '地球同步轉移軌道', GEO: '地球靜止軌道', MEO: '中地球軌道',
    PO: '極軌道', Sub: '次軌道', SO: '次軌道', TLI: '奔月軌道', LO: '月球軌道', HEO: '高橢圓軌道', 'Helio-N/A': '日心軌道',
    'L1': '日地 L1 點', 'L2': '日地 L2 點', ES: '地月 L2 點', VLEO: '極低地球軌道', 'GSO': '地球同步軌道', 'Elliptical': '橢圓軌道',
    MTO: '火星轉移軌道', 'N/A': '',
  };
  const COUNTRY = {
    US: '美國', CN: '中國', RU: '俄羅斯', KZ: '哈薩克', NZ: '紐西蘭', IN: '印度', JP: '日本', GF: '法屬圭亞那',
    FR: '法國', KR: '南韓', KP: '北韓', NO: '挪威', SE: '瑞典', GB: '英國', AU: '澳洲', IR: '伊朗', IL: '以色列',
    DE: '德國', TW: '台灣', BR: '巴西', IT: '義大利', ES: '西班牙', CA: '加拿大', MH: '馬紹爾群島', PT: '葡萄牙',
  };
  const EVENT_TYPE = {
    Docking: '對接', Undocking: '分離', 'Spacecraft Undocking': '分離', Berthing: '停泊', 'Spacecraft Berthing': '停泊',
    'Spacecraft Release': '釋放', 'EVA': '太空漫步', 'Spacewalk': '太空漫步', 'Space Walk': '太空漫步', Flyby: '飛掠',
    Landing: '著陸', 'Spacecraft Landing': '返回著陸', 'Moon Landing': '登月', 'Lunar Landing': '登月', 'Orbital Insertion': '進入軌道',
    'Static Fire': '靜態點火', 'Press Conference': '記者會', 'Splashdown': '濺落', 'Spacecraft Splashdown': '濺落',
    'Wet Dress Rehearsal': '加注演練', 'Rollout': '轉運到發射台', 'Celestial Event': '天文現象', 'Test Flight': '試飛',
    'Hop Test': '跳躍測試', 'Spacecraft Capture': '捕捉', 'Abort Test': '逃逸測試', 'Relocation': '換位', 'Spacecraft Relocation': '換位',
    'Decommission': '退役', 'Reentry': '重返大氣層', 'Engine Test': '引擎測試', 'Unknown': '活動', 'Other': '活動',
  };

  // 追蹤主題：英文關鍵字（含大寫字母的關鍵字要大小寫一致；全小寫則不分大小寫）
  const TOPICS = [
    { id: 'starship', icon: '🚀', name: 'SpaceX 星艦', keywords: ['Starship', 'Super Heavy'] },
    { id: 'artemis', icon: '🌙', name: '阿提米絲登月計畫', keywords: ['Artemis', 'Space Launch System', 'SLS', 'Lunar Gateway'] },
    { id: 'taiwan', icon: '🇹🇼', name: '台灣太空', keywords: ['Taiwan', 'Taiwanese', 'TASA', 'FORMOSAT', 'Formosat', 'FormoSat'] },
    { id: 'iss', icon: '🛰️', name: '國際太空站', keywords: ['International Space Station', 'ISS', 'Crew Dragon', 'Cygnus', 'Dream Chaser', 'Starliner', 'Progress MS', 'Soyuz MS'] },
    { id: 'china-crewed', icon: '🇨🇳', name: '中國太空站（天宮、神舟）', keywords: ['Tiangong', 'Shenzhou', 'Tianzhou', 'Mengzhou', 'Lanyue'] },
    { id: 'change', icon: '🌕', name: '嫦娥探月', keywords: ["Chang'e"] },
    { id: 'mars', icon: '🔴', name: '火星探測', keywords: ['Mars', 'Martian'] },
    { id: 'blue-origin', icon: '🔵', name: '藍色起源', keywords: ['Blue Origin', 'New Glenn', 'New Shepard', 'Blue Moon'] },
    { id: 'rocket-lab', icon: '⚡', name: 'Rocket Lab', keywords: ['Rocket Lab', 'Neutron'] },
    { id: 'japan', icon: '🇯🇵', name: '日本 JAXA', keywords: ['JAXA', 'H3', 'HTV-X', 'ispace'] },
    { id: 'india', icon: '🇮🇳', name: '印度 ISRO', keywords: ['ISRO', 'Gaganyaan', 'Chandrayaan', 'PSLV', 'GSLV', 'LVM3', 'LVM-3'] },
    { id: 'esa', icon: '🇪🇺', name: '歐洲太空總署', keywords: ['ESA', 'Ariane', 'Vega-C', 'European Space Agency'] },
    { id: 'moon', icon: '🌖', name: '民間登月任務', keywords: ['Intuitive Machines', 'Blue Ghost', 'Firefly', 'ispace', 'lunar lander', 'Griffin'] },
    { id: 'jwst', icon: '🔭', name: '太空望遠鏡', keywords: ['James Webb', 'JWST', 'Hubble', 'Nancy Grace Roman', 'Roman Space Telescope', 'Xuntian', 'Euclid'] },
    { id: 'stations', icon: '🏗️', name: '商業太空站', keywords: ['Axiom', 'Haven-1', 'Starlab', 'Orbital Reef', 'Vast Space'] },
    { id: 'asteroid', icon: '☄️', name: '小行星與行星防禦', keywords: ['asteroid', 'Apophis', 'planetary defense', 'NEO Surveyor'] },
    { id: 'starlink', icon: '📡', name: 'Starlink 星鏈', keywords: ['Starlink'] },
  ];
  const DEFAULT_TOPICS = ['starship', 'artemis', 'taiwan'];

  // ---------- 關鍵字比對 ----------
  const reCache = new Map();
  function kwRegex(kw) {
    if (reCache.has(kw)) return reCache.get(kw);
    const k = kw.replace(/[’‘]/g, "'").trim();
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ascii = /^[\x00-\x7F]+$/.test(k);
    const flags = k === k.toLowerCase() ? 'i' : '';
    const re = ascii ? new RegExp('(^|[^A-Za-z0-9])' + esc + '(?![A-Za-z0-9])', flags) : new RegExp(esc, flags);
    reCache.set(kw, re);
    return re;
  }
  function matchTopics(text, topics) {
    const t = String(text || '').replace(/[’‘]/g, "'");
    return topics.filter((tp) => (tp.keywords || []).some((k) => k && kwRegex(k).test(t)));
  }
  const launchText = (l) => [l.name, l.mission, l.rocket, l.provider, (l.programs || []).join(' '), l.desc].join(' \n ');
  const newsText = (a) => a.title + ' \n ' + a.summary;
  const eventText = (e) => [e.name, e.desc, (e.programs || []).join(' ')].join(' \n ');

  // ---------- 時間 ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const PRECISE = ['SEC', 'MIN', 'HR'];
  const isPrecise = (prec) => PRECISE.includes(prec);
  function fmtTime(t) { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtDay(t) { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'; }
  function fmtFull(t) {
    const d = new Date(t);
    const y = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' : '';
    return y + fmtDay(t) + ' ' + fmtTime(t);
  }
  // 依照 LL2 的時間精確度顯示
  function fmtNet(iso, prec) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '時間未定';
    const d = new Date(t);
    const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1;
    switch (prec) {
      case 'SEC': case 'MIN': case '': case undefined: return fmtFull(t);
      case 'HR': return fmtDay(t) + ' 約 ' + pad2(d.getHours()) + ' 時';
      case 'AM': case 'PM': case 'DAY': return fmtDay(t) + '（時間未定）';
      case 'W': return fmtDay(t) + ' 那一週';
      case 'M': return Y + ' 年 ' + M + ' 月';
      case 'Q1': case 'Q2': case 'Q3': case 'Q4': return Y + ' 年第 ' + prec[1] + ' 季';
      case 'H1': return Y + ' 年上半年';
      case 'H2': return Y + ' 年下半年';
      case 'Y': case 'FY': return Y + ' 年';
      default: return fmtFull(t);
    }
  }
  function countdown(ms) {
    const neg = ms < 0; ms = Math.abs(ms);
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    const core = (d ? d + ' 天 ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
    return (neg ? 'T+ ' : 'T- ') + core;
  }
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '剛剛';
    if (m < 60) return m + ' 分鐘前';
    if (m < 1440) return Math.round(m / 60) + ' 小時前';
    if (m < 1440 * 7) return Math.round(m / 1440) + ' 天前';
    return fmtDay(t);
  }
  function inWords(ms) {
    const m = Math.round(ms / 60000);
    if (m <= 0) return '現在';
    if (m < 60) return m + ' 分鐘後';
    if (m < 1440) return Math.round(m / 60) + ' 小時後';
    return Math.round(m / 1440) + ' 天後';
  }
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)) : '');

  g.Zh = {
    STATUS, MISSION_TYPE, ORBIT, COUNTRY, EVENT_TYPE, TOPICS, DEFAULT_TOPICS,
    matchTopics, launchText, newsText, eventText, kwRegex,
    isPrecise, fmtTime, fmtDay, fmtFull, fmtNet, countdown, ago, inWords, flag,
    status: (abbrev) => STATUS[abbrev] || [abbrev || '未知', 'tbd'],
    mtype: (t) => MISSION_TYPE[t] || t || '',
    country: (cc) => COUNTRY[cc] || cc || '',
    eventType: (t) => EVENT_TYPE[t] || t || '活動',
  };
})(self);
