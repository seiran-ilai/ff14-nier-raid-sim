// AOE 形狀（預兆與判定共用同一份資料，畫出來的邊緣就是判定邊緣）。
// 判定一律用角色判定圈（半徑 HIT）：判定圈碰到形狀＝被打中。
import { HIT } from './tuning';
import { dirV } from './geometry';
import type { Vec } from './constants';

export type Shape =
  /** 圓形（鋼鐵、點名圓圈） */
  | { k: 'circle'; x: number; y: number; r: number }
  /** 環形：r0～r1 之間（月環的危險區，r0 以內安全） */
  | { k: 'ring'; x: number; y: number; r0: number; r1: number }
  /** 矩形：從 O 朝角度 H 打出，長 len、寬 w */
  | { k: 'rect'; O: Vec; H: number; len: number; w: number }
  /** 扇形：中心、半徑、朝 a、半張角 w */
  | { k: 'fan'; x: number; y: number; r: number; a: number; w: number }
  /** 直線：通過 (x,y)、角度 a，前後兩端都打；半寬 hw，每邊長 len（沒有就是貫穿整個場地） */
  | { k: 'line'; x: number; y: number; a: number; hw: number; len?: number }
  /** 十字：兩條互相垂直的直線（角度 a 與 a+90°） */
  | { k: 'cross'; x: number; y: number; a: number; hw: number; len?: number }
  /** 半場：中心、半徑、朝 a 的那一半 */
  | { k: 'half'; x: number; y: number; r: number; a: number };

export const hitCircle = (p: Vec, c: Vec, r: number, hb = HIT): boolean => Math.hypot(p.x - c.x, p.y - c.y) <= r + hb;
/** 判定圈整個在圓形安全區內（分攤圈、塔） */
export const insideCircle = (p: Vec, c: Vec, r: number, hb = HIT): boolean => Math.hypot(p.x - c.x, p.y - c.y) <= r - hb;

export function hitRect(p: Vec, O: Vec, H: number, len: number, w: number, hb = HIT): boolean {
  const v = dirV(H), dx = p.x - O.x, dy = p.y - O.y;
  const t = dx * v.x + dy * v.y, s = dx * v.y - dy * v.x;
  const ct = Math.max(0, Math.min(len, t)), cs = Math.max(-w / 2, Math.min(w / 2, s));
  return Math.hypot(t - ct, s - cs) <= hb;
}

export function hitHalf(p: Vec, c: Vec, r: number, a: number, hb = HIT): boolean {
  const n = dirV(a), dx = p.x - c.x, dy = p.y - c.y;
  return dx * n.x + dy * n.y > -hb && Math.hypot(dx, dy) <= r + hb;
}

export function hitRing(p: Vec, c: Vec, r0: number, r1: number, hb = HIT): boolean {
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  return d >= r0 - hb && d <= r1 + hb;
}

/** 扇形（判定圈用角度近似放寬） */
export function hitFan(p: Vec, c: Vec, r: number, a: number, w: number, hb = HIT): boolean {
  const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
  if (d > r + hb) return false;
  if (d <= hb) return true;
  const ang = Math.atan2(dx, -dy);
  const diff = Math.abs(((((ang - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return diff <= w + Math.asin(Math.min(1, hb / d));
}

export function hitLine(p: Vec, c: Vec, a: number, hw: number, len = Infinity, hb = HIT): boolean {
  const v = dirV(a), dx = p.x - c.x, dy = p.y - c.y;
  const along = Math.abs(dx * v.x + dy * v.y);
  return Math.abs(dx * v.y - dy * v.x) <= hw + hb && along <= len + hb;
}

export function hitShape(p: Vec, s: Shape, hb = HIT): boolean {
  switch (s.k) {
    case 'circle': return hitCircle(p, s, s.r, hb);
    case 'ring': return hitRing(p, s, s.r0, s.r1, hb);
    case 'rect': return hitRect(p, s.O, s.H, s.len, s.w, hb);
    case 'fan': return hitFan(p, s, s.r, s.a, s.w, hb);
    case 'line': return hitLine(p, s, s.a, s.hw, s.len, hb);
    case 'cross': return hitLine(p, s, s.a, s.hw, s.len, hb) || hitLine(p, s, s.a + Math.PI / 2, s.hw, s.len, hb);
    case 'half': return hitHalf(p, s, s.r, s.a, hb);
  }
}
