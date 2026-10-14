// 座標慣例：x 往東、y 往南（畫面座標）；角度 0 = 北，順時針為正。單位公尺。
import type { Vec } from './constants';

export const dirV = (a: number): Vec => ({ x: Math.sin(a), y: -Math.cos(a) });
export const angOf = (dx: number, dy: number): number => Math.atan2(dx, -dy);
/** 從 a 看 b 的角度 */
export const angTo = (a: Vec, b: Vec): number => angOf(b.x - a.x, b.y - a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
/** 兩角度差的絕對值，0～π */
export const angDiff = (a: number, b: number): number =>
  Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
/** 從 c 往角度 a 走 d 公尺 */
export const polar = (c: Vec, a: number, d: number): Vec => { const v = dirV(a); return { x: c.x + v.x * d, y: c.y + v.y * d }; };
/** 度 → 弧度 */
export const deg = (d: number): number => (d * Math.PI) / 180;
/** 方位名稱 → 角度 */
export const DIR = { N: 0, NE: deg(45), E: deg(90), SE: deg(135), S: deg(180), SW: deg(225), W: deg(270), NW: deg(315) } as const;
