// Bot（隊友，以及示範模式下的玩家角色）
import type { Vec } from '../core/constants';
import { clampIn, onFloor } from '../core/arena';
import { hitShape } from '../core/shapes';
import { HIT } from '../core/tuning';
import { at, type Entity, type GameState, type Telegraph } from './state';

export const isBot = (G: GameState, e: Entity): boolean => !e.isPlayer || G.auto;
export const npcs = (G: GameState): Entity[] => G.ents.filter((e) => isBot(G, e) && !e.dead && !e.away);

/** 機制在 t0 宣告「接手」Bot；之後只有最後接手的機制能叫 Bot 回原位 */
export function claim(G: GameState, t0: number): object {
  const me = {};
  at(G, t0, () => { G.active = me; });
  return me;
}

/** 在 t（≥ 現在）執行；已經到了就立刻執行 */
export function atOrNow(G: GameState, t: number, fn: () => void): void {
  if (t <= G.t) fn(); else at(G, t, fn);
}

/** 機制結束：Bot 回原位（me 有給的話，只有還沒被下一個機制接手時才回） */
export function settle(G: GameState, t: number, me?: object): void {
  at(G, t, () => {
    if (me && G.active !== me) return;
    npcs(G).forEach((e) => { e.mt = homeOf(G, e); e.ov = null; e.faceLock = null; });
  });
}

/** 現在或 within 秒內會生效的地面區域 */
export const zonesSoon = (G: GameState, within = 4): GameState['zones'] => G.zones.filter((z) => z.until > G.t && z.from <= G.t + within);
export const inZone = (G: GameState, p: Vec, margin = 0, within = 0): boolean => zonesSoon(G, within).some((z) => hitShape(p, z.shape, HIT + margin));

/** 點 p 是否安全：不在任何（這些）預兆與地面區域裡，離場邊至少 1 m */
export const safeFrom = (G: GameState, p: Vec, teles: readonly Telegraph[], margin = 0.6): boolean =>
  onFloor(G.arena, p, 1) && teles.every((t) => !hitShape(p, t, HIT + margin)) && !inZone(G, p, margin, 4);

/**
 * 找離 p 最近的安全點（避開 teles 裡所有預兆）：由近到遠一圈一圈找。
 * 給沒有指定站位的 AOE 用；攻略有指定站位的機制請直接設定 e.mt。
 */
export function findSafe(G: GameState, p: Vec, teles: readonly Telegraph[], margin = 0.6): Vec {
  if (safeFrom(G, p, teles, margin)) return { x: p.x, y: p.y };
  for (let d = 1; d <= 60; d += 1) {
    const n = Math.max(12, Math.round(d * 4));
    // 每圈的起始角度依 p 決定（同一個地方的人往同一個方向躲，比較不會散成一片）
    const a0 = Math.atan2(p.x, -p.y);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2 * Math.PI) / n;
      const q = { x: p.x + Math.sin(a) * d, y: p.y - Math.cos(a) * d };
      if (safeFrom(G, q, teles, margin)) return q;
    }
  }
  return clampIn(G.arena, p, 1);
}

/** 在 G.enc 的原位（夾在場內） */
export const homeOf = (G: GameState, e: Entity): Vec => clampIn(G.arena, G.enc.home(e.al, e.role), 1);

/** 讓 Bot 躲開預兆：在預兆裡的人走到最近的安全點（ov），until 後清掉 */
export function dodge(G: GameState, mine: readonly Telegraph[], until: number): void {
  // 畫面上其他還沒判定的預兆也要避開（例如兩波噴油重疊顯示時，不要躲進第一波）
  const teles = [...mine, ...G.tele.filter((t) => t.until > G.t && !mine.includes(t))];
  npcs(G).forEach((e) => {
    const from = e.ov ?? e.mt ?? e;
    if (safeFrom(G, from, teles)) {
      // 已經在躲別的預兆、而且這個點對這次也安全：延長停留時間
      if (e.ov) e.ovUntil = Math.max(e.ovUntil ?? 0, until);
      return;
    }
    e.ov = findSafe(G, from, teles);
    e.ovUntil = Math.max(e.ov === from ? e.ovUntil ?? 0 : 0, until);
  });
  at(G, until + 0.05, () => npcs(G).forEach((e) => { if (e.ov && (e.ovUntil ?? 0) <= G.t) { e.ov = null; e.ovUntil = undefined; } }));
}
