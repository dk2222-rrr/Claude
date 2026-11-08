// 商店：用好感度換籠子、玩具、小屋和風格。越酷炫的越貴。
import { CAGE_ORDER, toySpotsFor, TOYS, DEFAULT_STYLES } from './layout.js';

export const RARITY = {
  common: { label: '普通', color: '#8f9aa6', bg: 'linear-gradient(135deg,#f4f6f8,#e6eaee)' },
  rare: { label: '稀有', color: '#3d8fe0', bg: 'linear-gradient(135deg,#e8f3ff,#cfe5ff)' },
  epic: { label: '史詩', color: '#9b55e0', bg: 'linear-gradient(135deg,#f3e8ff,#e0c9ff)' },
  legendary: { label: '傳說', color: '#e6951a', bg: 'linear-gradient(135deg,#fff6d8,#ffd9a0 60%,#ffc2d6)' },
};

export const CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'cage', label: '🏠 籠子' },
  { id: 'toy', label: '🧸 玩具' },
  { id: 'home', label: '🛏️ 小屋和窩' },
  { id: 'style', label: '🎨 風格' },
];

// kind：cage 換籠子、item 放進籠子的東西、style 換外觀（買了可以隨時切換）
// needs：{ cage } 要先換到這個籠子、{ item } 要先有這個東西、{ spot } 要有空位（S 小、L 大）
export const SHOP = [
  // 籠子與擴充
  { id: 'medium', cat: 'cage', kind: 'cage', emoji: '🏡', label: '中籠子', cost: 300, rarity: 'rare', desc: '更大的空間，可以放隧道和小木屋' },
  { id: 'annex1', cat: 'cage', kind: 'item', emoji: '🚇', label: '擴充隧道＋遊戲籠', cost: 500, rarity: 'epic', desc: '旁邊多一個遊戲籠，用透明隧道連通，可以放更多玩具' },
  { id: 'big', cat: 'cage', kind: 'cage', emoji: '🏰', label: '雙層大籠子', cost: 700, rarity: 'epic', desc: '有二樓和木梯，倉鼠會爬上爬下' },
  { id: 'annex2', cat: 'cage', kind: 'item', emoji: '🎠', label: '第二個遊戲籠', cost: 1000, rarity: 'legendary', needs: { item: 'annex1' }, desc: '再接一個遊戲籠，三個籠子連成一串' },
  // 玩具
  { id: 'chew', cat: 'toy', kind: 'item', emoji: '🪵', label: '啃咬木', cost: 30, rarity: 'common', needs: { spot: 'S' }, desc: '抱著木頭喀滋喀滋磨牙' },
  { id: 'sand', cat: 'toy', kind: 'item', emoji: '🛁', label: '沙浴盆', cost: 40, rarity: 'common', desc: '跳進去打滾洗澡' },
  { id: 'wheel', cat: 'toy', kind: 'item', emoji: '🎡', label: '滾輪', cost: 60, rarity: 'common', desc: '跑跑步，心情會變好' },
  { id: 'steps', cat: 'toy', kind: 'item', emoji: '🪜', label: '木頭跳台', cost: 120, rarity: 'rare', needs: { spot: 'S' }, desc: '跳上去坐在高處看風景' },
  { id: 'log', cat: 'toy', kind: 'item', emoji: '🌲', label: '木頭隧道', cost: 150, rarity: 'rare', needs: { cage: 'medium' }, desc: '鑽進去躲起來、從另一頭探頭' },
  { id: 'swing', cat: 'toy', kind: 'item', emoji: '🎪', label: '鞦韆', cost: 350, rarity: 'epic', needs: { spot: 'L' }, desc: '坐在鞦韆上盪來盪去' },
  { id: 'slide', cat: 'toy', kind: 'item', emoji: '🛝', label: '溜滑梯', cost: 450, rarity: 'epic', needs: { spot: 'L' }, desc: '爬上梯子咻～地溜下來，會玩好幾次' },
  { id: 'ball', cat: 'toy', kind: 'item', emoji: '🔮', label: '跑跑球', cost: 800, rarity: 'legendary', needs: { spot: 'S' }, desc: '鑽進透明球裡在籠子裡滾來滾去' },
  // 小屋和窩
  { id: 'bignest', cat: 'home', kind: 'item', emoji: '☁️', label: '大棉花窩', cost: 120, rarity: 'rare', desc: '睡覺時可以整隻鑽進去' },
  { id: 'house', cat: 'home', kind: 'item', emoji: '🛖', label: '小木屋', cost: 160, rarity: 'rare', needs: { cage: 'medium' }, desc: '喜歡躲在裡面休息、睡覺' },
  { id: 'nest-cotton', cat: 'home', kind: 'style', slot: 'nest', value: 'cotton', base: true, emoji: '🤍', label: '棉花窩', cost: 0, rarity: 'common', desc: '白白軟軟的原味棉花' },
  { id: 'nest-cloud', cat: 'home', kind: 'style', slot: 'nest', value: 'cloud', emoji: '🌥️', label: '雲朵窩', cost: 180, rarity: 'rare', desc: '淡藍色的雲朵，睡起來輕飄飄' },
  { id: 'nest-strawberry', cat: 'home', kind: 'style', slot: 'nest', value: 'strawberry', emoji: '🍓', label: '草莓床', cost: 420, rarity: 'epic', desc: '睡在一顆大草莓裡' },
  { id: 'house-wood', cat: 'home', kind: 'style', slot: 'house', value: 'wood', base: true, needs: { item: 'house' }, emoji: '🏠', label: '木屋造型', cost: 0, rarity: 'common', desc: '原木小屋' },
  { id: 'house-mushroom', cat: 'home', kind: 'style', slot: 'house', value: 'mushroom', needs: { item: 'house' }, emoji: '🍄', label: '蘑菇屋', cost: 380, rarity: 'epic', desc: '紅色點點的蘑菇小屋' },
  { id: 'house-castle', cat: 'home', kind: 'style', slot: 'house', value: 'castle', needs: { item: 'house' }, emoji: '🏯', label: '夢幻城堡', cost: 1100, rarity: 'legendary', desc: '有尖塔和小旗子的城堡' },
  // 風格：墊料
  { id: 'bed-paper', cat: 'style', kind: 'style', slot: 'bedding', value: 'paper', base: true, emoji: '📄', label: '原色紙棉', cost: 0, rarity: 'common', desc: '米白色紙棉墊料' },
  { id: 'bed-pink', cat: 'style', kind: 'style', slot: 'bedding', value: 'pink', emoji: '🌸', label: '粉紅墊料', cost: 30, rarity: 'common', desc: '櫻花粉紅色' },
  { id: 'bed-lavender', cat: 'style', kind: 'style', slot: 'bedding', value: 'lavender', emoji: '💜', label: '薰衣草墊料', cost: 40, rarity: 'common', desc: '淡淡的紫色' },
  { id: 'bed-rainbow', cat: 'style', kind: 'style', slot: 'bedding', value: 'rainbow', emoji: '🎊', label: '彩虹紙花', cost: 180, rarity: 'rare', desc: '五顏六色的紙花' },
  { id: 'bed-galaxy', cat: 'style', kind: 'style', slot: 'bedding', value: 'galaxy', emoji: '🌌', label: '星空墊料', cost: 400, rarity: 'epic', desc: '深藍色的墊料裡閃著小星星' },
  // 風格：籠子顏色
  { id: 'cage-white', cat: 'style', kind: 'style', slot: 'cageColor', value: 'white', base: true, emoji: '🤍', label: '白色籠子', cost: 0, rarity: 'common', desc: '簡單的白色' },
  { id: 'cage-pink', cat: 'style', kind: 'style', slot: 'cageColor', value: 'pink', emoji: '🩷', label: '粉紅籠子', cost: 60, rarity: 'common', desc: '可愛的粉紅色' },
  { id: 'cage-mint', cat: 'style', kind: 'style', slot: 'cageColor', value: 'mint', emoji: '🩵', label: '薄荷籠子', cost: 60, rarity: 'common', desc: '清爽的薄荷綠' },
  { id: 'cage-gold', cat: 'style', kind: 'style', slot: 'cageColor', value: 'gold', emoji: '👑', label: '黃金籠子', cost: 500, rarity: 'epic', desc: '閃閃發亮的金色鐵絲' },
  { id: 'cage-rainbow', cat: 'style', kind: 'style', slot: 'cageColor', value: 'rainbow', emoji: '🌈', label: '彩虹籠子', cost: 900, rarity: 'legendary', desc: '每一根鐵絲都是不同的顏色' },
  // 風格：滾輪
  { id: 'wheel-mint', cat: 'style', kind: 'style', slot: 'wheel', value: 'mint', base: true, needs: { item: 'wheel' }, emoji: '🟢', label: '薄荷滾輪', cost: 0, rarity: 'common', desc: '原本的滾輪' },
  { id: 'wheel-pink', cat: 'style', kind: 'style', slot: 'wheel', value: 'pink', needs: { item: 'wheel' }, emoji: '🩰', label: '粉紅滾輪', cost: 40, rarity: 'common', desc: '粉紅色的滾輪' },
  { id: 'wheel-crystal', cat: 'style', kind: 'style', slot: 'wheel', value: 'crystal', needs: { item: 'wheel' }, emoji: '💎', label: '水晶滾輪', cost: 220, rarity: 'rare', desc: '透明的水晶，看得到倉鼠在裡面跑' },
  { id: 'wheel-led', cat: 'style', kind: 'style', slot: 'wheel', value: 'led', needs: { item: 'wheel' }, emoji: '✨', label: '夜光 LED 滾輪', cost: 850, rarity: 'legendary', desc: '會變色發光，跑越快越亮' },
  // 風格：房間
  { id: 'room-cream', cat: 'style', kind: 'style', slot: 'room', value: 'cream', base: true, emoji: '☕', label: '奶茶色房間', cost: 0, rarity: 'common', desc: '溫暖的奶茶色' },
  { id: 'room-forest', cat: 'style', kind: 'style', slot: 'room', value: 'forest', emoji: '🌿', label: '森林房間', cost: 200, rarity: 'rare', desc: '綠色樹葉的牆壁' },
  { id: 'room-night', cat: 'style', kind: 'style', slot: 'room', value: 'night', emoji: '🌙', label: '星空房間', cost: 450, rarity: 'epic', desc: '滿天星星和月亮' },
  { id: 'room-candy', cat: 'style', kind: 'style', slot: 'room', value: 'candy', emoji: '🍭', label: '糖果樂園', cost: 1000, rarity: 'legendary', desc: '糖果條紋牆＋飄來飄去的氣球' },
];

export function setupOf(room) {
  const s = room?.setup || {};
  return {
    cage: s.cage || 'small',
    items: s.items || [],
    cageAt: s.cageAt || 0,
    styles: { ...DEFAULT_STYLES, ...(s.styles || {}) },
    owned: s.owned || [],
  };
}
export const cageRank = (id) => CAGE_ORDER.indexOf(id);
const NAME = { medium: '中籠子', big: '雙層大籠子', annex1: '擴充遊戲籠', wheel: '滾輪', house: '小木屋' };

// 還有幾個空位可以放 S／L 玩具
function freeSpots(setup, size) {
  const spots = toySpotsFor(setup)[size].length;
  const used = setup.items.filter((id) => TOYS[id]?.size === size).length;
  return spots - used;
}

// 商品狀態：
//   owned（已擁有）、equipped（使用中）、equip（已擁有，可以裝上）、ok（可以換）
//   needs（還不能買，附上原因 reason）
export function shopState(item, setup) {
  if (item.kind === 'style') {
    if (item.needs?.item && !setup.items.includes(item.needs.item)) return { s: 'needs', reason: `要先有${NAME[item.needs.item]}` };
    if (setup.styles[item.slot] === item.value) return { s: 'equipped' };
    if (item.base || setup.owned.includes(item.id)) return { s: 'equip' };
    return { s: 'ok' };
  }
  if (item.kind === 'cage') return cageRank(item.id) <= cageRank(setup.cage) ? { s: 'owned' } : { s: 'ok' };
  if (setup.items.includes(item.id)) return { s: 'owned' };
  if (item.needs?.cage && cageRank(setup.cage) < cageRank(item.needs.cage)) return { s: 'needs', reason: `要先換${NAME[item.needs.cage]}` };
  if (item.needs?.item && !setup.items.includes(item.needs.item)) return { s: 'needs', reason: `要先有${NAME[item.needs.item]}` };
  if (item.needs?.spot && freeSpots(setup, item.needs.spot) <= 0) return { s: 'needs', reason: item.needs.spot === 'L' ? '沒有大空位了（雙層大籠子或遊戲籠才有）' : '沒有空位了，換大籠子或加遊戲籠' };
  return { s: 'ok' };
}
