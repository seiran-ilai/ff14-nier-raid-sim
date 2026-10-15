// 玩家與隊友：圓形底座＋面向扇形＋判定圈；石化、加重、眩暈、陣亡時外觀改變；頭上標記
import { ROLE_COL, roleType } from '../core/constants';
import { dirV } from '../core/geometry';
import { HIT } from '../core/tuning';
import type { Entity, RenderState } from '../game/state';
import { px, text, circle, lerp, lerpAng } from './canvas';

const has = (G: RenderState, e: Entity, k: 'sprint' | 'akb' | 'heavy'): boolean => (e.buffs[k] || 0) > G.t;

function drawMarker(c: CanvasRenderingContext2D, e: Entity, x: number, y: number, r: number, G: RenderState): void {
  const m = e.marker;
  if (!m || m.until <= G.t) return;
  const hy = y - r - 1.4;
  c.lineWidth = px(2);
  switch (m.kind) {
    case 'stack':
      // 黃色箭頭圈：往下指的三個箭頭＋腳下圈
      c.strokeStyle = '#f2c94c'; c.fillStyle = '#f2c94c';
      circle(c, x, y, m.r ?? r + 1); c.setLineDash([px(5), px(4)]); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(x - 0.6, hy - 0.5); c.lineTo(x + 0.6, hy - 0.5); c.lineTo(x, hy + 0.4); c.closePath(); c.fill();
      break;
    case 'spread':
      c.strokeStyle = '#b06bff'; c.fillStyle = 'rgba(176,107,255,.14)';
      circle(c, x, y, m.r ?? r + 1); c.fill(); c.stroke();
      c.fillStyle = '#b06bff'; circle(c, x, hy, 0.5); c.fill();
      break;
    case 'tb':
      c.strokeStyle = '#ff5d6c'; c.fillStyle = '#ff5d6c';
      circle(c, x, hy, 0.75); c.stroke(); circle(c, x, hy, 0.3); c.fill();
      if (m.r) { circle(c, x, y, m.r); c.stroke(); }
      break;
    case 'target':
      c.strokeStyle = '#ff9b3d'; c.fillStyle = '#ff9b3d';
      c.beginPath(); c.moveTo(x, hy + 0.5); c.lineTo(x - 0.6, hy - 0.5); c.lineTo(x + 0.6, hy - 0.5); c.closePath(); c.fill();
      if (m.r) { circle(c, x, y, m.r); c.stroke(); }
      break;
    case 'num':
      text(c, m.label ?? '', x, hy, 13, '#ffd36b');
      break;
  }
  if (m.label && m.kind !== 'num') text(c, m.label, x, hy - 1.1, 11, '#ffe6a3', 700);
}

export function drawEnt(c: CanvasRenderingContext2D, e: Entity, G: RenderState, alpha: number, mark = true): void {
  const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha), face = lerpAng(e.pface, e.face, alpha);
  const me = e.isPlayer && mark;
  const col = ROLE_COL[roleType(e.role)];
  const r = me ? 0.9 : 0.62;
  const stone = e.stun > G.t && e.stunKind === 'stone';
  const stunned = e.stun > G.t && !stone;
  c.save();

  // 面向扇形（90°）
  const fr = me ? 3.2 : 1.8;
  const a0 = face - Math.PI / 2 - Math.PI / 4, a1 = face - Math.PI / 2 + Math.PI / 4;
  const g = c.createRadialGradient(x, y, r * 0.6, x, y, fr);
  const fc = e.dead ? '120,120,120' : me ? '255,255,255' : '220,220,235';
  g.addColorStop(0, `rgba(${fc},${me ? 0.42 : 0.2})`);
  g.addColorStop(1, `rgba(${fc},0)`);
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x, y); c.arc(x, y, fr, a0, a1); c.closePath(); c.fill();
  if (me) {
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = px(1.2);
    c.beginPath(); c.moveTo(x, y); c.arc(x, y, fr, a0, a1); c.closePath(); c.stroke();
  }

  // 加重：腳下橘色鎖鏈環
  if (has(G, e, 'heavy') && !e.dead) {
    c.strokeStyle = '#ff8f3d'; c.lineWidth = px(me ? 3 : 2); c.setLineDash([px(4), px(3)]);
    circle(c, x, y, r + 0.45); c.stroke(); c.setLineDash([]);
  }

  // 底座
  circle(c, x, y, r);
  c.fillStyle = e.dead ? '#444' : stone ? '#8d8d8d' : col;
  c.fill();
  c.lineWidth = px(me ? 3 : 1.2);
  c.strokeStyle = me ? '#fff' : '#0b0a12';
  c.stroke();
  if (stone) {
    c.strokeStyle = '#3c3c3c'; c.lineWidth = px(1.5);
    c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.3); c.lineTo(x - r * 0.1, y + r * 0.1); c.lineTo(x + r * 0.2, y - r * 0.4); c.lineTo(x + r * 0.6, y + r * 0.2); c.stroke();
  }
  if (e.dead) {
    c.strokeStyle = '#ff5d6c'; c.lineWidth = px(2.5);
    c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.6); c.lineTo(x + r * 0.6, y + r * 0.6); c.moveTo(x + r * 0.6, y - r * 0.6); c.lineTo(x - r * 0.6, y + r * 0.6); c.stroke();
  }

  // 面向指示
  const v = dirV(face), L = r + (me ? 1.1 : 0.6);
  c.strokeStyle = me ? '#fff' : 'rgba(255,255,255,.75)';
  c.lineWidth = px(me ? 3 : 1.5);
  c.beginPath(); c.moveTo(x + v.x * r * 0.4, y + v.y * r * 0.4); c.lineTo(x + v.x * L, y + v.y * L); c.stroke();

  // 判定圈（實際判定大小）
  if (me) { c.strokeStyle = '#ffe28a'; c.lineWidth = px(1.5); circle(c, x, y, HIT); c.stroke(); }

  if (stunned) {
    for (let i = 0; i < 3; i++) { const a = G.t * 4 + (i * 2 * Math.PI) / 3; c.fillStyle = '#ffe066'; circle(c, x + Math.cos(a) * 1.1, y - r - 0.8 + Math.sin(a) * 0.35, 0.22); c.fill(); }
  }
  if (has(G, e, 'akb')) { c.strokeStyle = '#43df9f'; c.lineWidth = px(2); circle(c, x, y, r + 0.5); c.stroke(); }
  drawMarker(c, e, x, y, r, G);
  if (me) text(c, stone ? '石化' : '你', x, y - 2.4, 13, stone ? '#cfcfcf' : '#fff');
  c.restore();
}
