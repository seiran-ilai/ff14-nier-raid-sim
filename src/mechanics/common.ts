/*
 * 通用機制積木：各副本的機制用這些組出來（每個都有預兆、Bot 跑位、玩家判定、Bot 判定）。
 *   aoe       地面 AOE（任何形狀）：碰到＝失誤；Bot 沒有指定站位時自動躲到最近的安全點
 *   stack     分攤：點名的人頭上出標記，自己那組的人要進他的圈
 *   spread    分散：點名的人圈圈不能碰到別人
 *   knockback 擊退：從某點往外推；開防擊退不會動
 *   towers    踩塔：被分配的人進塔，人數不夠就失誤
 *   gaze      背對（凝視）：判定時不能面向來源
 * 時間參數 t 都是「判定瞬間」；show 是預兆提前幾秒出現。
 */
import type { Vec } from '../core/constants';
import { hitShape, hitCircle, insideCircle, type Shape } from '../core/shapes';
import { angDiff, angTo, dist } from '../core/geometry';
import { onFloor } from '../core/arena';
import { GAZE_ANGLE, REACT, RUN, TELE_SHOW } from '../core/tuning';
import { at, bossById, force, hasBuff, present, seqAdd, setCast, type Entity, type Fix, type GameState, type Telegraph, type Zone } from '../game/state';
import { good, bad, hurtPlayer, botHit } from '../game/results';
import { dodge, findSafe, npcs } from '../game/bots';

const alive = present;

/** 詠唱：t 開始詠唱、加進時間軸；回傳詠唱結束的時間 */
export function castAt(G: GameState, t: number, name: string, dur: number, tip?: string, who?: string, seq = true): number {
  if (seq) seqAdd(G, t, name);
  at(G, t, () => setCast(G, name, dur, tip, who));
  return t + dur;
}

/** 全場 AOE（不用走位）：只有詠唱與畫面閃光 */
export function raidwide(G: GameState, t: number, name: string, dur: number, tip = '全場 AOE：不用走位，補師注意抬血', who?: string): number {
  const end = castAt(G, t, name, dur, tip, who);
  at(G, end, () => { G.fx.push({ k: 'flash', until: G.t + 0.25 }); G.sfx.push('hit'); });
  return end;
}

/** 在 t 檢查：since 之後這個機制（tag）玩家都沒失誤 → 記一次成功（一個機制有很多發時用） */
export function passIf(G: GameState, t: number, tag: string, since: number, text: string, fix?: (G: GameState) => Fix): void {
  at(G, t, () => {
    if (G.player.dead) return;
    if (G.checks.some((c) => c.tag === tag && !c.ok && !c.warn && c.t >= since)) return;
    good(G, tag, text, fix?.(G));
  });
}

/** 地面區域：from～until 之間站進去就受傷 */
export function zone(G: GameState, at0: number, z: Omit<Zone, 'from'> & { from?: number }): void {
  at(G, at0, () => { G.zones.push({ from: at0, ...z }); });
}

export interface AoeOpts {
  tag: string;
  /** 預兆提前幾秒出現（預設 TELE_SHOW） */
  show?: number;
  /** 被打中的說明 */
  why?: string;
  /** 致命（陣亡）；預設否 */
  lethal?: boolean;
  /** 躲開時的說明；null＝躲開不記成功（同一個機制有好幾發時只記一次） */
  ok?: string | null;
  fix?: (G: GameState) => Fix;
  /** Bot 自動躲（預設是）；機制自己安排站位時設 false */
  dodge?: boolean;
  col?: Telegraph['col'];
  /** 地面預兆實際畫出來的秒數（比 show 短＝預兆很晚才出現，要看詠唱名稱提前躲；預設同 show） */
  visible?: number;
  /** 只判定這些人（例如只打某一隊）；預設全部 */
  only?: (e: Entity) => boolean;
}

/** 地面 AOE：t 判定，預兆提前 show 秒出現 */
export function aoe(G: GameState, t: number, shapes: Shape | Shape[], o: AoeOpts): void {
  const list = Array.isArray(shapes) ? shapes : [shapes];
  const show = o.show ?? TELE_SHOW, vis = Math.min(show, o.visible ?? show);
  const teles: Telegraph[] = list.map((s) => ({ ...s, until: t, start: t - vis, col: o.col }));
  at(G, t - vis, () => { G.tele.push(...teles); });
  if (o.dodge !== false) at(G, t - show + Math.min(REACT, show * 0.3), () => dodge(G, teles, t));
  at(G, t, () => {
    const P = G.player;
    alive(G).forEach((e) => {
      if (o.only && !o.only(e)) return;
      const hit = list.some((s) => hitShape(e, s));
      if (e === P) {
        if (hit) hurtPlayer(G, o.tag, o.why ?? '被 AOE 打中', !!o.lethal, o.fix?.(G));
        else if (o.ok !== null) good(G, o.tag, o.ok ?? '躲開了', o.fix?.(G));
      } else if (hit) botHit(G, e, o.tag, o.why ?? '被 AOE 打中');
    });
  });
}

export interface StackOpts {
  tag: string;
  show?: number;
  /** 分攤圈半徑 */
  r: number;
  /** 被點名的人 */
  targets: Entity[];
  /** 每個人要進哪個點名者的圈（沒有＝哪個都可以） */
  groupOf?: (e: Entity) => Entity | null;
  /** 點名者要站的位置（沒有＝原地） */
  spot?: (target: Entity) => Vec;
  /** 每個分攤至少幾人（不含就是不檢查） */
  need?: number;
}

/** 分攤：點名者頭上出現標記；t 判定，圈裡的人平分傷害 */
export function stack(G: GameState, t: number, o: StackOpts): void {
  const show = o.show ?? TELE_SHOW;
  const spotOf = (tg: Entity): Vec => (o.spot ? o.spot(tg) : tg);
  at(G, t - show, () => {
    o.targets.forEach((tg) => { tg.marker = { kind: 'stack', until: t, r: o.r }; });
    const P = G.player, mine = o.groupOf ? o.groupOf(P) : null;
    if (mine) G.hints = [{ ...spotOf(mine), r: o.r, label: mine === P ? '你是分攤目標' : '進這個分攤' }];
  });
  at(G, t - show + REACT, () => npcs(G).forEach((e) => {
    const g = o.targets.includes(e) ? e : o.groupOf ? o.groupOf(e) : o.targets[0];
    if (!g) return;
    const s = spotOf(g);
    // 點名者站定位置，其他人圍在旁邊（在圈內）
    e.mt = g === e ? { ...s } : { x: s.x + G.rng.rnd(-1, 1) * o.r * 0.45, y: s.y + G.rng.rnd(-1, 1) * o.r * 0.45 };
  }));
  at(G, t, () => {
    G.hints = [];
    const P = G.player, all = alive(G);
    o.targets.forEach((tg) => G.fx.push({ k: 'stack', x: tg.x, y: tg.y, r: o.r, until: G.t + 0.7 }));
    const count = new Map(o.targets.map((tg) => [tg, all.filter((e) => hitCircle(e, tg, o.r)).length]));
    all.forEach((e) => {
      const g = o.groupOf ? o.groupOf(e) : null;
      // groupOf 回傳 null＝這個人不用分攤（例如同時被點名去分散的人）
      if (o.groupOf && !g) return;
      const inMine = g ? hitCircle(e, g, o.r) : o.targets.some((tg) => hitCircle(e, tg, o.r));
      const short = g && o.need ? (count.get(g) ?? 0) < o.need : false;
      const fix = g ? { x: g.x, y: g.y, r: o.r, label: g === e ? '你是分攤目標，等隊友過來' : '進分攤圈' } : undefined;
      if (e === P) {
        if (!inMine) bad(G, o.tag, g === P ? '你是分攤目標，但隊友沒在你的圈裡' : '沒進分攤圈', fix);
        else if (short) bad(G, o.tag, `分攤人數不夠（${count.get(g!)}／${o.need}）`, fix);
        else good(G, o.tag, '分攤成功', fix);
      } else if (!inMine && g) botHit(G, e, o.tag, '沒進分攤');
    });
  });
}

export interface SpreadOpts {
  tag: string;
  show?: number;
  r: number;
  targets: Entity[];
  /** 點名者要站的位置（第 i 個點名者） */
  spot: (e: Entity, i: number) => Vec;
  /** 沒被點名的人要站的位置（沒有＝留在原地） */
  rest?: (e: Entity) => Vec;
}

/** 分散：點名者腳下圓形 AOE，碰到別人＝失誤 */
export function spread(G: GameState, t: number, o: SpreadOpts): void {
  const show = o.show ?? TELE_SHOW;
  at(G, t - show, () => {
    o.targets.forEach((tg) => { tg.marker = { kind: 'spread', until: t, r: o.r }; });
    const P = G.player, i = o.targets.indexOf(P);
    G.hints = i >= 0 ? [{ ...o.spot(P, i), r: 1.4, label: '分散到這裡' }] : o.rest ? [{ ...o.rest(P), r: 1.4, label: '在這裡等' }] : [];
  });
  at(G, t - show + REACT, () => npcs(G).forEach((e) => {
    const i = o.targets.indexOf(e);
    if (i >= 0) e.mt = o.spot(e, i); else if (o.rest) e.mt = o.rest(e);
  }));
  at(G, t, () => {
    G.hints = [];
    const P = G.player, all = alive(G);
    o.targets.forEach((tg) => { if (!tg.dead) G.fx.push({ k: 'stack', x: tg.x, y: tg.y, r: o.r, until: G.t + 0.5 }); });
    all.forEach((e) => {
      const mine = o.targets.indexOf(e);
      const inOthers = o.targets.some((tg) => tg !== e && !tg.dead && hitCircle(e, tg, o.r));
      const hitsOthers = mine >= 0 && all.some((x) => x !== e && hitCircle(x, e, o.r));
      const fix = mine >= 0 ? { ...o.spot(e, mine), r: 1.4, label: '分散位置' } : o.rest ? { ...o.rest(e), r: 1.4, label: '離開分散圈' } : undefined;
      if (e === P) {
        if (hitsOthers) bad(G, o.tag, '你的分散圈碰到隊友', fix);
        else if (inOthers) bad(G, o.tag, '站在別人的分散圈裡', fix);
        else good(G, o.tag, mine >= 0 ? '分散成功' : '沒碰到別人的分散圈', fix);
      } else if (hitsOthers || inOthers) botHit(G, e, o.tag, hitsOthers ? '分散圈碰到別人' : '站在別人的分散圈裡');
    });
  });
}

export interface KbOpts {
  tag: string;
  show?: number;
  /** 擊退來源（王的 id 或一個點） */
  from: string | Vec;
  dist: number;
  /** 擊退花的秒數 */
  time?: number;
  /** Bot 事先站的位置（沒有＝不動） */
  spot?: (e: Entity) => Vec;
  /** Bot 開防擊退 */
  akbBots?: boolean;
  fix?: (G: GameState) => Fix;
}

/** 擊退：t 瞬間從來源往外推 dist 公尺（防擊退有效） */
export function knockback(G: GameState, t: number, o: KbOpts): void {
  const show = o.show ?? TELE_SHOW, time = o.time ?? 0.6;
  const src = (): Vec => (typeof o.from === 'string' ? bossById(G, o.from) : o.from);
  if (o.spot) at(G, t - show + REACT, () => npcs(G).forEach((e) => { e.mt = o.spot!(e); }));
  if (o.akbBots) at(G, t - 0.5, () => npcs(G).forEach((e) => { e.buffs.akb = Math.max(e.buffs.akb ?? 0, t + 0.5); }));
  let akb = false;
  at(G, t, () => {
    const c = src();
    akb = hasBuff(G, G.player, 'akb');
    G.fx.push({ k: 'kb', x: c.x, y: c.y, until: G.t + 0.7 });
    alive(G).forEach((e) => {
      if (hasBuff(G, e, 'akb')) return;
      const d = dist(e, c);
      const a = d < 0.01 ? G.rng.rnd(0, Math.PI * 2) : Math.atan2(e.x - c.x, -(e.y - c.y));
      force(e, Math.sin(a), -Math.cos(a), o.dist, time);
    });
  });
  at(G, t + time + 0.2, () => {
    const P = G.player;
    if (P.dead || (P.fellAt ?? -Infinity) > t) return;
    if (onFloor(G.arena, P)) good(G, o.tag, akb ? '開了防擊退，沒被擊退' : '被擊退後還在場上', o.fix?.(G));
  });
}

export interface TowerDef { x: number; y: number; r: number; need: number; label?: string }
export interface TowerOpts {
  tag: string;
  show?: number;
  list: TowerDef[];
  /** 每個人要踩哪座塔（index）；null＝不用踩、要離開所有塔 */
  assign: (e: Entity) => number | null;
}

/** 踩塔：t 判定，每座塔要有足夠人數；不用踩的人不要進塔 */
export function towers(G: GameState, t: number, o: TowerOpts): void {
  const show = o.show ?? TELE_SHOW;
  at(G, t - show, () => {
    o.list.forEach((d) => G.objs.push({ k: 'tower', ...d, until: t }));
    const i = o.assign(G.player);
    G.hints = i == null ? [] : [{ x: o.list[i].x, y: o.list[i].y, r: o.list[i].r, label: '踩這座塔' }];
  });
  at(G, t - show + REACT, () => npcs(G).forEach((e) => {
    const i = o.assign(e);
    if (i == null) return;
    const d = o.list[i], k = Math.max(0, d.r - 1.2);
    e.mt = { x: d.x + G.rng.rnd(-k, k) * 0.7, y: d.y + G.rng.rnd(-k, k) * 0.7 };
  }));
  at(G, t, () => {
    G.hints = [];
    const P = G.player, all = alive(G);
    const n = o.list.map((d) => all.filter((e) => insideCircle(e, d, d.r)).length);
    o.list.forEach((d) => { G.fx.push({ k: 'stack', x: d.x, y: d.y, r: d.r, until: G.t + 0.6 }); });
    all.forEach((e) => {
      const i = o.assign(e), inAny = o.list.findIndex((d) => insideCircle(e, d, d.r));
      const fix = i == null ? undefined : { x: o.list[i].x, y: o.list[i].y, r: o.list[i].r, label: o.list[i].label ?? '自己的塔' };
      const okSpot = i == null ? inAny < 0 : insideCircle(e, o.list[i], o.list[i].r);
      if (e === P) {
        if (!okSpot) bad(G, o.tag, i == null ? '不用踩塔卻站進塔裡' : inAny >= 0 ? '踩錯塔' : '沒踩塔', fix);
        else if (i != null && n[i] < o.list[i].need) bad(G, o.tag, `塔的人數不夠（${n[i]}／${o.list[i].need}）`, fix);
        else good(G, o.tag, i == null ? '沒有進塔' : '踩塔成功', fix);
      } else if (!okSpot) botHit(G, e, o.tag, i == null ? '不該進塔' : '沒踩到自己的塔');
    });
  });
}

export interface BusterOpts {
  tag: string;
  show?: number;
  /** 被點名的人（通常是坦克） */
  targets: Entity[];
  /** 圓形範圍半徑 */
  r: number;
  /** 點名者（Bot）要站的位置（沒有＝原地） */
  spot?: (e: Entity) => Vec;
  /** 標記種類（預設死刑） */
  kind?: 'tb' | 'target';
  why?: string;
}

/** 點名圓形（坦克死刑、點名大圈）：被點的人到旁邊吃，其他人不能在圈裡 */
export function buster(G: GameState, t: number, o: BusterOpts): void {
  const show = o.show ?? TELE_SHOW;
  at(G, t - show, () => {
    o.targets.forEach((tg) => { tg.marker = { kind: o.kind ?? 'tb', until: t, r: o.r }; });
    if (o.spot && o.targets.includes(G.player)) G.hints = [{ ...o.spot(G.player), r: 1.4, label: '離開人群吃' }];
  });
  at(G, t - show + REACT, () => {
    npcs(G).forEach((e) => { if (o.targets.includes(e) && o.spot) e.mt = o.spot(e); });
    // 其他人：離點名者的位置（預定位置）遠一點
    const tele: Telegraph[] = o.targets.map((tg) => ({ k: 'circle', ...(o.spot ? o.spot(tg) : { x: tg.x, y: tg.y }), r: o.r + 0.8, until: t }));
    npcs(G).forEach((e) => {
      if (o.targets.includes(e)) return;
      const from = e.ov ?? e.mt ?? e;
      if (tele.some((s) => hitShape(from, s))) { const q = findSafe(G, from, tele); e.ov = q; at(G, t + 0.05, () => { if (e.ov === q) e.ov = null; }); }
    });
  });
  at(G, t, () => {
    G.hints = [];
    const P = G.player;
    o.targets.forEach((tg) => G.fx.push({ k: 'stack', x: tg.x, y: tg.y, r: o.r, until: G.t + 0.5 }));
    alive(G).forEach((e) => {
      const mine = o.targets.includes(e);
      const hitOther = o.targets.some((tg) => tg !== e && hitCircle(e, tg, o.r));
      const hitsOthers = mine && alive(G).some((x) => x !== e && !o.targets.includes(x) && hitCircle(x, e, o.r));
      if (e === P) {
        const fix = mine && o.spot ? { ...o.spot(e), r: 1.4, label: '離開人群' } : undefined;
        if (hitsOthers) bad(G, o.tag, o.why ?? '點名圈打到隊友', fix);
        else if (hitOther) bad(G, o.tag, '站在別人的點名圈裡', fix);
        else good(G, o.tag, mine ? '離開人群吃下點名' : '沒站在點名圈裡', fix);
      } else if (hitOther || hitsOthers) botHit(G, e, o.tag, hitOther ? '站在別人的點名圈裡' : '點名圈打到隊友');
    });
  });
}

export interface LineStackOpts {
  tag: string;
  show?: number;
  /** 直線起點（王的 id、一個點，或依點名者決定，例如每隊從自己的王打出） */
  from: string | Vec | ((target: Entity) => Vec);
  targets: Entity[];
  /** 每個人要進哪條線 */
  groupOf: (e: Entity) => Entity | null;
  /** 線寬、長度 */
  w: number;
  len: number;
  /** 點名者（Bot）要站的位置（沒有＝原地）；其他人排在這個位置後面 */
  spot?: (target: Entity) => Vec;
}

/** 直線分攤：從王朝點名者打出直線，自己那組的人要站進線裡 */
export function lineStack(G: GameState, t: number, o: LineStackOpts): void {
  const show = o.show ?? TELE_SHOW;
  const src = (tg: Entity): Vec => { const f = o.from; const p = typeof f === 'string' ? bossById(G, f) : typeof f === 'function' ? f(tg) : f; return { x: p.x, y: p.y }; };
  const rectOf = (tg: Entity): Shape => { const s = src(tg); return { k: 'rect', O: s, H: angTo(s, tg), len: o.len, w: o.w }; };
  at(G, t - show, () => { o.targets.forEach((tg) => { tg.marker = { kind: 'target', until: t, label: '直線分攤' }; }); });
  at(G, t - show + REACT, () => npcs(G).forEach((e) => {
    const g = o.groupOf(e);
    if (!g) return;
    const gp = o.spot ? o.spot(g) : { x: g.x, y: g.y };
    if (g === e) { e.mt = { ...gp }; return; }
    // 站在點名者後面（離王更遠一點），在線上
    const s = src(g), a = angTo(s, gp), d = dist(s, gp);
    e.mt = { x: s.x + Math.sin(a) * (d + 1.5 + G.rng.rnd(0, 1.5)), y: s.y - Math.cos(a) * (d + 1.5 + G.rng.rnd(0, 1.5)) };
  }));
  let lines: Telegraph[] = [];
  at(G, t - 1.2, () => { lines = o.targets.map((tg) => ({ ...rectOf(tg), until: t, col: 'purple' as const })); G.tele.push(...lines); });
  at(G, t, () => {
    const P = G.player;
    alive(G).forEach((e) => {
      const g = o.groupOf(e);
      const k = g ? o.targets.indexOf(g) : -1;
      const inMine = k >= 0 && lines[k] ? hitShape(e, lines[k]) : true;
      const inOther = lines.some((l, i) => i !== k && hitShape(e, l));
      if (e === P) {
        const fix = g ? { x: g.x, y: g.y, r: 2, label: '站進自己隊伍的直線（點名者身後）' } : undefined;
        if (!inMine) bad(G, o.tag, '沒站進自己隊伍的直線分攤', fix);
        else if (inOther) bad(G, o.tag, '同時吃到別隊的直線', fix);
        else good(G, o.tag, '直線分攤成功', fix);
      } else if (!inMine || inOther) botHit(G, e, o.tag, inMine ? '吃到別隊的直線' : '沒進直線分攤');
    });
  });
}

/** Bot 從 pts[0] 出發，依序走過每個點（到了一個點就換下一個）；t 時從 pts[0] 往 pts[1] 出發 */
export function walk(G: GameState, e: Entity, t: number, pts: Vec[]): void {
  let tt = t;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    at(G, tt, () => { e.mt = { ...q }; });
    tt += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) / RUN - 0.05;
  }
}

export interface ChaseOpts {
  tag: string;
  /** 被追的人 */
  targets: Entity[];
  /** 連炸幾次、間隔、落在幾秒前的位置（預兆也提前這麼多秒）、圓形半徑 */
  n: number;
  gap: number;
  lag: number;
  r: number;
  /** 被追的人（Bot）要跑的路線：第一個點是起點 */
  lane: (e: Entity) => Vec[];
  /** 標記到第一發之間的秒數（Bot 先到起點） */
  lead: number;
  why?: string;
}

/** 追蹤型 AOE：追著點名者連炸 n 次（落在他 lag 秒前的位置）；被追的人要一直跑。回傳最後一發的時間 */
export function chase(G: GameState, t0: number, o: ChaseOpts): number {
  const tc = t0 + o.lead, last = tc + (o.n - 1) * o.gap;
  at(G, t0, () => {
    o.targets.forEach((e) => { e.marker = { kind: 'target', until: last, label: '追蹤' }; });
    if (o.targets.includes(G.player)) G.hints = [{ ...o.lane(G.player)[0], r: 1.4, label: '從這裡開始跑' }];
  });
  at(G, t0 + REACT, () => o.targets.forEach((e) => { if (npcs(G).includes(e)) e.mt = { ...o.lane(e)[0] }; }));
  o.targets.forEach((e) => { if (!e.isPlayer || G.auto) walk(G, e, tc - o.lag - 0.2, o.lane(e)); });
  for (let i = 0; i < o.n; i++) {
    const th = tc + i * o.gap;
    at(G, th - o.lag, () => {
      G.hints = [];
      o.targets.forEach((e) => { if (!e.dead) aoe(G, th, { k: 'circle', x: e.x, y: e.y, r: o.r }, { tag: o.tag, show: o.lag, why: o.why ?? '被追蹤的 AOE 炸到', ok: null, dodge: false }); });
    });
  }
  passIf(G, last + 0.05, o.tag, t0, '一直跑，躲開了追蹤 AOE');
  return last;
}

export interface GazeOpts {
  tag: string;
  show?: number;
  /** 視線來源（王的 id 或一個點） */
  src: string | Vec;
  /** 被看到的後果：石化幾秒（0＝只算失誤） */
  stone?: number;
}

/** 背對：t 判定時面向來源 ±GAZE_ANGLE 以內＝中招 */
export function gaze(G: GameState, t: number, o: GazeOpts): void {
  const show = o.show ?? TELE_SHOW;
  const src = (): Vec => { const s = typeof o.src === 'string' ? bossById(G, o.src) : o.src; return { x: s.x, y: s.y }; };
  at(G, t - show, () => { G.fx.push({ k: 'gaze', src: src(), until: t }); });
  at(G, t - show + REACT, () => npcs(G).forEach((e) => { e.faceLock = angTo(src(), e); }));
  at(G, t, () => {
    const s = src(), P = G.player;
    alive(G).forEach((e) => {
      const looking = angDiff(e.face, angTo(e, s)) < GAZE_ANGLE;
      if (looking && o.stone) { e.stun = G.t + o.stone; e.stunKind = 'stone'; }
      if (e === P) {
        const fix = { x: P.x, y: P.y, r: 1.2, face: angTo(s, P), label: '背對來源' };
        if (looking) hurtPlayer(G, o.tag, '判定時面向視線來源', false, fix);
        else good(G, o.tag, '背對成功', fix);
      } else if (looking) botHit(G, e, o.tag, '面向視線來源');
    });
  });
  at(G, t + 0.3, () => npcs(G).forEach((e) => { e.faceLock = null; }));
}
