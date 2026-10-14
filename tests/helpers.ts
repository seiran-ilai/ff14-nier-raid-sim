// 測試共用：以示範模式（Bot 控制玩家）用固定步長跑完一局
import { defaultConfig } from '../src/core/config';
import { ALS, ROLES, type Alliance, type Role } from '../src/core/constants';
import { fmtT } from '../src/core/format';
import { SIM_DT } from '../src/core/tuning';
import { Session } from '../src/game/session';
import { newInput } from '../src/game/simulation';
import type { BotFail, GameState } from '../src/game/state';

export const DT = SIM_DT;

export interface RunResult { ok: boolean; fails: string[]; checks: string[]; botFails: BotFail[]; t: number; G: GameState; session: Session }

export function makeSession(drill: string, al: Alliance, role: Role, record = false): Session {
  return new Session({ ...defaultConfig(), drill, al, role }, newInput(), record);
}

export function runToEnd(s: Session, G: GameState): void {
  for (let i = 0; i < 900 / DT && G.state !== 'end'; i++) s.step(DT);
}

export function runDemo(drill: string, al: Alliance, role: Role, seed: number, startAt = 0, record = false): RunResult {
  const s = makeSession(drill, al, role, record);
  const G = s.newGame(true, seed, startAt);
  runToEnd(s, G);
  return { ok: !!G.result?.ok, fails: G.fails, checks: G.checks.map((c) => `${fmtT(c.t)} ${c.tag} ${c.text}`), botFails: G.botFails, t: G.t, G, session: s };
}

/** 依序輪替 24 個座位（A/B/C × 8 職能） */
export const seatOf = (i: number): { al: Alliance; role: Role } => ({ al: ALS[i % 3], role: ROLES[Math.floor(i / 3) % 8] });
