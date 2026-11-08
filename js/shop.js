// 商店：用好感度換籠子和玩具
import { CAGE_ORDER } from './layout.js';

export const SHOP = [
  { id: 'sand', type: 'item', emoji: '🛁', label: '沙浴盆', cost: 40, desc: '倉鼠會跳進去打滾洗澡' },
  { id: 'wheel', type: 'item', emoji: '🎡', label: '滾輪', cost: 60, desc: '讓倉鼠跑跑步，心情會變好' },
  { id: 'log', type: 'item', emoji: '🪵', label: '木頭隧道', cost: 80, needs: 'medium', desc: '鑽進去躲起來、從另一頭探頭' },
  { id: 'bignest', type: 'item', emoji: '☁️', label: '大棉花窩', cost: 90, desc: '睡覺時可以整隻鑽進去' },
  { id: 'house', type: 'item', emoji: '🏠', label: '小木屋', cost: 120, needs: 'medium', desc: '喜歡躲在裡面休息、睡覺' },
  { id: 'medium', type: 'cage', emoji: '🏡', label: '中籠子', cost: 300, desc: '更大的空間，可以放隧道和小木屋' },
  { id: 'big', type: 'cage', emoji: '🏰', label: '雙層大籠子', cost: 700, desc: '有二樓和木梯，倉鼠會爬上爬下' },
];

export const setupOf = (room) => ({ cage: room?.setup?.cage || 'small', items: room?.setup?.items || [], cageAt: room?.setup?.cageAt || 0 });
export const cageRank = (id) => CAGE_ORDER.indexOf(id);

// 這個東西現在的狀態：owned（已經有了）、needs（要先換籠子）、ok（可以買）
export function shopState(item, setup) {
  if (item.type === 'cage') return cageRank(item.id) <= cageRank(setup.cage) ? 'owned' : 'ok';
  if (setup.items.includes(item.id)) return 'owned';
  if (item.needs && cageRank(setup.cage) < cageRank(item.needs)) return 'needs';
  return 'ok';
}
