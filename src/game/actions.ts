// 技能列：疾跑、防擊退、位移、插言（打斷）
import { dirV } from '../core/geometry';
import type { DashDir } from '../core/config';
import { force, type GameState } from './state';

const DASH_OFF: Record<DashDir, number> = { fwd: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
/** 位移技能花費秒數 */
const DASH_TIME = 0.22;

/** 使用第 i 格技能；成功回傳 true */
export function useAct(G: GameState, i: number): boolean {
  if (G.state !== 'run') return false;
  const a = G.cfg.acts[i], P = G.player;
  if (!a || P.dead || P.stun > G.t) return false;
  if ((G.cds[i] || 0) > G.t) return false;
  if (a.type === 'sprint') P.buffs.sprint = G.t + (+a.dur || 10);
  else if (a.type === 'akb') P.buffs.akb = G.t + (+a.dur || 6);
  else if (a.type === 'interject') G.lastInterject = G.t;
  else if (a.type === 'dash') {
    if (P.forced) return false;
    const v = dirV(P.face + DASH_OFF[a.dir || 'fwd']);
    force(P, v.x, v.y, +a.dist || 10, DASH_TIME);
  }
  G.cds[i] = G.t + (+a.cd || 0);
  return true;
}
