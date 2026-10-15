// 場地：地板、格線、場邊（死亡牆紅色）、場地標點、方位字；王與場上物件（塔、球）
import type { Vec } from '../core/constants';
import { dirV } from '../core/geometry';
import type { BossEnt, FieldObj, RenderState } from '../game/state';
import { px, text, circle, arenaPath, lerp, lerpAng } from './canvas';

/** 遊戲裡的標點顏色：A／1 紅、B／2 黃、C／3 藍、D／4 紫 */
const WM_COL: Record<string, string> = { A: '#ff5d6c', B: '#ffd36b', C: '#5cc8ff', D: '#c48bff', '1': '#ff5d6c', '2': '#ffd36b', '3': '#5cc8ff', '4': '#c48bff' };

function waymark(c: CanvasRenderingContext2D, k: string, p: Vec): void {
  const col = WM_COL[k] ?? '#ddd';
  c.save();
  c.globalAlpha = 0.85;
  c.strokeStyle = col; c.lineWidth = px(2.5); c.fillStyle = col + '33';
  if (/\d/.test(k)) { c.beginPath(); c.rect(p.x - 1.1, p.y - 1.1, 2.2, 2.2); } else circle(c, p.x, p.y, 1.2);
  c.fill(); c.stroke();
  text(c, k, p.x, p.y, 13, col);
  c.restore();
}

/** 場地外的底色（淺色系；和頁面同色調） */
export const BG = '#dfe2e6';

export function drawArena(c: CanvasRenderingContext2D, G: RenderState): void {
  const A = G.arena, s = A.shape;
  c.fillStyle = BG;
  c.fillRect(-200, -200, 400, 400);
  const R = s.k === 'circle' ? s.r : Math.max(s.hw, s.hh);
  const [f0, f1] = A.floor ?? ['#f7f8fa', '#e4e7eb'];
  const g = c.createRadialGradient(0, 0, 2, 0, 0, R * 1.3);
  g.addColorStop(0, f0); g.addColorStop(1, f1);
  arenaPath(c, A);
  c.fillStyle = g; c.fill();
  // 格線（每 5 m）
  c.save();
  arenaPath(c, A); c.clip();
  c.strokeStyle = 'rgba(60,66,75,.10)'; c.lineWidth = px(1);
  for (let v = -Math.ceil(R / 5) * 5; v <= R; v += 5) {
    c.beginPath(); c.moveTo(v, -R); c.lineTo(v, R); c.moveTo(-R, v); c.lineTo(R, v); c.stroke();
  }
  c.strokeStyle = 'rgba(60,66,75,.2)';
  c.beginPath(); c.moveTo(0, -R); c.lineTo(0, R); c.moveTo(-R, 0); c.lineTo(R, 0); c.stroke();
  c.restore();
  // 場邊
  arenaPath(c, A);
  if (A.edge === 'wall') { c.strokeStyle = '#6b737e'; c.lineWidth = px(2.5); c.stroke(); }
  else { c.strokeStyle = 'rgba(255,70,90,.35)'; c.lineWidth = px(9); c.stroke(); arenaPath(c, A); c.strokeStyle = '#ff5d6c'; c.lineWidth = px(2.5); c.stroke(); }
  const off = R + 2.2;
  text(c, '北', 0, -off, 13, '#59606a', 700);
  text(c, '東', off, 0, 13, '#59606a', 700);
  text(c, '南', 0, off, 13, '#59606a', 700);
  text(c, '西', -off, 0, 13, '#59606a', 700);
  Object.entries(G.enc.waymarks ?? {}).forEach(([k, p]) => waymark(c, k, p));
}

export function drawObj(c: CanvasRenderingContext2D, o: FieldObj, G: RenderState): void {
  c.save();
  if (o.k === 'tower') {
    const pulse = 0.5 + 0.2 * Math.sin(G.t * 5);
    c.fillStyle = `rgba(120,200,255,${0.16 + pulse * 0.1})`; c.strokeStyle = '#8bdcff'; c.lineWidth = px(2.5);
    circle(c, o.x, o.y, o.r); c.fill(); c.stroke();
    c.setLineDash([px(4), px(4)]); circle(c, o.x, o.y, o.r * 0.6); c.stroke(); c.setLineDash([]);
    const n = G.ents.filter((e) => !e.dead && !e.away && Math.hypot(e.x - o.x, e.y - o.y) <= o.r).length;
    text(c, `${n}／${o.need}`, o.x, o.y, 13, n >= o.need ? '#1b8455' : '#1d5a8c');
    if (o.label) text(c, o.label, o.x, o.y + o.r + 1, 11, '#1d5a8c', 700);
  } else {
    c.fillStyle = o.col; c.globalAlpha = 0.85;
    circle(c, o.x, o.y, o.r); c.fill();
    c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = px(1.5); c.stroke();
    if (o.label) text(c, o.label, o.x, o.y - o.r - 0.9, 11, '#fff', 700);
  }
  c.restore();
}

export function drawBoss(c: CanvasRenderingContext2D, b: BossEnt, alpha: number): void {
  if (b.hidden) return;
  const x = lerp(b.px, b.x, alpha), y = lerp(b.py, b.y, alpha), face = lerpAng(b.pface, b.face, alpha);
  const col = b.col ?? '#59606a';
  c.save();
  // 目標圈（遊戲裡王腳下的圈：前方有缺口箭頭）
  c.strokeStyle = col; c.lineWidth = px(2.5);
  const m = face - Math.PI / 2;
  c.beginPath(); c.arc(x, y, b.r, m + 0.35, m + 2 * Math.PI - 0.35); c.stroke();
  const v = dirV(face), n = { x: -v.y, y: v.x };
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x + v.x * (b.r + 1), y + v.y * (b.r + 1));
  c.lineTo(x + v.x * (b.r - 0.3) + n.x * 0.8, y + v.y * (b.r - 0.3) + n.y * 0.8);
  c.lineTo(x + v.x * (b.r - 0.3) - n.x * 0.8, y + v.y * (b.r - 0.3) - n.y * 0.8);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(247,248,250,.9)'; circle(c, x, y, Math.max(0.8, b.r * 0.55)); c.fill();
  c.strokeStyle = col; c.lineWidth = px(1.5); c.stroke();
  text(c, b.name, x, y, 12, '#1f2329');
  c.restore();
}
