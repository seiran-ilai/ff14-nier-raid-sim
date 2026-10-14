// Canvas 基礎：尺寸、鏡頭、世界↔螢幕座標、像素換算與文字
import type { Vec } from '../core/constants';
import { arenaView, type Arena } from '../core/arena';
import { VIEW_ZOOM } from '../core/tuning';

export const FF = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

export const view = {
  cv: null as unknown as HTMLCanvasElement,
  ctx: null as unknown as CanvasRenderingContext2D,
  SCALE: 10,
  DPR: 1,
  /** 鏡頭中心（世界座標）與畫面中心到邊的距離 */
  cx: 0,
  cy: 0,
  VIEW: 26,
};

export function initCanvas(cv: HTMLCanvasElement): void {
  view.cv = cv;
  view.ctx = cv.getContext('2d')!;
}

export function resize(): void {
  const cv = view.cv, r = cv.getBoundingClientRect();
  view.DPR = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * view.DPR));
  cv.height = Math.max(1, Math.round(r.height * view.DPR));
  view.SCALE = cv.width / (view.VIEW * 2);
}

/** 鏡頭：fixed＝整個場地、北在上；follow＝跟隨角色並放大（仍是北在上） */
export function setCamera(mode: 'fixed' | 'follow', focus: Vec, arena: Arena, zoom: keyof typeof VIEW_ZOOM = 'mid'): void {
  if (mode === 'follow') { view.cx = focus.x; view.cy = focus.y; view.VIEW = VIEW_ZOOM[zoom]; }
  else { const v = arenaView(arena); view.cx = v.cx; view.cy = v.cy; view.VIEW = v.r; }
  // 以寬、高中較短的一邊決定比例尺（教學頁的畫面比場地高）
  view.SCALE = Math.min(view.cv.width, view.cv.height) / (view.VIEW * 2);
}

export function worldTransform(c: CanvasRenderingContext2D): void {
  c.setTransform(view.SCALE, 0, 0, view.SCALE, view.cv.width / 2 - view.cx * view.SCALE, view.cv.height / 2 - view.cy * view.SCALE);
}

/** CSS 像素 → 世界單位（在世界座標變換下畫固定粗細的線） */
export const px = (n: number): number => (n * view.DPR) / view.SCALE;

export function toWorld(clientX: number, clientY: number): Vec {
  const cv = view.cv, r = cv.getBoundingClientRect();
  return {
    x: ((clientX - r.left) * view.DPR - cv.width / 2) / view.SCALE + view.cx,
    y: ((clientY - r.top) * view.DPR - cv.height / 2) / view.SCALE + view.cy,
  };
}

export function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

export function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, weight = 900): void {
  c.font = `${weight} ${px(size)}px ${FF}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = px(3.5);
  c.strokeStyle = 'rgba(0,0,0,.85)';
  c.strokeText(s, x, y);
  c.fillStyle = col;
  c.fillText(s, x, y);
}

/** 場地外框路徑 */
export function arenaPath(c: CanvasRenderingContext2D, a: Arena, fresh = true): void {
  if (fresh) c.beginPath();
  const s = a.shape;
  if (s.k === 'circle') { c.moveTo(s.r, 0); c.arc(0, 0, s.r, 0, Math.PI * 2); } else c.rect(-s.hw, -s.hh, s.hw * 2, s.hh * 2);
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 角度插值（走最短的那一邊） */
export const lerpAng = (a: number, b: number, k: number): number => {
  const d = ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + d * k;
};
