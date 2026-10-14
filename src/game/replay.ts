// 回放：每秒 REPLAY.hz 次錄下可渲染的狀態（玩家與 Bot 位置、面向、預兆、特效），結算時可慢動作重播某個判定的前後幾秒
import { REPLAY } from '../core/tuning';
import type { Effect, Entity, GameState, RenderState } from './state';

export type Frame = RenderState;

const cloneEnt = (e: Entity): Entity => ({ ...e, buffs: { ...e.buffs }, statuses: e.statuses.slice(), mt: null, ov: null, forced: null });

export function snapshot(G: GameState): Frame {
  const map = new Map<Entity, Entity>();
  const ents = G.ents.map((e) => { const c = cloneEnt(e); map.set(e, c); return c; });
  const fx: Effect[] = G.fx.map((f) => (f.k === 'tether' ? { ...f, to: map.get(f.to) ?? f.to } : { ...f }));
  return {
    t: G.t, ents, player: map.get(G.player)!, tele: G.tele.slice(), fx, objs: G.objs.slice(), zones: G.zones.slice(),
    bosses: G.bosses.map((b) => ({ ...b })), enc: G.enc, arena: G.arena, hints: G.hints.slice(), cast: G.cast ? { ...G.cast } : null,
    // 各王自己的狀態：淺拷貝（機制檔換狀態時請換新物件，不要原地改）
    x: { ...G.x },
  };
}

export class Recorder {
  frames: Frame[] = [];
  private last = -Infinity;

  clear(): void { this.frames = []; this.last = -Infinity; }

  tick(G: GameState): void {
    if (G.state !== 'run' || G.t - this.last < 1 / REPLAY.hz - 1e-9) return;
    this.last = G.t;
    this.frames.push(snapshot(G));
  }
}

/** 在影格 a→b 之間插值：位置取 b、前一位置取 a，配合 draw 的 alpha */
export function blend(a: Frame, b: Frame): Frame {
  const ents = b.ents.map((e, i) => ({ ...e, px: a.ents[i].x, py: a.ents[i].y, pface: a.ents[i].face }));
  const player = ents[b.ents.indexOf(b.player)];
  const bosses = b.bosses.map((x, i) => (a.bosses[i] ? { ...x, px: a.bosses[i].x, py: a.bosses[i].y, pface: a.bosses[i].face } : x));
  return { ...b, ents, player, bosses };
}
