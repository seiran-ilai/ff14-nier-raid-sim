// 繪製一幀（只讀狀態）。alpha 為固定步長之間的插值比例。
import type { Config } from '../core/config';
import type { Fix, RenderState } from '../game/state';
import { dirV } from '../core/geometry';
import { view, px, text, circle, setCamera, worldTransform, lerp } from './canvas';
import { BG, drawArena, drawBoss, drawObj } from './arena';
import { drawTele, drawZone } from './telegraphs';
import { drawFx } from './effects';
import { drawEnt } from './entities';

export interface DrawOpts {
  alpha?: number;
  /** 回放時標出的正確位置 */
  fix?: Fix;
  /** 回放時不顯示提示 */
  noHints?: boolean;
  /** 滑鼠點的目的地 */
  moveTo?: { x: number; y: number } | null;
  /** 不特別標出玩家（教學頁：全員照攻略跑，沒有「你」） */
  noYou?: boolean;
}

export function draw(G: RenderState | null, cfg: Config, opts: DrawOpts = {}): void {
  if (!G) return;
  const alpha = opts.alpha ?? 1;
  const c = view.ctx, cv = view.cv;
  const P = G.player;
  setCamera(cfg.cam, { x: lerp(P.px, P.x, alpha), y: lerp(P.py, P.y, alpha) }, G.arena, cfg.zoom);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = BG;
  c.fillRect(0, 0, cv.width, cv.height);
  worldTransform(c);
  drawArena(c, G);
  G.enc.draw?.(c, G, 'floor');
  if (cfg.hint && !opts.noHints) {
    G.hints.forEach((h) => {
      c.save();
      if (h.r) {
        c.setLineDash([px(6), px(5)]);
        c.strokeStyle = '#1b9a63'; c.fillStyle = 'rgba(27,154,99,.12)'; c.lineWidth = px(2);
        circle(c, h.x, h.y, h.r); c.fill(); c.stroke();
      }
      if (h.label) text(c, h.label, h.x, h.y - (h.r || 0) - 1.3, 12, '#1b9a63', 700);
      c.restore();
    });
  }
  G.zones.forEach((z) => drawZone(c, z, G.t));
  G.objs.forEach((o) => drawObj(c, o, G));
  G.tele.forEach((t) => drawTele(c, t, G.t));
  G.bosses.forEach((b) => drawBoss(c, b, alpha));
  G.fx.forEach((f) => { if (f.k !== 'flash') drawFx(c, f, G); });
  G.ents.filter((e) => !e.isPlayer && !e.away).forEach((e) => drawEnt(c, e, G, alpha));
  drawEnt(c, P, G, alpha, !opts.noYou);
  G.enc.draw?.(c, G, 'top');
  if (opts.fix) drawFix(c, opts.fix);
  if (opts.moveTo) {
    const m = opts.moveTo;
    c.save();
    c.strokeStyle = '#2a78b8'; c.lineWidth = px(2);
    circle(c, m.x, m.y, 0.7); c.stroke();
    c.beginPath(); c.moveTo(m.x - 0.4, m.y - 0.4); c.lineTo(m.x + 0.4, m.y + 0.4); c.moveTo(m.x + 0.4, m.y - 0.4); c.lineTo(m.x - 0.4, m.y + 0.4); c.stroke();
    c.restore();
  }
  if (G.fx.some((f) => f.k === 'flash')) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgba(255,60,80,.18)';
    c.fillRect(0, 0, cv.width, cv.height);
  }
}

/** 回放的「正確位置」標記：綠色圈＋（可選）正確面向箭頭 */
function drawFix(c: CanvasRenderingContext2D, f: Fix): void {
  c.save();
  const r = f.r ?? 1.2;
  c.strokeStyle = '#1b9a63'; c.fillStyle = 'rgba(27,154,99,.2)'; c.lineWidth = px(3);
  circle(c, f.x, f.y, r); c.fill(); c.stroke();
  if (f.face != null) {
    const v = dirV(f.face), L = r + 2.4;
    c.strokeStyle = '#1b9a63'; c.lineWidth = px(4); c.lineCap = 'round';
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + v.x * L, f.y + v.y * L); c.stroke();
    const n = { x: -v.y, y: v.x }, tip = { x: f.x + v.x * L, y: f.y + v.y * L };
    c.fillStyle = '#1b9a63';
    c.beginPath(); c.moveTo(tip.x + v.x * 0.9, tip.y + v.y * 0.9); c.lineTo(tip.x + n.x * 0.7, tip.y + n.y * 0.7); c.lineTo(tip.x - n.x * 0.7, tip.y - n.y * 0.7); c.closePath(); c.fill();
  }
  text(c, `正確：${f.label}`, f.x, f.y - r - 1.6, 13, '#1b9a63');
  c.restore();
}
