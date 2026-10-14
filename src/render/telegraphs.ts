// AOE 預兆（仿遊戲）：填色＋邊緣漸亮，判定前 TELE_FLASH 秒閃爍；判定瞬間由 effects 畫爆發
import { dirV } from '../core/geometry';
import { TELE_FLASH } from '../core/tuning';
import type { Shape } from '../core/shapes';
import type { Telegraph, Zone } from '../game/state';
import { px, circle } from './canvas';

/** 沒給長度的直線：畫到夠長（場地外會被裁掉） */
const FAR = 90;

function lineRect(c: CanvasRenderingContext2D, x: number, y: number, a: number, hw: number, L: number): void {
  const v = dirV(a), n = { x: -v.y, y: v.x };
  c.moveTo(x - v.x * L + n.x * hw, y - v.y * L + n.y * hw);
  c.lineTo(x + v.x * L + n.x * hw, y + v.y * L + n.y * hw);
  c.lineTo(x + v.x * L - n.x * hw, y + v.y * L - n.y * hw);
  c.lineTo(x - v.x * L - n.x * hw, y - v.y * L - n.y * hw);
  c.closePath();
}

/** 形狀的路徑（填色區域）；ring 用 evenodd、cross 用 nonzero */
export function shapePath(c: CanvasRenderingContext2D, t: Shape): void {
  c.beginPath();
  switch (t.k) {
    case 'circle': circle(c, t.x, t.y, t.r); break;
    case 'ring': c.arc(t.x, t.y, t.r1, 0, Math.PI * 2); c.moveTo(t.x + t.r0, t.y); c.arc(t.x, t.y, t.r0, 0, Math.PI * 2, true); break;
    case 'rect': {
      const v = dirV(t.H), n = { x: -v.y, y: v.x }, hw = t.w / 2, O = t.O;
      c.moveTo(O.x + n.x * hw, O.y + n.y * hw);
      c.lineTo(O.x + n.x * hw + v.x * t.len, O.y + n.y * hw + v.y * t.len);
      c.lineTo(O.x - n.x * hw + v.x * t.len, O.y - n.y * hw + v.y * t.len);
      c.lineTo(O.x - n.x * hw, O.y - n.y * hw);
      c.closePath();
      break;
    }
    case 'fan': { const m = t.a - Math.PI / 2; c.moveTo(t.x, t.y); c.arc(t.x, t.y, t.r, m - t.w, m + t.w); c.closePath(); break; }
    case 'line': lineRect(c, t.x, t.y, t.a, t.hw, t.len ?? FAR); break;
    case 'cross': lineRect(c, t.x, t.y, t.a, t.hw, t.len ?? FAR); lineRect(c, t.x, t.y, t.a + Math.PI / 2, t.hw, t.len ?? FAR); break;
    case 'half': { const m = t.a - Math.PI / 2; c.moveTo(t.x, t.y); c.arc(t.x, t.y, t.r, m - Math.PI / 2, m + Math.PI / 2); c.closePath(); break; }
  }
}

const COLS = {
  orange: { fill: '255,128,48', edge: '255,190,120' },
  blue: { fill: '92,200,255', edge: '190,235,255' },
  purple: { fill: '180,90,255', edge: '225,190,255' },
};

/** 填色＋邊緣由內往外漸亮（多層描邊） */
function glowFill(c: CanvasRenderingContext2D, t: Shape, col: { fill: string; edge: string }, a: number): void {
  const eo = t.k === 'ring';
  shapePath(c, t);
  c.fillStyle = `rgba(${col.fill},${0.22 * a})`;
  if (eo) c.fill('evenodd'); else c.fill();
  c.save();
  if (eo) c.clip('evenodd'); else c.clip();
  // 只畫在區域內側：寬線被 clip 掉外半邊，形成內側光暈
  [[14, 0.1], [8, 0.18], [4, 0.32]].forEach(([w, al]) => { shapePath(c, t); c.strokeStyle = `rgba(${col.fill},${al * a})`; c.lineWidth = px(w); c.stroke(); });
  c.restore();
  shapePath(c, t);
  c.strokeStyle = `rgba(${col.edge},${0.95 * a})`;
  c.lineWidth = px(2);
  c.stroke();
}

export function drawTele(c: CanvasRenderingContext2D, t: Telegraph, now: number): void {
  const left = t.until - now;
  // 剛出現時淡入；判定前閃爍
  const fadeIn = t.start != null ? Math.min(1, (now - t.start) / 0.25) : 1;
  const a = (left < TELE_FLASH ? (Math.floor(left * 20) % 2 ? 1.6 : 0.7) : 1) * fadeIn;
  c.save();
  glowFill(c, t, COLS[t.col ?? 'orange'], a);
  c.restore();
}

const ZONE_COL = { fire: ['255,110,40', '255,170,90'], elec: ['120,190,255', '200,235,255'], purple: ['170,90,255', '220,180,255'] } as const;

/** 持續性地面區域（火焰、帶電）：還沒生效時畫虛線外框，生效後填色並閃動 */
export function drawZone(c: CanvasRenderingContext2D, z: Zone, now: number): void {
  if (z.until <= now) return;
  const [fill, edge] = ZONE_COL[z.col ?? 'purple'];
  const on = now >= z.from;
  c.save();
  shapePath(c, z.shape);
  if (on) {
    c.fillStyle = `rgba(${fill},${0.28 + 0.08 * Math.sin(now * 9)})`;
    if (z.shape.k === 'ring') c.fill('evenodd'); else c.fill();
  }
  c.setLineDash(on ? [] : [px(6), px(5)]);
  c.strokeStyle = `rgba(${edge},.9)`; c.lineWidth = px(2);
  c.stroke();
  c.restore();
}

/** 判定瞬間的爆發：白熱填色快速淡出 */
export function drawBurst(c: CanvasRenderingContext2D, t: Telegraph, k: number): void {
  const a = Math.max(0, 1 - k);
  c.save();
  c.fillStyle = t.col === 'blue' ? `rgba(200,240,255,${0.55 * a})` : `rgba(255,220,170,${0.6 * a})`;
  shapePath(c, t);
  if (t.k === 'ring') c.fill('evenodd'); else c.fill();
  c.restore();
}
