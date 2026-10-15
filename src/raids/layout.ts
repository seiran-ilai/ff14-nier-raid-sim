// 站位小工具（各副本共用）
import { ROLES, type Alliance, type Role, type Vec } from '../core/constants';
import { deg, polar } from '../core/geometry';

/**
 * 原位：以 c 為中心，A／B／C 各佔一個方向（角度，0＝北），每隊 4×2 排列，離中心 d 公尺。
 * 預設 A 西南、B 南、C 東南（王在北或中央時，大家在王的南側）。
 */
export function clusterHome(c: Vec, d: number, angs: Record<Alliance, number> = { A: deg(225), B: deg(180), C: deg(135) }) {
  return (al: Alliance, role: Role): Vec => {
    const i = ROLES.indexOf(role), a = angs[al], p = polar(c, a, d);
    // 沿著切線排 4 個、往外排 2 排
    const tx = Math.cos(a), ty = Math.sin(a), along = -2.1 + (i % 4) * 1.4, out = Math.floor(i / 4) * 1.4;
    const n = polar({ x: 0, y: 0 }, a, out);
    return { x: p.x + tx * along + n.x, y: p.y + ty * along + n.y };
  };
}

/** 以 c 為中心排一小團（4×2，間距 1.2 m）：每隊各自集合用 */
export function packAt(c: Vec, role: Role): Vec {
  const i = ROLES.indexOf(role);
  return { x: c.x - 1.8 + (i % 4) * 1.2, y: c.y - 0.6 + Math.floor(i / 4) * 1.2 };
}

/**
 * 把 from[i] 分配到 spots 的其中一個（每個站位一人）：試過所有排列，讓跑最遠的人跑得最短。
 * 回傳 spotOf[i]＝第 i 個人的站位 index。人數最多 6 個左右（排列數會爆炸）。
 */
export function assignSpots(from: Vec[], spots: Vec[]): number[] {
  const n = from.length, idx = spots.map((_s, i) => i);
  let best: number[] = idx.slice(0, n), bestCost = Infinity;
  const perm = (cur: number[], left: number[]): void => {
    if (cur.length === n) {
      const c = Math.max(...cur.map((s, i) => Math.hypot(spots[s].x - from[i].x, spots[s].y - from[i].y)));
      if (c < bestCost) { bestCost = c; best = cur.slice(); }
      return;
    }
    left.forEach((s, k) => perm([...cur, s], [...left.slice(0, k), ...left.slice(k + 1)]));
  };
  perm([], idx);
  return best;
}

/** 依方位（從北順時針）排序：把點名者對應到依方位排好的站位，跑最短的路 */
export const byAngle = <T extends Vec>(c: Vec, list: T[], of: (x: T) => Vec = (x) => x): T[] =>
  list.slice().sort((a, b) => {
    const f = (p: Vec): number => (Math.atan2(p.x - c.x, -(p.y - c.y)) + 2 * Math.PI) % (2 * Math.PI);
    return f(of(a)) - f(of(b));
  });
