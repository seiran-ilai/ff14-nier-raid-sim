// 模擬一步：時間推進、事件、王移動、玩家移動、Bot 移動、強制位移、場邊判定
import type { Vec } from '../core/constants';
import { angOf } from '../core/geometry';
import { clampIn, onFloor } from '../core/arena';
import { RUN, SPRINT_MUL, HEAVY_MUL } from '../core/tuning';
import { hurtPlayer, botHit } from './results';
import { isBot, inZone } from './bots';
import { hitShape } from '../core/shapes';
import { hasBuff, type Entity, type GameState } from './state';

export interface InputState {
  keys: Set<string>;
  /** 滑鼠右鍵按住 */
  rmb: boolean;
  /** 游標的世界座標 */
  mouse: Vec;
  /** 滑鼠左鍵點的目的地（走到就清掉；按 WASD 也會取消） */
  moveTo: Vec | null;
}

export const newInput = (): InputState => ({ keys: new Set(), rmb: false, mouse: { x: 0, y: 0 }, moveTo: null });

export function speedOf(G: GameState, e: Entity): number {
  let s = RUN;
  if (hasBuff(G, e, 'sprint')) s *= SPRINT_MUL;
  if (hasBuff(G, e, 'heavy')) s *= HEAVY_MUL;
  return s;
}

function moveForced(e: Entity, dt: number): void {
  const f = e.forced!, k = Math.min(dt, f.left);
  e.x += f.vx * k;
  e.y += f.vy * k;
  f.left -= dt;
  if (f.left <= 0) e.forced = null;
}

const axis = (keys: Set<string>, pos: string[], neg: string[]): number =>
  (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

function movePlayer(G: GameState, input: InputState, dt: number): void {
  const P = G.player;
  if (P.forced) { moveForced(P, dt); return; }
  if (P.stun > G.t) return;
  let mx = axis(input.keys, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
  let my = axis(input.keys, ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
  let L = Math.hypot(mx, my);
  let s = speedOf(G, P) * dt;
  if (L > 0) input.moveTo = null;
  else if (input.moveTo) {
    // 滑鼠點地面：朝那個點走，到了就停
    mx = input.moveTo.x - P.x; my = input.moveTo.y - P.y; L = Math.hypot(mx, my);
    if (L <= s) { s = L; input.moveTo = null; }
  }
  if (L > 0) {
    mx /= L; my /= L;
    P.x += mx * s;
    P.y += my * s;
    if (G.cfg.auto && !input.rmb) P.face = angOf(mx, my);
  }
  if (input.rmb) {
    const dx = input.mouse.x - P.x, dy = input.mouse.y - P.y;
    if (Math.hypot(dx, dy) > 0.3) P.face = angOf(dx, dy);
  }
}

function moveBot(G: GameState, e: Entity, dt: number): void {
  if (e.forced) moveForced(e, dt);
  else if (!(e.stun > G.t)) {
    const tg = e.ov || e.mt;
    if (tg) {
      const dx = tg.x - e.x, dy = tg.y - e.y, d = Math.hypot(dx, dy), s = speedOf(G, e) * dt;
      if (d > 0.05) {
        if (d <= s) { e.x = tg.x; e.y = tg.y; } else {
          // 直走會踩進地面區域（目標不在區域裡）：往左右偏轉繞過去
          let a = angOf(dx, dy);
          if (!inZone(G, tg, 0.1) && !inZone(G, e, 0.1)) {
            const look = Math.min(d, 2);
            const blocked = (b: number): boolean => inZone(G, { x: e.x + Math.sin(b) * look, y: e.y - Math.cos(b) * look }, 0.6);
            if (blocked(a)) {
              for (const k of [1, 2, 3, 4, 5, 6]) {
                const off = (k * Math.PI) / 12;
                if (!blocked(a + off)) { a += off; break; }
                if (!blocked(a - off)) { a -= off; break; }
              }
            }
          }
          e.x += Math.sin(a) * s; e.y -= Math.cos(a) * s; e.face = a;
        }
      }
    }
  }
  if (e.faceLock != null) e.face = e.faceLock;
}

/** 地面區域：站進去就受傷（每 2 秒最多記一次） */
function zoneCheck(G: GameState, e: Entity): void {
  const z = G.zones.find((x) => x.from <= G.t && x.until > G.t && hitShape(e, x.shape));
  if (!z || (e.zoneAt ?? -Infinity) > G.t - 2) return;
  e.zoneAt = G.t;
  if (e === G.player && !G.auto) hurtPlayer(G, z.tag, z.why, !!z.lethal);
  else if (e === G.player) hurtPlayer(G, z.tag, z.why, false);
  else botHit(G, e, z.tag, z.why);
}

const EDGE_WHY = { fall: '掉出場地', death: '碰到場邊的死亡牆', wall: '' } as const;

/** 場邊：空氣牆擋住；掉落／死亡牆＝致命 */
function edgeCheck(G: GameState, e: Entity): void {
  if (onFloor(G.arena, e)) return;
  if (G.arena.edge === 'wall') { const q = clampIn(G.arena, e, 0.01); e.x = q.x; e.y = q.y; return; }
  if (e.isPlayer && !G.auto) {
    e.fellAt = G.t;
    hurtPlayer(G, '場邊', EDGE_WHY[G.arena.edge], true);
    return;
  }
  // 隊友（與示範中的玩家角色）被打出場地：記一次 Bot 失誤，夾回場內繼續（不讓畫面上少人）
  if (!((e.fellAt ?? -Infinity) > G.t - 1)) {
    if (e.isPlayer) hurtPlayer(G, '場邊', EDGE_WHY[G.arena.edge], true);
    else botHit(G, e, '場邊', EDGE_WHY[G.arena.edge]);
  }
  e.fellAt = G.t;
  const q = clampIn(G.arena, e, 1);
  e.x = q.x; e.y = q.y;
}

export function step(G: GameState, input: InputState, dt: number): void {
  if (G.state === 'count') {
    G.countT -= dt;
    if (G.countT <= 0) G.state = 'run';
    return;
  }
  if (G.state !== 'run') return;
  G.ents.forEach((e) => { e.px = e.x; e.py = e.y; e.pface = e.face; });
  G.bosses.forEach((b) => { b.px = b.x; b.py = b.y; b.pface = b.face; });
  G.t += dt;
  G.ev.runUntil(G.t);
  G.bosses.forEach((b) => {
    if (!b.mv) return;
    const k = Math.min(1, (G.t - b.mv.t0) / (b.mv.t1 - b.mv.t0));
    b.x = b.mv.fx + (b.mv.tx - b.mv.fx) * k;
    b.y = b.mv.fy + (b.mv.ty - b.mv.fy) * k;
    if (k >= 1) b.mv = undefined;
  });
  const P = G.player;
  if (!P.dead && !G.auto) { movePlayer(G, input, dt); edgeCheck(G, P); }
  G.ents.forEach((e) => {
    if (!isBot(G, e) || e.dead || e.away) return;
    moveBot(G, e, dt);
    edgeCheck(G, e);
  });
  if (G.zones.length) {
    G.ents.forEach((e) => { if (!e.dead && !e.away) zoneCheck(G, e); });
    G.zones = G.zones.filter((z) => z.until > G.t);
  }
  G.ents.forEach((e) => { if (e.statuses.length) e.statuses = e.statuses.filter((s) => s.until > G.t); });
  // 預兆到時間 = 判定瞬間：留下爆發特效
  G.tele.forEach((t) => {
    if (t.until <= G.t) { G.fx.push({ k: 'burst', tele: t, start: G.t, until: G.t + 0.4 }); G.sfx.push('hit'); }
  });
  G.tele = G.tele.filter((t) => t.until > G.t);
  G.fx = G.fx.filter((f) => f.until > G.t);
  G.objs = G.objs.filter((o) => o.until > G.t);
  G.toasts = G.toasts.filter((t) => t.until > G.t);
  if (G.t >= G.endT) finish(G);
}

export function finish(G: GameState): void {
  G.state = 'end';
  G.result = { ok: G.fails.length === 0 && !G.player.dead };
}
