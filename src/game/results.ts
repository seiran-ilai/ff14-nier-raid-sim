// 判定結果：成功／提醒／失誤，以及玩家受傷、Bot 被打中
import { clampIn, onFloor } from '../core/arena';
import type { Entity, Fix, GameState } from './state';

/** 失誤統計用的機制名稱：去掉括號裡的補充（例如「鋼鐵（第 2 次）」→「鋼鐵」） */
export const mechName = (tag: string): string => tag.replace(/（[^）]*）$/, '').trim();

function mark(G: GameState, tag: string, failed: boolean): void {
  const k = mechName(tag);
  G.mech[k] = (G.mech[k] ?? false) || failed;
}

export function good(G: GameState, tag: string, text: string, fix?: Fix): void {
  G.checks.push({ t: G.t, tag, ok: true, text, fix });
  mark(G, tag, false);
  G.sfx.push('ok');
}

export function warn(G: GameState, tag: string, text: string, fix?: Fix): void {
  G.checks.push({ t: G.t, tag, ok: false, warn: true, text, fix });
  mark(G, tag, false);
}

/** 這個失誤要「從此機制開始」時的起點：最近一個已開始的機制 */
function mechStart(G: GameState): number {
  const s = G.seq.filter((x) => x.t <= G.t + 0.01).pop();
  return s ? Math.max(0, s.t) : 0;
}

export function bad(G: GameState, tag: string, text: string, fix?: Fix): void {
  const check = { t: G.t, tag, ok: false, text, fix, from: mechStart(G) };
  G.checks.push(check);
  G.fails.push(`${tag}：${text}`);
  G.toasts.push({ text: `${tag}：${text}`, until: G.t + 3 });
  mark(G, tag, true);
  G.sfx.push('ng');
  // 錯誤即停：自己練（不是示範）時，第一個失誤就停下來分析
  if (!G.auto && G.cfg.failMode === 'stop' && G.state === 'run' && !G.stopCheck) {
    G.stopCheck = check;
    G.state = 'end';
    G.result = { ok: false };
  }
}

/** 錯誤不停（或示範時間軸）：致命傷害不陣亡，掉下去就放回去繼續練 */
const keepAlive = (G: GameState): boolean => (G.cfg.failMode === 'continue' && !G.auto) || (G.auto && G.tl);

/** 掉出場地後放回自己的原位 */
function putBack(G: GameState): void {
  const P = G.player, to = clampIn(G.arena, G.enc.home(P.al, P.role), 1);
  P.x = P.px = to.x; P.y = P.py = to.y; P.forced = null;
}

/** lethal：致命（掉落、死亡宣告）；錯誤不停模式不陣亡 */
export function hurtPlayer(G: GameState, tag: string, why: string, lethal: boolean, fix?: Fix): void {
  const P = G.player;
  if (P.dead) return;
  bad(G, tag, why, fix);
  G.fx.push({ k: 'flash', until: G.t + 0.35 });
  if (!lethal) return;
  if (keepAlive(G)) {
    if (!onFloor(G.arena, P)) putBack(G);
  } else {
    P.dead = true;
    P.forced = null;
    G.endT = Math.min(G.endT, G.t + 1.5);
  }
}

/** 隊友（非玩家角色）被打中：只記錄、不結束 */
export function botHit(G: GameState, e: Entity, tag: string, why: string): void {
  if (e.isPlayer || e.dead) return;
  G.botFails.push({ t: G.t, tag, who: `${e.al}-${e.role}`, why });
  G.fx.push({ k: 'hit', x: e.x, y: e.y, until: G.t + 1.2 });
}
