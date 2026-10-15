/*
 * 職能判定：血量、護盾、減傷、挑釁（數值都是估計、簡化過的）。
 *   死刑（tankHit）：被點的坦克扣 HP.buster（減傷 ×mitMul、護盾先吸收）。
 *   全場 AOE（partyHit）：全員扣 HP.raid（團隊減傷 ×rmitMul、護盾先吸收）。
 *   補血：玩家是補師（自己練）時，自己那隊只有玩家在補；其他隊（與玩家不是補師時）補師 Bot 在 botHeal 秒後補滿。
 *   挑釁（needProvoke）：開場、換王、轉場時，那隻王的坦克要在 provokeWin 秒內挑釁；挑了別隊坦克的王＝失誤。
 *   技能判定：該用的技能「冷卻好了卻沒用」＝失誤；還在冷卻、技能列沒放＝提醒。
 * 示範模式（G.auto）：玩家角色照攻略自動用技能，頭上跳字顯示用了什麼。
 */
import { roleType, ROLE_NAME, type Alliance, type RoleType } from '../core/constants';
import type { ActType } from '../core/config';
import { dist } from '../core/geometry';
import { at, bossById, hasBuff, partyOf, present, type Entity, type GameState } from './state';
import { bad, good, hurtPlayer, warn } from './results';

export const HP = {
  /** 死刑、全場 AOE 的傷害（滿血 100） */
  buster: 80, raid: 40,
  /** 坦克減傷、團隊減傷的倍率 */
  mitMul: 0.6, rmitMul: 0.9,
  /** 單盾、群盾吸收量；群補回復量 */
  shield: 30, aoeShield: 15, heal: 35,
  /** 補師 Bot 幾秒後補滿；玩家補師在受傷後幾秒檢查血量；全場 AOE 後隊伍平均、死刑後坦克要補到多少 */
  botHeal: 2, check: 6, raidOk: 80, tankOk: 70,
  /** 挑釁距離（公尺，從王的目標圈邊緣算）；開場／轉場後幾秒內要挑釁 */
  provokeR: 25, provokeWin: 6,
};

const NAME: Partial<Record<ActType, string>> = { provoke: '挑釁', mit: '減傷', shield: '單盾', aoeHeal: '群補', aoeShield: '群盾', raidMit: '團隊減傷' };
const POP_COL: Record<RoleType, string> = { tank: '#2f56b0', heal: '#1d7040', dps: '#a83434' };

/** 頭上跳字 */
export function pop(G: GameState, e: Entity, text: string, col?: string): void {
  G.fx.push({ k: 'pop', to: e, text, col: col ?? POP_COL[roleType(e.role)], start: G.t, until: G.t + 1.4 });
}

/** 玩家自己操作中（不是示範、還活著） */
const live = (G: GameState): boolean => !G.auto && !G.player.dead;
const isRole = (G: GameState, rt: RoleType): boolean => roleType(G.player.role) === rt;
export const tankOf = (G: GameState, al: Alliance): Entity => G.ents.find((e) => e.al === al && e.role === 'MT')!;
/** 拉第一隻王的坦克（一仇） */
export const mainTank = (G: GameState): Entity => tankOf(G, G.owner[G.bosses[0].id] ?? 'A');
const mates = (G: GameState, al: Alliance): Entity[] => present(G).filter((e) => e.al === al);
/** 這個人只靠玩家補（玩家是補師、自己練、同一隊） */
const selfHealed = (G: GameState, e: Entity): boolean => live(G) && isRole(G, 'heal') && e.al === G.player.al;

/** 護盾：沒過期的話疊上去（上限 45） */
function addShield(G: GameState, e: Entity, amt: number, dur: number): void {
  const cur = e.shield && e.shield.until > G.t ? e.shield.amt : 0;
  e.shield = { amt: Math.min(45, cur + amt), until: Math.max(G.t + dur, e.shield?.until ?? 0) };
}
const hasShield = (G: GameState, e: Entity): boolean => !!e.shield && e.shield.until > G.t && e.shield.amt > 0;

function healParty(G: GameState, al: Alliance, amt: number): void {
  mates(G, al).forEach((e) => { e.hp = Math.min(100, e.hp + amt); });
}

/** 扣血：減傷 → 護盾吸收 → 血量；歸零時記失誤（隊友留 1 滴血繼續，不讓畫面少人） */
export function damage(G: GameState, e: Entity, amt: number, tag: string): void {
  if (e.dead || e.away) return;
  let d = amt;
  if (hasBuff(G, e, 'mit')) d *= HP.mitMul;
  if (hasBuff(G, e, 'rmit')) d *= HP.rmitMul;
  if (hasShield(G, e)) {
    const a = Math.min(e.shield!.amt, d);
    e.shield!.amt -= a; d -= a;
    if (e.shield!.amt <= 0) e.shield = undefined;
  }
  e.hp = Math.max(0, e.hp - d);
  if (e.hp > 0) return;
  if (e === G.player) { if (live(G)) hurtPlayer(G, tag, '血量歸零', true); else e.hp = 1; return; }
  e.hp = 1;
  if (selfHealed(G, e)) bad(G, tag, `${ROLE_NAME[e.role]}血量歸零（沒補起來）`);
}

/** 該用的技能：用了＝成功；冷卻好了卻沒用＝失誤；還在冷卻、技能列沒放＝提醒 */
function rule(G: GameState, type: ActType, ok: boolean, tag: string, okText: string): void {
  const name = NAME[type]!;
  if (ok) { good(G, tag, okText); return; }
  const i = G.cfg.acts.findIndex((a) => a.type === type);
  if (i < 0) warn(G, tag, `技能列沒有「${name}」（設定裡可以加）`);
  else if ((G.cds[i] || 0) > G.t - 0.5) warn(G, tag, `沒有${name}（還在冷卻）`);
  else bad(G, tag, `沒用${name}（冷卻已經好了）`);
}

/** 受傷後：Bot 補師補滿；示範的補師用群補；玩家補師幾秒後檢查血量 */
function afterHit(G: GameState, hit: Entity[], tag: string, tb: boolean): void {
  const P = G.player;
  at(G, G.t + HP.botHeal, () => present(G).forEach((e) => { if (!selfHealed(G, e)) e.hp = 100; }));
  if (G.auto && isRole(G, 'heal')) at(G, G.t + 1.2, () => { healParty(G, P.al, HP.heal); pop(G, P, '群補'); });
  if (!live(G) || !isRole(G, 'heal') || !hit.some((e) => e.al === P.al)) return;
  const t0 = G.t;
  at(G, t0 + HP.check, () => {
    if (!live(G)) return;
    const k = `${tag}（補血）`;
    if (tb) {
      const tk = tankOf(G, P.al);
      if (tk.hp >= HP.tankOk) good(G, k, '死刑後把坦克補起來');
      else bad(G, k, `死刑後坦克只剩 ${Math.round(tk.hp)}%：用群補補回來`);
    } else {
      const party = partyOf(G, P), avg = party.reduce((s, e) => s + e.hp, 0) / Math.max(1, party.length);
      if (avg >= HP.raidOk) good(G, k, '全場 AOE 後把隊伍補起來');
      else bad(G, k, `全場 AOE 後隊伍平均只剩 ${Math.round(avg)}%：用群補補回來`);
    }
  });
}

/** 死刑：t 判定；被點的坦克扣血。玩家坦克要開減傷、玩家補師要給自己隊的坦克上單盾 */
export function tankHit(G: GameState, t: number, targets: Entity[], tag: string): void {
  at(G, t - 1.5, () => targets.forEach((e) => {
    const P = G.player;
    // Bot 坦克（與示範中的玩家）開減傷；不是玩家在補的坦克由補師 Bot 上盾
    if (!(live(G) && e === P)) { e.buffs.mit = G.t + 10; if (e === P) pop(G, e, '減傷'); }
    if (!selfHealed(G, e)) { addShield(G, e, HP.shield, 15); if (G.auto && isRole(G, 'heal') && e.al === P.al) pop(G, e, '單盾', POP_COL.heal); }
  }));
  at(G, t, () => {
    const P = G.player;
    targets.forEach((e) => {
      if (live(G) && e === P) rule(G, 'mit', hasBuff(G, P, 'mit'), `${tag}（減傷）`, '死刑時開著減傷');
      if (selfHealed(G, e) && e.role === 'MT') rule(G, 'shield', hasShield(G, e), `${tag}（單盾）`, '死刑前給坦克上了單盾');
      damage(G, e, HP.buster, tag);
    });
    afterHit(G, targets, tag, true);
  });
}

/** 全場 AOE：t 判定；全員扣血。玩家補師要先上群盾、玩家 DPS 能開團隊減傷就要開 */
export function partyHit(G: GameState, t: number, tag: string): void {
  at(G, t - 2, () => {
    const P = G.player;
    present(G).forEach((e) => { if (!selfHealed(G, e)) addShield(G, e, HP.aoeShield, 15); });
    if (G.auto && isRole(G, 'heal')) pop(G, P, '群盾');
    if (G.auto && isRole(G, 'dps')) { mates(G, P.al).forEach((e) => { e.buffs.rmit = G.t + 15; }); pop(G, P, '團隊減傷'); }
  });
  at(G, t, () => {
    const P = G.player;
    if (live(G) && isRole(G, 'dps')) rule(G, 'raidMit', hasBuff(G, P, 'rmit'), `${tag}（團隊減傷）`, '全場 AOE 時開著團隊減傷');
    if (live(G) && isRole(G, 'heal')) rule(G, 'aoeShield', partyOf(G, P).every((e) => hasShield(G, e)), `${tag}（群盾）`, '全場 AOE 前上了群盾');
    const hit = present(G);
    hit.forEach((e) => damage(G, e, HP.raid, tag));
    afterHit(G, hit, tag, false);
  });
}

/** 開場、換王、轉場：al 隊的坦克要在 provokeWin 秒內挑釁 id 這隻王 */
export function needProvoke(G: GameState, t: number, al: Alliance, id: string): void {
  at(G, t, () => { G.owner[id] = al; });
  const mine = (): boolean => G.player.role === 'MT' && G.player.al === al;
  at(G, t + 0.8, () => {
    if (!G.auto || !mine()) return;
    G.provokes.push({ t: G.t, id });
    pop(G, G.player, `挑釁 → ${bossById(G, id).name}`);
  });
  at(G, t + HP.provokeWin, () => {
    if (G.auto || !mine() || G.player.dead) return;
    const name = bossById(G, id).name;
    if (G.provokes.some((p) => p.id === id && p.t >= t - 1)) good(G, '挑釁', `挑釁了 ${name}`);
    else bad(G, '挑釁', `${HP.provokeWin} 秒內沒挑釁 ${name}（要在 ${HP.provokeR} m 內）`);
  });
}


/** 玩家按職能技能；成功回傳 true */
export function useRoleAct(G: GameState, type: ActType, dur: number): boolean {
  const P = G.player;
  switch (type) {
    case 'provoke': {
      const near = G.bosses.filter((b) => !b.hidden).map((b) => ({ b, d: dist(P, b) - b.r })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > HP.provokeR) { G.toasts.push({ text: `挑釁：${HP.provokeR} m 內沒有王`, until: G.t + 2 }); return false; }
      G.provokes.push({ t: G.t, id: near.b.id });
      pop(G, P, `挑釁 → ${near.b.name}`);
      const own = G.owner[near.b.id];
      if (live(G) && own && (own !== P.al || P.role !== 'MT')) bad(G, '挑釁', `挑了 ${near.b.name}（這隻由 ${own} 隊坦克拉）`);
      return true;
    }
    case 'mit': P.buffs.mit = G.t + dur; pop(G, P, '減傷'); return true;
    case 'shield': { const tk = tankOf(G, P.al); if (tk.dead || tk.away) return false; addShield(G, tk, HP.shield, dur); pop(G, tk, '單盾', POP_COL.heal); return true; }
    case 'aoeShield': mates(G, P.al).forEach((e) => addShield(G, e, HP.aoeShield, dur)); pop(G, P, '群盾'); return true;
    case 'aoeHeal': healParty(G, P.al, HP.heal); pop(G, P, '群補'); return true;
    case 'raidMit': mates(G, P.al).forEach((e) => { e.buffs.rmit = G.t + dur; }); pop(G, P, '團隊減傷'); return true;
    default: return false;
  }
}
