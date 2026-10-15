/*
 * 尼爾 3 希望之砲台：塔・最終王：偽造的神明 → 開花的神明
 * 資料：機制攻略/尼爾3_希望之砲台塔.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、範圍大小都是估計（T）。
 * 略過：再現：信號燈（單條軌道＋紅衣少女能量彈）、斷唱：白的水平方向。
 */
import { ALS, ROLES, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angDiff, angTo, deg, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { addStatus, alertMsg, at, bossById, encData, present, variant, type Entity, type GameState } from '../../game/state';
import { bad, good, botHit } from '../../game/results';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, buster, castAt, knockback, passIf, raidwide, zone } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { text } from '../../render/canvas';
import type { Encounter } from '../types';
import { TOMES, towerGear } from './shared';
import { clusterHome } from '../layout';

const T = {
  half: 20,
  boss: { x: 0, y: -15 } as Vec,
  release: { cast: 5 },
  /** 斷唱：白——點名 3 人，步進式圓形（半徑、步數、間隔估計） */
  white: { cast: 5, r: 4, steps: 5, step: 4, gap: 0.8 },
  black: { cast: 4.5, r: 6 },
  chorus: { cast: 4, hw: 3, n: 3 },
  magic: { cast: 4, r: 5, n: 6 },
  /** 建築物：安全的場邊寬度（估計） */
  building: { cast: 7, safe: 5 },
  /** 信號燈：5 條軌道（資料）、寬度（估計） */
  signal: { cast: 6, w: 8 },
  arm: { cast: 5, hw: 6, off: 11 },
  /** 最後之歌：中央即死區（半徑估計）、3 個黑／白環（資料） */
  song: { cast: 4, deadR: 5, n: 3, gap: 3.5, show: 2.5 },
  /** 崩落：石柱擊退距離、倒下的直線（估計） */
  collapse: { cast: 5, kb: 16, w: 8 },
};

const C0: Vec = { x: 0, y: 0 };
const home = clusterHome(C0, 9.5);

function toPhase2(G: GameState, t: number): void {
  at(G, t, () => { bossById(G, 'idol').hidden = true; bossById(G, 'bloom').hidden = false; });
}

export type Spin = 'ccw' | 'cw';
/** 釋放魔力：北側的輪子逆時針 → 左（西）半場；順時針 → 右（東）半場 */
function release(G: GameState, t0: number, k: Spin): number {
  const me = claim(G, t0), o = T.release, tag = '釋放魔力';
  const end = castAt(G, t0, tag, o.cast, k === 'ccw' ? '圓環往左轉（逆時針）＝左（西）半場：到東半場' : '圓環往右轉（順時針）＝右（東）半場：到西半場', '偽造的神明');
  at(G, t0, () => { G.x.idol = { ...encData(G, 'idol', () => ({})), wheel: { k, until: end } }; });
  aoe(G, end, { k: 'half', x: 0, y: 0, r: 70, a: k === 'ccw' ? DIR.W : DIR.E }, { tag, show: o.cast, why: '站在輪子滾過的半場' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 斷唱：白——點名 3 人到左下、右下角，點名結束後從他們的位置往北發射步進式圓形 */
function whiteScore(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.white, tag = '斷唱：白';
  const end = castAt(G, t0, tag, o.cast, '被點名的 3 人到左下角、右下角（重疊無妨）；點名結束後會往北（箭頭方向）一路炸過去：躲開那一整條', '偽造的神明');
  const list = G.rng.shuffle(G.ents).slice(0, 3);
  const SPOT: Vec[] = [{ x: -15, y: 15 }, { x: 15, y: 15 }];
  const spot = (e: Entity): Vec => SPOT[list.indexOf(e) % 2];
  at(G, t0, () => { list.forEach((e) => { e.marker = { kind: 'target', until: end, label: '白' }; }); if (list.includes(G.player)) G.hints = [{ ...spot(G.player), r: 1.6, label: '到角落' }]; });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { if (list.includes(e)) e.mt = spot(e); }));
  at(G, end - 0.05, () => {
    G.hints = [];
    const starts = [...new Set(list.filter((e) => !e.dead).map((e) => `${Math.round(e.x)},${Math.round(e.y)}`))].map((s) => { const [x, y] = s.split(',').map(Number); return { x, y }; });
    starts.forEach((p) => {
      // 第一個圈＝點名本身（被點的人吃，其他人不能在裡面）；之後沿箭頭方向一路炸過去
      for (let k = 0; k <= o.steps; k++) aoe(G, G.t + 0.05 + 0.6 + k * o.gap, { k: 'circle', x: p.x, y: p.y - k * o.step, r: o.r }, { tag, show: 0.6 + k * o.gap, why: '被斷唱：白的步進圓打中', ok: null, dodge: false, only: k === 0 ? (e) => !list.includes(e) : undefined });
    });
  });
  // 被點的人：點名結束後往內側橫移，避開整條
  at(G, end + 0.05, () => npcs(G).forEach((e) => { if (list.includes(e)) { const s = spot(e); e.mt = { x: s.x - Math.sign(s.x) * 7, y: s.y }; } }));
  const last = end + 0.6 + o.steps * o.gap;
  passIf(G, last + 0.1, tag, t0, '躲開了斷唱：白');
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 斷唱：黑——點名三名坦克，高傷害圓形 */
const TB_SPOT: Record<Alliance, Vec> = { A: { x: -15, y: 3 }, B: { x: 0, y: 16 }, C: { x: 15, y: 3 } };
function blackScore(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.black, tag = '斷唱：黑';
  const end = castAt(G, t0, tag, o.cast, '坦克被點名：遠離人群、開減傷', '偽造的神明');
  buster(G, end, { tag, show: o.cast, targets: G.ents.filter((e) => e.role === 'MT'), r: o.r, spot: (e) => TB_SPOT[e.al] });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 魔唱輪：北側的圓圈接住落下的紅球，往場內發射直線（魔力干涉）：左右移動躲 */
function chorus(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.chorus, tag = '魔力干涉';
  const end = castAt(G, t0, '魔唱輪', o.cast, '紅球落進北側的圓圈後往場內射直線：左右移動躲開', '偽造的神明');
  const xs = G.rng.shuffle([-15, -9, -3, 3, 9, 15]).slice(0, o.n);
  aoe(G, end + 0.5, xs.map((x) => ({ k: 'line' as const, x, y: 0, a: 0, hw: o.hw })), { tag, show: o.cast + 0.5, visible: 2.5, why: '被魔唱輪的直線打中' });
  settle(G, end + 0.9, me);
  return end + 1.4;
}

/** 魔法彈：部分玩家腳下的圓（魔力飛散） */
function magic(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.magic, tag = '魔力飛散';
  const end = castAt(G, t0, '魔法彈', o.cast, '腳下出現圓圈：走出來', '偽造的神明');
  at(G, end - 2.5, () => { const list = G.rng.shuffle(present(G)).slice(0, o.n); aoe(G, end, list.map((e) => ({ k: 'circle' as const, x: e.x, y: e.y, r: o.r })), { tag, show: 2.5, why: '沒走出腳下的圓' }); });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 威光（轉場）：全場傷害、從場中擊退、擊倒；進入第二階段 */
function transition(G: GameState, t0: number): number {
  const end = castAt(G, t0, '威光', 5, '轉場：全場傷害＋從場中擊退＋擊倒', '偽造的神明');
  knockback(G, end, { tag: '威光', show: 5, from: C0, dist: 6, spot: (e) => home(e.al, e.role) });
  at(G, end + 0.8, () => { present(G).forEach((e) => { e.stun = G.t + 2; e.stunKind = 'stun'; }); alertMsg(G, '開花的神明', 2); });
  toPhase2(G, end + 1);
  return end + 3.5;
}

/** 穿透＋再現：建築物——場地變透明，下方的建築物往上飛：到建築物短邊那一側的場邊 */
export type Axis = 'ns' | 'ew';
function building(G: GameState, t0: number, axis: Axis): number {
  const me = claim(G, t0), o = T.building, tag = '激烈撞擊';
  at(G, t0 - 1, () => alertMsg(G, '穿透：場地變透明', 1.5));
  const end = castAt(G, t0, '再現：建築物', o.cast, axis === 'ns' ? '建築物的短邊在南北：到北邊或南邊的場邊' : '建築物的短邊在東西：到東邊或西邊的場邊', '開花的神明');
  const H = T.half, inner = H - o.safe;
  const s: Shape = axis === 'ns' ? { k: 'rect', O: { x: -H, y: 0 }, H: DIR.E, len: H * 2, w: inner * 2 } : { k: 'rect', O: { x: 0, y: -H }, H: DIR.S, len: H * 2, w: inner * 2 };
  aoe(G, end, s, { tag, show: o.cast, why: '站在建築物上方，被撞飛出場外', lethal: true, ok: '在建築物短邊那一側的場邊' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 再現：信號燈——5 條軌道，2 紅 3 綠：綠燈軌道有列車（擊退出場外），站在紅燈軌道 */
function signal(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.signal, tag = '衝撞（列車）';
  const end = castAt(G, t0, '再現：信號燈', o.cast, '站在紅燈的軌道上，綠燈軌道會有列車通過', '開花的神明');
  const lanes = [-16, -8, 0, 8, 16], red = G.rng.shuffle([0, 1, 2, 3, 4]).slice(0, 2);
  at(G, t0 + 1.5, () => lanes.forEach((x, i) => G.objs.push({ k: 'orb', x, y: -18, r: 1.3, col: red.includes(i) ? '#ff5d6c' : '#43df9f', until: end + 0.6, label: red.includes(i) ? '紅' : '綠' })));
  const greens: Shape[] = lanes.filter((_x, i) => !red.includes(i)).map((x) => ({ k: 'line', x, y: 0, a: 0, hw: o.w / 2 }));
  aoe(G, end, greens, { tag, show: o.cast - 1.5, why: '站在綠燈軌道，被列車撞出場外', lethal: true, ok: '站在紅燈軌道' });
  settle(G, end + 0.4, me);
  return end + 1;
}

export type ArmKind = 'hands' | 'feet';
/** 武裝：石塊凝結在雙手（兩根石柱）→ 兩側 AOE，身下安全；凝結在身下（一根石柱）→ 中央 AOE，兩側安全 */
function arm(G: GameState, t0: number, k: ArmKind): number {
  const me = claim(G, t0), o = T.arm, tag = '武裝';
  const end = castAt(G, t0, tag, o.cast, k === 'hands' ? '石塊凝結在雙手（兩根石柱）＝兩側 AOE：站王身下（中間）' : '石塊凝結在身下（一根石柱）＝中央 AOE：站兩側', '開花的神明');
  at(G, t0, () => { G.x.idol = { ...encData(G, 'idol', () => ({})), arm: { k, until: end } }; });
  const s: Shape[] = k === 'hands' ? [-1, 1].map((sg) => ({ k: 'line' as const, x: sg * o.off, y: 0, a: 0, hw: o.hw })) : [{ k: 'line', x: 0, y: 0, a: 0, hw: o.hw }];
  aoe(G, end, s, { tag, show: o.cast, why: k === 'hands' ? '兩側 AOE：要站中間' : '中央 AOE：要站兩側' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 污染＋最後之歌：正面黑、背面白；黑環落下要「面向」場中，白環要「背對」場中 */
type Ring = 'black' | 'white';
function lastSong(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.song, tag = '最後之歌';
  const end = castAt(G, t0, tag, o.cast, '污染：正面黑、背面白。黑環 → 面向場中；白環 → 背對場中（同色的那半朝向場中）', '開花的神明');
  const rings: Ring[] = Array.from({ length: o.n }, () => (G.rng.chance(0.5) ? 'black' : 'white'));
  const last = end + 1 + (o.n - 1) * o.gap;
  at(G, t0, () => present(G).forEach((e) => addStatus(e, { id: 'pollute', name: '污染', glyph: '污', until: last + 1, kind: 'debuff' })));
  zone(G, end, { shape: { k: 'circle', x: 0, y: 0, r: o.deadR }, until: last + 0.5, tag: '最後之歌', why: '走進場地中央的即死力場', col: 'purple', lethal: true });
  rings.forEach((c, i) => {
    const t = end + 1 + i * o.gap;
    at(G, t - o.show, () => { G.x.idol = { ...encData(G, 'idol', () => ({})), ring: { c, until: t } }; alertMsg(G, c === 'black' ? '黑環落下：面向場中' : '白環落下：背對場中', o.show); });
    at(G, t - o.show + REACT, () => npcs(G).forEach((e) => { const a = angTo(e, C0); e.faceLock = c === 'black' ? a : a + Math.PI; }));
    at(G, t, () => {
      G.fx.push({ k: 'flash', until: G.t + 0.2 });
      present(G).forEach((e) => {
        const facing = angDiff(e.face, angTo(e, C0)) < Math.PI / 2, ok = c === 'black' ? facing : !facing;
        if (e === G.player) {
          const fix = { x: e.x, y: e.y, r: 1.2, face: c === 'black' ? angTo(e, C0) : angTo(C0, e), label: c === 'black' ? '面向場中' : '背對場中' };
          if (!ok) bad(G, `侵蝕：${c === 'black' ? '黑' : '白'}`, c === 'black' ? '黑環：沒有面向場中' : '白環：沒有背對場中', fix);
          else if (i === o.n - 1 && !G.checks.some((x) => x.tag.startsWith('侵蝕') && !x.ok && x.t >= t0)) good(G, tag, '三個環都轉對方向', fix);
        } else if (!ok) botHit(G, e, `侵蝕：${c === 'black' ? '黑' : '白'}`, '面向轉錯');
      });
    });
  });
  at(G, last + 0.3, () => npcs(G).forEach((e) => { e.faceLock = null; }));
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 崩落：西北角的石柱擊退（站石柱旁 → 被推到斜對角），接著石柱往場內倒下（秒殺直線） */
function collapse(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.collapse;
  const P: Vec = { x: -17, y: -17 };
  const end = castAt(G, t0, '崩落', o.cast, '到石柱旁邊，被擊退到斜對角；之後石柱倒下（影子不代表方向），看清楚方向躲開', '開花的神明');
  at(G, t0, () => G.objs.push({ k: 'orb', ...P, r: 1.8, col: '#8f8870', until: end + 6, label: '石柱' }));
  const near = (e: Entity): Vec => { const i = ALS.indexOf(e.al) * 8 + ROLES.indexOf(e.role); return { x: P.x + 3 + (i % 5) * 0.9, y: P.y + 3 + Math.floor(i / 5) * 0.9 }; };
  knockback(G, end, { tag: '衝擊波', show: o.cast, from: P, dist: o.kb, spot: near, fix: () => ({ x: -12, y: -12, r: 2, label: '石柱旁邊' }) });
  // 被擊退到斜對角後就停在那裡（不要走回石柱旁）
  at(G, end + 0.8, () => npcs(G).forEach((e) => { e.mt = { x: e.x, y: e.y }; }));
  const fall = deg(G.rng.rnd(110, 160));
  castAt(G, end + 1, '崩塌', 3, '石柱往場內倒下：躲開直線', '開花的神明', false);
  aoe(G, end + 4, { k: 'rect', O: P, H: fall, len: 50, w: o.w }, { tag: '崩塌', show: 2.5, why: '被倒下的石柱壓到', lethal: true });
  settle(G, end + 4.4, me);
  return end + 5;
}

const p1Raid = (G: GameState, t0: number): number => raidwide(G, t0, '唱譜', 5, undefined, '偽造的神明') + 0.8;
const p2Raid = (G: GameState, t0: number): number => raidwide(G, t0, '唱譜', 5, undefined, '開花的神明') + 0.8;
const randSpin = (G: GameState): Spin => (G.rng.chance(0.5) ? 'ccw' : 'cw');

function p1Seg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [p1Raid, (g: GameState, x: number) => release(g, x, randSpin(g)), whiteScore, blackScore, chorus, magic, (g: GameState, x: number) => release(g, x, randSpin(g)), chorus]) t = f(G, t) + 1.5;
  return transition(G, t);
}
function p2Seg(G: GameState, t0: number): number {
  toPhase2(G, t0);
  let t = t0 + 0.5;
  const ax = (): Axis => (G.rng.chance(0.5) ? 'ns' : 'ew');
  for (const f of [p2Raid, (g: GameState, x: number) => building(g, x, ax()), signal, (g: GameState, x: number) => arm(g, x, g.rng.chance(0.5) ? 'hands' : 'feet'), whiteScore, lastSong, collapse, blackScore, signal, (g: GameState, x: number) => arm(g, x, g.rng.chance(0.5) ? 'hands' : 'feet'), lastSong]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['唱譜', '釋放魔力', '斷唱：白', '斷唱：黑', '魔唱輪', '魔法彈', '威光', '再現：建築物', '再現：信號燈', '武裝', '污染＋最後之歌', '崩落'];

interface IdolState { wheel?: { k: Spin; until: number }; arm?: { k: ArmKind; until: number }; ring?: { c: Ring; until: number } }

export const idol: Encounter = {
  id: 'idol',
  name: '偽造的神明 → 開花的神明',
  sub: '最終王',
  arena: squareArena(T.half, 'wall'),
  bosses: [
    { id: 'idol', name: '偽造的神明', x: T.boss.x, y: T.boss.y, face: Math.PI, r: 5 },
    { id: 'bloom', name: '開花的神明', x: T.boss.x, y: T.boss.y, face: Math.PI, r: 5, hidden: true },
  ],
  home,
  startFace: 0,
  info: {
    唱譜: { effect: '全場 AOE。', tell: '神明詠唱。', how: '不用走位。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    釋放魔力: { effect: '場地北側出現順時針或逆時針轉的輪子，滾向東或西發動直線 AOE。', tell: 'Boss 面前出現圓環：<b>向左轉（逆時針）</b>或<b>向右轉（順時針）</b>。', how: '逆時針 → <b>左半場</b>挨打，到右邊；順時針 → <b>右半場</b>挨打，到左邊。' },
    '斷唱：白': { effect: '點名三人，可引導的垂直或水平方向步進式圓形 AOE。', tell: '三人頭上出現點名。', how: '被點名的人到場地<b>左下角與右下角</b>（重疊無妨），其他人避開；點名圈結束後會從當下位置<b>沿箭頭方向</b>一路炸過去，躲開整條。' },
    '斷唱：黑': { effect: '點名三名坦克，高傷害圓形 AOE。', tell: '坦克頭上點名。', how: '坦克遠離人群、開減傷。', tank: '三隊坦克各自離開人群、互相不要重疊，開減傷（模擬器站位：A 隊西側、B 隊南側、C 隊東側）。', heal: '三名坦克同時吃高傷害：先替自己隊的坦克上盾、抬滿血。' },
    魔唱輪: { effect: '北側召喚數個魔唱輪，上方落下魔法彈，落地後發動直線 AOE（魔力干涉）。', tell: '場地前方出現圓圈，天上掉紅球。', how: '紅球落進圓圈後會往場地射直線：<b>左右移動</b>躲。' },
    魔法彈: { effect: '部分玩家腳下出現圓形預兆，隨後發動圓形 AOE（魔力飛散）。', tell: '腳下圓圈。', how: '走出來。' },
    威光: { effect: '轉場：全場 AOE，從場中擊退所有人並擊倒，進入第二階段。', tell: '偽造的神明詠唱。', how: '不用走位。', heal: '全場傷害＋擊倒：轉場後群補。' },
    '再現：建築物': { effect: '場地變透明（穿透），下方出現矩形建築物並倒數；倒數結束建築物往上飛，把範圍內的人撞出場外（激烈撞擊）。', tell: '場地透明、下方出現建築物。', how: '從上往下看，前往建築物<b>短邊所在的場地邊緣</b>躲。' },
    '再現：信號燈': { effect: '場上出現 5 條軌道與 5 個信號燈：2 個變紅、3 個變綠；綠燈軌道有列車通過，把範圍內的人撞出場外。', tell: '信號燈變紅／綠。', how: '站在<b>紅燈</b>所在的軌道上。' },
    武裝: { effect: '二選一：石塊聚集在腳下、出現一根石柱 → 中間直線 AOE；石塊聚集在雙臂、出現兩根石柱 → 兩側直線 AOE。', tell: '石塊凝結在 Boss 身上：<b>雙手</b>或<b>身下</b>。', how: '凝結在雙手 → 兩側 AOE，<b>身下安全</b>；凝結在身下 → 中央 AOE，<b>兩側安全</b>。' },
    '污染＋最後之歌': { effect: '所有人獲得污染（正面黑、背面白）；場地中心出現圓形即死區域，從天上落下 3 個黑環或白環（第二次起落得更快）。侵蝕：黑＝面向場中不受傷；侵蝕：白＝背對場中不受傷。', tell: '場地中央出現圓圈，自己身上出現黑白圈；看落下的環的顏色。', how: '中央圓環落地時，讓自己<b>同色的半圈朝向場地中央</b>：黑環 → 面向場中，白環 → 背對場中。' },
    崩落: { effect: '場地對角先後生成兩根浮空石柱：以石柱落點為中心的擊退（衝擊波），之後石柱朝場內隨機方向倒下（崩塌，秒殺級直線）。', tell: '場地邊緣出現巨大石柱。', how: '到石柱附近，被擊退到斜對角；石柱倒下時看清方向躲開（<b>影子不代表方向</b>）。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '偽造的神明 → 開花的神明，順序為估計', brief: flowHtml(['【偽造的神明】唱譜', '釋放魔力', '斷唱：白／斷唱：黑', '魔唱輪', '魔法彈', '威光（轉場）', '【開花的神明】唱譜', '再現：建築物', '再現：信號燈', '武裝', '斷唱：白', '污染＋最後之歌', '崩落', '…']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: (G, t0) => p2Seg(G, p1Seg(G, t0) + 1) }),
    p1: drill({ tl: true, name: '第一階段', sub: '偽造的神明', brief: '', info: ['唱譜', '釋放魔力', '斷唱：白', '斷唱：黑', '魔唱輪', '魔法彈', '威光'], seg: p1Seg }),
    p2: drill({ tl: true, name: '第二階段', sub: '開花的神明', brief: '', info: ['再現：建築物', '再現：信號燈', '武裝', '斷唱：白', '污染＋最後之歌', '崩落'], seg: p2Seg }),
    release: drill({ name: '釋放魔力', sub: '看圓環轉向', brief: '', info: ['釋放魔力'], mechs: ['釋放魔力'], seg: (G, t0) => release(G, t0, variant<Spin>(G, 'release', randSpin(G))) }),
    scores: drill({ name: '斷唱：白／黑', sub: '步進圓、坦克點名', brief: '', info: ['斷唱：白', '斷唱：黑'], mechs: ['斷唱：白', '斷唱：黑'], steps: [['斷唱：白', '斷唱：白'], ['斷唱：黑', '斷唱：黑']], seg: (G, t0) => blackScore(G, whiteScore(G, t0) + 1) }),
    chorus: drill({ name: '魔唱輪＋魔法彈', sub: '直線、腳下圓', brief: '', info: ['魔唱輪', '魔法彈'], mechs: ['魔力干涉', '魔力飛散'], seg: (G, t0) => magic(G, chorus(G, t0) + 1) }),
    building: drill({ name: '再現：建築物', sub: '到短邊的場邊', brief: '', info: ['再現：建築物'], mechs: ['激烈撞擊'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return building(G, t0, variant<Axis>(G, 'building', G.rng.chance(0.5) ? 'ns' : 'ew')); } }),
    signal: drill({ name: '再現：信號燈', sub: '站紅燈軌道', brief: '', info: ['再現：信號燈'], mechs: ['衝撞（列車）'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return signal(G, t0); } }),
    arm: drill({ name: '武裝', sub: '雙手／身下', brief: '', info: ['武裝'], mechs: ['武裝'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return arm(G, t0, variant<ArmKind>(G, 'arm', G.rng.chance(0.5) ? 'hands' : 'feet')); } }),
    song: drill({ name: '污染＋最後之歌', sub: '黑環面向、白環背對', brief: '', info: ['污染＋最後之歌'], mechs: ['最後之歌', '侵蝕：黑', '侵蝕：白'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return lastSong(G, t0); } }),
    collapse: drill({ name: '崩落', sub: '擊退到對角、躲石柱', brief: '', info: ['崩落'], mechs: ['衝擊波', '崩塌'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return collapse(G, t0); } }),
  },
  variants: {
    release: [{ key: 'release', label: '圓環', opts: [
      { value: 'ccw', label: '逆時針', tell: '圓環<b>向左轉</b>', how: '左（西）半場挨打：到<b>東半場</b>。' },
      { value: 'cw', label: '順時針', tell: '圓環<b>向右轉</b>', how: '右（東）半場挨打：到<b>西半場</b>。' },
    ] }],
    building: [{ key: 'building', label: '建築物', opts: [
      { value: 'ns', label: '短邊在南北', tell: '建築物的短邊朝南北', how: '到<b>北邊或南邊</b>的場邊。' },
      { value: 'ew', label: '短邊在東西', tell: '建築物的短邊朝東西', how: '到<b>東邊或西邊</b>的場邊。' },
    ] }],
    arm: [{ key: 'arm', label: '石塊', opts: [
      { value: 'hands', label: '凝結在雙手', tell: '兩根石柱', how: '兩側 AOE：站王<b>身下（中間）</b>。' },
      { value: 'feet', label: '凝結在身下', tell: '一根石柱', how: '中央 AOE：站<b>兩側</b>。' },
    ] }],
  },
  draw(c, G, layer) {
    if (layer !== 'top') return;
    const s = G.x.idol as IdolState | undefined, b = G.bosses.find((x) => !x.hidden);
    if (!s || !b) return;
    if (s.wheel && G.t < s.wheel.until) text(c, s.wheel.k === 'ccw' ? '↺ 圓環向左轉' : '↻ 圓環向右轉', b.x, b.y + 7, 14, '#ffd36b');
    if (s.arm && G.t < s.arm.until) text(c, s.arm.k === 'hands' ? '石塊凝結在雙手（兩根石柱）' : '石塊凝結在身下（一根石柱）', b.x, b.y + 7, 13, '#ffd36b');
    if (s.ring && G.t < s.ring.until) text(c, s.ring.c === 'black' ? '● 黑環' : '○ 白環', 0, 0, 16, s.ring.c === 'black' ? '#c8c1a6' : '#ffffff');
  },
  loot: {
    currency: [[TOMES.詩學, 40], [TOMES.數理, 45], [TOMES.記憶, 15]],
    items: [
      ...towerGear('頭部'), ...towerGear('身體'), ...towerGear('手部'), ...towerGear('腿部'),
      { name: '惰性星形晶簇 ×2', kind: '雜貨', note: '必得' },
      { name: '人造人玩偶', kind: '桌上擺設' },
      { name: '髮型樣式：2B', kind: '雜貨' }, { name: '髮型樣式：9S', kind: '雜貨' },
      { name: '機械生物', kind: '寵物' }, { name: '自走人偶 9S', kind: '寵物' },
      { name: '九宮幻卡：2B', kind: '九宮幻卡' },
      ...['終結之音', '追悼', '艾米爾／絕望', '凱寧／最終幻想主題曲版', '終結之音：丁'].map((n) => ({ name: `管絃樂琴樂譜：${n}`, kind: '管絃樂琴樂譜' })),
    ],
  },
};
