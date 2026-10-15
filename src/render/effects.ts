// 判定特效：命中、爆發、擊退／吸引、分攤圈、連線、視線
import { dirV } from '../core/geometry';
import type { Vec } from '../core/constants';
import type { Effect, RenderState } from '../game/state';
import { px, circle, text } from './canvas';
import { drawBurst } from './telegraphs';

export function drawFx(c: CanvasRenderingContext2D, f: Effect, G: RenderState): void {
  c.save();
  switch (f.k) {
    case 'hit':
      c.strokeStyle = '#ff5d6c'; c.lineWidth = px(3); circle(c, f.x, f.y, 1.6); c.stroke();
      break;
    case 'burst':
      drawBurst(c, f.tele, (G.t - f.start) / (f.until - f.start));
      break;
    case 'kb':
    case 'pull': {
      c.strokeStyle = f.k === 'kb' ? '#2a78b8' : '#d0344a'; c.lineWidth = px(2.5);
      for (let i = 0; i < 8; i++) {
        const v = dirV((i * Math.PI) / 4), a1 = f.k === 'kb' ? 4 : 12, a2 = f.k === 'kb' ? 10 : 6;
        c.beginPath(); c.moveTo(f.x + v.x * a1, f.y + v.y * a1); c.lineTo(f.x + v.x * a2, f.y + v.y * a2); c.stroke();
      }
      break;
    }
    case 'stack':
      c.fillStyle = 'rgba(242,190,40,.35)'; c.strokeStyle = '#c9971a'; c.lineWidth = px(2);
      circle(c, f.x, f.y, f.r); c.fill(); c.stroke();
      break;
    case 'tether': {
      const from: Vec = typeof f.from === 'string' ? G.bosses.find((b) => b.id === f.from) ?? { x: 0, y: 0 } : f.from;
      c.strokeStyle = f.col ?? 'rgba(192,91,255,.8)'; c.lineWidth = px(2.5);
      c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(f.to.x, f.to.y); c.stroke();
      break;
    }
    case 'gaze':
      c.strokeStyle = 'rgba(255,93,108,.8)'; c.lineWidth = px(2); c.setLineDash([px(6), px(5)]);
      c.beginPath(); c.moveTo(f.src.x, f.src.y); c.lineTo(G.player.x, G.player.y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#2a0d16'; circle(c, f.src.x, f.src.y, 1.4); c.fill();
      c.strokeStyle = '#ff5d6c'; c.lineWidth = px(2.5); c.stroke();
      c.fillStyle = '#ff5d6c'; circle(c, f.src.x, f.src.y, 0.6); c.fill();
      break;
    case 'pop': {
      // 用了什麼技能：在頭上往上飄、淡出
      const k = (G.t - f.start) / (f.until - f.start);
      c.globalAlpha = Math.max(0, 1 - k * 0.7);
      text(c, f.text, f.to.x, f.to.y - 2.4 - k * 1.4, 12, f.col, 800);
      break;
    }
    case 'flash':
      break;
  }
  c.restore();
}
