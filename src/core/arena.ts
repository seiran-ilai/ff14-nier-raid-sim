// 場地：形狀（方形為主、也支援圓形，中心在原點）、場邊種類、固定鏡頭範圍。
// 每個副本有好幾個王，每個王一個場地（Encounter.arena）。
import type { Vec } from './constants';

export type ArenaShape = { k: 'circle'; r: number } | { k: 'rect'; hw: number; hh: number };

export interface Arena {
  shape: ArenaShape;
  /** 場邊：wall＝空氣牆（擊退撞牆停住）；fall＝掉下去（致命）；death＝死亡牆（碰到就陣亡） */
  edge: 'wall' | 'fall' | 'death';
  /** 固定鏡頭：畫面中心與中心到畫面邊的距離（沒有就依場地大小） */
  view?: { cx: number; cy: number; r: number };
  /** 地板漸層（中心色、外圍色） */
  floor?: [string, string];
}

/** p 在場地上（離邊至少 m 公尺） */
export function onFloor(a: Arena, p: Vec, m = 0): boolean {
  const s = a.shape;
  return s.k === 'circle' ? Math.hypot(p.x, p.y) <= s.r - m : Math.abs(p.x) <= s.hw - m && Math.abs(p.y) <= s.hh - m;
}

/** 到場邊的距離（場外為負） */
export function edgeDist(a: Arena, p: Vec): number {
  const s = a.shape;
  return s.k === 'circle' ? s.r - Math.hypot(p.x, p.y) : Math.min(s.hw - Math.abs(p.x), s.hh - Math.abs(p.y));
}

/** 夾回場內（離邊 m 公尺） */
export function clampIn(a: Arena, p: Vec, m = 0.5): Vec {
  const s = a.shape;
  if (s.k === 'circle') {
    const d = Math.hypot(p.x, p.y), lim = s.r - m;
    return d <= lim ? { x: p.x, y: p.y } : { x: (p.x / d) * lim, y: (p.y / d) * lim };
  }
  return { x: Math.max(-s.hw + m, Math.min(s.hw - m, p.x)), y: Math.max(-s.hh + m, Math.min(s.hh - m, p.y)) };
}

/** 場地外接半徑 */
export const arenaR = (a: Arena): number => (a.shape.k === 'circle' ? a.shape.r : Math.hypot(a.shape.hw, a.shape.hh));

/** 固定鏡頭範圍：中心、中心到畫面邊的距離 */
export function arenaView(a: Arena): { cx: number; cy: number; r: number } {
  if (a.view) return a.view;
  const s = a.shape;
  return { cx: 0, cy: 0, r: (s.k === 'circle' ? s.r : Math.max(s.hw, s.hh)) + 6 };
}

/** 尼爾系列的場地預設是方形：half＝中心到邊的距離 */
export const squareArena = (half: number, edge: Arena['edge'] = 'wall', extra: Partial<Arena> = {}): Arena => ({ shape: { k: 'rect', hw: half, hh: half }, edge, ...extra });
export const circleArena =(r: number, edge: Arena['edge'] = 'wall', extra: Partial<Arena> = {}): Arena => ({ shape: { k: 'circle', r }, edge, ...extra });
export const rectArena = (hw: number, hh: number, edge: Arena['edge'] = 'wall', extra: Partial<Arena> = {}): Arena => ({ shape: { k: 'rect', hw, hh }, edge, ...extra });
