/*
 * 尼爾 1 複製工廠廢墟・第二王：霍布斯
 * A／B／C 三隊被分到三個平臺（各自有地板機關），北邊是會旋轉切換機關的牆。模擬器只模擬「你那一隊」的平臺，
 * 其他兩隊不在畫面上（Entity.away）。資料：灰機 wiki（機制）＋ 新大陸見聞（處理方式：所有人在場地右前方集合）。
 * 平臺大小、詠唱秒數、AOE 大小、時間軸順序全部是估計（T）。
 */
import { ROLES, type Alliance, type Role, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, polar, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { addStatus, alertMsg, at, encData, force, present, variant, type Entity, type GameState } from '../../game/state';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, castAt, lineStack, passIf, raidwide, spread, zone } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { px, text } from '../../render/canvas';
import type { Encounter } from '../types';
import { yorha, TOMES } from './shared';

const T = {
  half: 14,
  wallY: -14,
  boss: { x: 0, y: -21 } as Vec,
  /** 多重攻擊檢測：中央圓（之後變帶電區）、三爪扇形半張角、每輪旋轉、輪數 */
  multi: { cast: 4, centerR: 4, fanW: deg(30), rot: deg(40), rounds: 3, gap: 2.4, show: 2.2 },
  /** 集裝箱：塌方（距離衰減，估計當成中央圓）、箱壁、自爆 */
  box: { cast: 4, fallR: 8, wallLen: 14, wallW: 7, bombR: 3, bombDelay: 4.5 },
  fire: { cast: 4, show: 3.5, midHW: 4.5 },
  ring: { cast: 4, steps: [4, 8, 12, 30], gap: 2, show: 2.4 },
  laser: { cast: 4.5, w: 4, len: 40 },
  emp: { cast: 4, strip: 4, show: 4 },
  roll: { cast: 5, edge: 3, dist: 13, time: 2.5 },
  oil: { cast: 4, n: 5, r: 4.5, show: 3.5, gap: 3 },
  missile: { cast: 4.5, r: 6, spot: 10 },
};

/** 原位：所有人在場地右前方（東北）集合（新大陸見聞） */
const GATHER: Vec = { x: 8, y: -8 };
function home(_al: Alliance, role: Role): Vec {
  const i = ROLES.indexOf(role);
  return { x: GATHER.x - 1.8 + (i % 4) * 1.2, y: GATHER.y - 0.6 + Math.floor(i / 4) * 1.2 };
}

interface HobState { fire?: { lit: number[]; until: number }; roll?: { dir: number; until: number }; box?: number; rot?: { dir: number; until: number } }
const S = (G: GameState): HobState => encData(G, 'hob', () => ({}));
const setS = (G: GameState, patch: Partial<HobState>): void => { G.x.hob = { ...S(G), ...patch }; };

const party = (G: GameState): Entity[] => present(G);

/** 耐激光檢測：連續全場 AOE */
const laserTest = (G: GameState, t0: number): number => raidwide(G, t0, '耐激光檢測', 5, '連續全場 AOE：開減傷、補師抬血', '霍布斯') + 1.5;

/** 多重攻擊檢測（右臂）：中央圓 → 帶電區；之後三爪扇形，依箭頭方向旋轉三輪 */
function multi(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.multi, tag = '多重攻擊檢測';
  at(G, t0, () => alertMsg(G, '墻面的右臂開始運作……', 2.5));
  const end = castAt(G, t0, tag, o.cast, '中央先炸圓形（之後帶電，不要進去），接著三爪扇形照箭頭方向轉三輪：跟著轉、站在扇形之間', '霍布斯');
  aoe(G, end, { k: 'circle', x: 0, y: 0, r: o.centerR }, { tag, show: o.cast, why: '站在場地中央' , ok: null });
  const a0 = G.rng.rnd(0, Math.PI * 2), dir = G.rng.chance(0.5) ? 1 : -1;
  const last = end + 1 + o.show + (o.rounds - 1) * o.gap;
  zone(G, end, { shape: { k: 'circle', x: 0, y: 0, r: o.centerR }, until: last + 0.5, tag, why: '踩進中央的帶電區域', col: 'elec' });
  at(G, end, () => setS(G, { rot: { dir, until: last } }));
  for (let k = 0; k < o.rounds; k++) {
    const t = end + 1 + o.show + k * o.gap, a = a0 + dir * k * o.rot;
    const fans: Shape[] = [0, 1, 2].map((i) => ({ k: 'fan', x: 0, y: 0, r: 22, a: a + (i * 2 * Math.PI) / 3, w: o.fanW }));
    aoe(G, t, fans, { tag, show: o.show, why: '被機械爪的扇形打中（物理受傷加重）', ok: k === o.rounds - 1 ? '跟著旋轉躲開三輪扇形' : null });
  }
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 集裝箱（左臂）：中央塌方 → 箱壁往四個方向倒 → 四個自爆連線 */
function container(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.box, tag = '集裝箱';
  at(G, t0, () => { alertMsg(G, '墻面的左臂開始運作……', 2.5); setS(G, { box: t0 + o.cast + 2.6 }); });
  const end = castAt(G, t0, '塌方', o.cast, '集裝箱砸在中央（離中央遠一點），接著箱壁往東南西北倒：站在斜角（右前方）', '霍布斯');
  aoe(G, end, { k: 'circle', x: 0, y: 0, r: o.fallR }, { tag, show: o.cast, why: '離中央太近，吃到塌方', ok: null });
  const walls: Shape[] = [DIR.N, DIR.E, DIR.S, DIR.W].map((a) => ({ k: 'rect', O: { x: 0, y: 0 }, H: a, len: o.wallLen + 2, w: o.wallW }));
  aoe(G, end + 2, walls, { tag, show: 2, why: '被倒下的箱壁砸中（崩塌）', ok: '躲開塌方與崩塌' });
  // 自爆：隨機連線 4 人，數秒後衝過去炸小範圍
  const tEnd = end + 2.5 + o.bombDelay;
  const SPOTS: Vec[] = [{ x: -10, y: -10 }, { x: -10, y: 10 }, { x: 10, y: 10 }, { x: 0, y: 11 }];
  at(G, end + 2.5, () => {
    const list = G.rng.shuffle(party(G)).slice(0, 4);
    list.forEach((e) => G.fx.push({ k: 'tether', from: { x: 0, y: 0 }, to: e, until: tEnd, col: 'rgba(255,170,90,.9)' }));
    spread(G, tEnd, { tag: '自爆攻擊', show: o.bombDelay, r: o.bombR, targets: list, spot: (_e, i) => SPOTS[i], rest: (e) => home(e.al, e.role) });
  });
  settle(G, tEnd + 0.4, me);
  return tEnd + 1;
}

export type FirePat = 'mid' | 'sides' | 'left' | 'right';
const FIRE_NAME: Record<FirePat, string> = { mid: '中間', sides: '兩側', left: '左側（西）', right: '右側（東）' };
/** 耐火焰檢測：北牆 8 個噴頭點火，看哪幾個亮決定攻擊範圍 */
function flame(G: GameState, t0: number, pat: FirePat): number {
  const me = claim(G, t0), o = T.fire, tag = '耐火焰檢測';
  at(G, t0, () => alertMsg(G, '墻面的火炎放射器開始運作……', 2.5));
  const end = castAt(G, t0, tag, o.cast, '回頭看北牆的噴頭：往沒有點火的方向躲', '霍布斯');
  const H = T.half, m = o.midHW;
  const rect = (x0: number, x1: number): Shape => ({ k: 'rect', O: { x: (x0 + x1) / 2, y: T.wallY }, H: DIR.S, len: H * 2, w: x1 - x0 });
  const shapes: Shape[] = pat === 'mid' ? [rect(-m, m)] : pat === 'sides' ? [rect(-H, -m), rect(m, H)] : pat === 'left' ? [rect(-H, 0)] : [rect(0, H)];
  const lit = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => { const x = -12.25 + i * 3.5; return pat === 'mid' ? Math.abs(x) < m : pat === 'sides' ? Math.abs(x) > m : pat === 'left' ? x < 0 : x > 0; });
  at(G, t0, () => setS(G, { fire: { lit, until: end + 1 } }));
  aoe(G, end + 0.5, shapes, { tag, show: o.cast + 0.5, visible: o.show, why: `站在火焰範圍（${FIRE_NAME[pat]}），被燒到（火傷）`, ok: '躲到沒點火的方向' });
  settle(G, end + 0.8, me);
  return end + 1.3;
}

/** 環形激光：從外往內 4 段 */
function ringLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.ring, tag = '環形激光';
  const end = castAt(G, t0, tag, o.cast, '從外往內收：先站在第二圈（場地中段），最外圈炸完就往外（角落）走', '霍布斯');
  const t1 = end + 0.6, st = [...o.steps].reverse(); // 30, 12, 8, 4
  st.forEach((r, k) => {
    const s: Shape = k === st.length - 1 ? { k: 'circle', x: 0, y: 0, r } : { k: 'ring', x: 0, y: 0, r0: st[k + 1], r1: r };
    aoe(G, t1 + k * o.gap, s, { tag, show: o.show, why: `被第 ${k + 1} 段環形激光打中（魔法受傷加重）`, ok: k === st.length - 1 ? '最外圈炸完就往外，躲開後面幾段' : null, dodge: false });
  });
  const mid = polar({ x: 0, y: 0 }, deg(45), 10), out = { x: 11, y: -11 };
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = { ...mid }; }); G.hints = [{ ...mid, r: 1.4, label: '先站這裡' }]; });
  at(G, t1 + 0.05, () => { npcs(G).forEach((e) => { e.mt = { ...out }; }); G.hints = [{ ...out, r: 1.4, label: '往外走' }]; });
  at(G, t1 + o.gap * 3 + 0.1, () => { G.hints = []; });
  settle(G, t1 + o.gap * 3 + 0.4, me);
  return t1 + o.gap * 3 + 1;
}

/** 激光照射：點名每隊一名補師，直線分攤 */
function laserShot(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.laser, tag = '激光照射';
  const end = castAt(G, t0, tag, o.cast, '補師被點名：全隊站到補師身後，一起吃直線分攤', '霍布斯');
  const healer = (G2: GameState): Entity => party(G2).find((e) => e.role === 'H1') ?? party(G2)[0];
  at(G, t0, () => {
    const h = healer(G);
    lineStack(G, end, { tag, show: o.cast, from: 'hob', targets: [h], groupOf: () => h, w: o.w, len: o.len, spot: (e) => home(e.al, e.role) });
  });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 地板機關（依隊伍）：A 電磁脈衝攻擊、B 強制移動、C 喷油 */
function floor(G: GameState, t0: number, al: Alliance): number {
  const me = claim(G, t0);
  let end = t0;
  if (al === 'A') {
    const o = T.emp, tag = '電磁脈衝攻擊';
    at(G, t0, () => alertMsg(G, '地板下的機械生物動作很可疑……', 2.5));
    end = castAt(G, t0, tag, o.cast, '地板上間隔的直條發紅光：站到沒發光的直條', '霍布斯');
    const odd = G.rng.chance(0.5) ? 1 : 0, n = Math.round((T.half * 2) / o.strip);
    const strips: Shape[] = [];
    for (let i = 0; i < n; i++) if (i % 2 === odd) strips.push({ k: 'rect', O: { x: -T.half + o.strip * (i + 0.5), y: -T.half }, H: DIR.S, len: T.half * 2, w: o.strip });
    aoe(G, end + 0.5, strips, { tag, show: o.cast + 0.5, visible: o.show, why: '站在發紅光的直條上（感電）', ok: '站在沒發光的直條' });
    end += 1;
  } else if (al === 'B') {
    const o = T.roll, tag = '強制移動', H = T.half, E = o.edge;
    const dir = variant(G, 'roll', G.rng.chance(0.5) ? 'E' : 'W') === 'E' ? 1 : -1;
    at(G, t0, () => { alertMsg(G, '地面上的滾軸開始運作……', 2.5); setS(G, { roll: { dir, until: t0 + o.cast + o.time + 1 } }); });
    end = castAt(G, t0, tag, o.cast, `場邊帶電；滾軸會把大家往${dir > 0 ? '東' : '西'}送約半個場地：先站到${dir > 0 ? '西' : '東'}半邊`, '霍布斯');
    const edges: Shape[] = [
      { k: 'rect', O: { x: -H, y: -H + E / 2 }, H: DIR.E, len: H * 2, w: E }, { k: 'rect', O: { x: -H, y: H - E / 2 }, H: DIR.E, len: H * 2, w: E },
      { k: 'rect', O: { x: -H + E / 2, y: -H }, H: DIR.S, len: H * 2, w: E }, { k: 'rect', O: { x: H - E / 2, y: -H }, H: DIR.S, len: H * 2, w: E },
    ];
    edges.forEach((shape) => zone(G, t0 + 1, { shape, until: end + o.time + 2, tag, why: '碰到帶電的場邊（受傷加重）', col: 'elec' }));
    const spot = (e: Entity): Vec => ({ x: -dir * 5.5, y: Math.max(-H + E + 1.5, Math.min(H - E - 1.5, home(e.al, e.role).y)) });
    at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = spot(e); }); G.hints = [{ ...spot(G.player), r: 1.6, label: '先站這裡' }]; });
    at(G, end, () => { G.hints = []; party(G).forEach((e) => force(e, dir, 0, o.dist, o.time)); npcs(G).forEach((e) => { e.mt = null; }); });
    passIf(G, end + o.time + 0.3, tag, t0, '被滾軸送到另一邊，沒碰到帶電的場邊', (g) => ({ ...spot(g.player), r: 1.6, label: `先站${dir > 0 ? '西' : '東'}半邊` }));
    end += o.time + 0.5;
  } else {
    const o = T.oil, tag = '噴油';
    at(G, t0, () => alertMsg(G, '地板下開始充滿可燃性液體……', 2.5));
    end = castAt(G, t0, tag, o.cast, '地面黃色範圍會連續噴兩次熱油：躲開黃色範圍', '霍布斯');
    for (let w = 0; w < 2; w++) {
      const circles: Shape[] = Array.from({ length: o.n }, () => ({ k: 'circle', x: G.rng.rnd(-11, 11), y: G.rng.rnd(-11, 11), r: o.r }));
      aoe(G, end + 0.5 + w * o.gap, circles, { tag, show: o.show, why: '被熱油噴到（油：移動變慢、火屬性受傷大增）', ok: w === 1 ? '躲開兩次噴油' : null, col: 'orange' });
    }
    at(G, end + 0.5, () => { /* 噴到的人上「油」 */ party(G).forEach((e) => { if (e.isPlayer && G.checks.some((c) => c.tag === tag && !c.ok && c.t >= t0)) addStatus(e, { id: 'oil', name: '油', glyph: '油', until: G.t + 20, kind: 'debuff' }); }); });
    end += 0.5 + o.gap + 0.5;
  }
  settle(G, end + 0.2, me);
  return end + 0.8;
}

/** 短途導彈：每個平臺點名 4 名 DPS，大範圍火屬性 AOE */
function missiles(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.missile, tag = '短途導彈';
  const end = castAt(G, t0, tag, o.cast, '被點名的 DPS 各自跑到四個角落', '霍布斯');
  // 四個角落，依方位（從北順時針）排序：東北、東南、西南、西北
  const SP: Vec[] = [{ x: o.spot, y: -o.spot }, { x: o.spot, y: o.spot }, { x: -o.spot, y: o.spot }, { x: -o.spot, y: -o.spot }];
  const ang = (p: Vec): number => (angTo({ x: 0, y: 0 }, p) + 2 * Math.PI) % (2 * Math.PI);
  at(G, t0, () => {
    const dps = party(G).filter((e) => e.role[0] === 'D');
    const list = G.rng.shuffle(dps).slice(0, 4).sort((a, b) => ang(a) - ang(b));
    spread(G, end, { tag, show: o.cast, r: o.r, targets: list, spot: (_e, i) => SP[i], rest: () => ({ x: 0, y: 3 }) });
  });
  settle(G, end + 0.4, me);
  return end + 1;
}

type Arm = 'multi' | 'box' | 'fire';
const armSeg = (G: GameState, t: number, a: Arm): number =>
  a === 'multi' ? multi(G, t) : a === 'box' ? container(G, t) : flame(G, t, G.rng.pickOne<FirePat>(['mid', 'sides', 'left', 'right']));

/** 估計的完整時間軸：三組牆面機制（順序依機械臂位置，這裡隨機）之間穿插環形激光、激光照射，之後依隊伍的地板機關、短途導彈 */
function fullSeg(G: GameState, t0: number): number {
  const arms = G.rng.shuffle<Arm>(['multi', 'box', 'fire']);
  let t = laserTest(G, t0);
  t = armSeg(G, t, arms[0]) + 1.5;
  t = ringLaser(G, t) + 1.5;
  t = armSeg(G, t, arms[1]) + 1.5;
  t = laserShot(G, t) + 1.5;
  t = armSeg(G, t, arms[2]) + 1.5;
  at(G, t, () => alertMsg(G, '最終得分大幅超出預測。諸位已被判定為異常個體。', 3));
  t = floor(G, t + 2, G.player.al) + 1.5;
  t = missiles(G, t) + 1.5;
  return laserTest(G, t);
}

const ALL = ['耐激光檢測', '多重攻擊檢測', '集裝箱', '耐火焰檢測', '環形激光', '激光照射', '電磁脈衝攻擊', '強制移動', '噴油', '短途導彈'];

export const hobbes: Encounter = {
  id: 'hob',
  name: '霍布斯',
  sub: '第二王・三隊分平臺，牆面機關＋地板機關',
  arena: squareArena(T.half, 'wall', { view: { cx: 0, cy: -3, r: 21 } }),
  bosses: [{ id: 'hob', name: '霍布斯', x: T.boss.x, y: T.boss.y, face: Math.PI, r: 4 }],
  home,
  onEnter(G) { G.ents.forEach((e) => { e.away = e.al !== G.player.al; }); },
  seatText: (al) => `霍布斯：${al} 隊平臺（${{ A: '電磁脈衝', B: '強制移動', C: '噴油' }[al]}）`,
  info: {
    耐激光檢測: { effect: '連續多次全場 AOE。', tell: '霍布斯詠唱「耐激光檢測」。', how: '有點痛：開減傷，補師注意抬血。' },
    多重攻擊檢測: { effect: '中央先放一次圓形 AOE，之後中央變成帶電區域；接著中央出現三爪機械爪，產生 3 個扇形 AOE，依方向旋轉，重複三次。被打中附加 15 秒物理受傷加重。', tell: '對話框「墻面的<b>右臂</b>開始運作……」；中央出現藍圈，中央箭頭顯示旋轉方向。', how: '離開中央；三爪扇形<b>照中央箭頭的旋轉方向</b>跟著轉，站在扇形之間。' },
    集裝箱: { effect: '多爪機械爪抓起集裝箱砸在中央（塌方，距離衰減）；箱壁往四個方向倒下（崩塌，高傷害）；散開後出現四個小型自爆，隨機連線四名玩家，數秒後衝過去放小範圍高傷 AOE（自爆攻擊）。', tell: '對話框「墻面的<b>左臂</b>開始運作……」；中央出現集裝箱。', how: '所有人在<b>場地右前方（斜角）</b>躲倒下的箱壁；之後被連線的人離開人群吃自爆（攻略：坦克一人接兩條線）。' },
    耐火焰檢測: { effect: '場地後方 8 個噴頭點火，持續攻擊場地：中間、兩側、左側、右側四種。每被打中一次疊一層火傷。', tell: '對話框「墻面的<b>火炎放射器</b>開始運作……」；看背後（北牆）噴頭哪幾個點火。', how: '回頭看牆，<b>往沒有點火的方向躲</b>（兩側放射是 ∧ 形）。' },
    環形激光: { effect: '從場地外側往內側的步進式環形 AOE，打中附加 40 秒魔法受傷加重。', tell: '詠唱「環形激光」；提示和一般 AOE 不同，速度很慢。', how: '躲完第一圈之後<b>往外走</b>（到已經炸過的外圈），避開後面幾段。' },
    激光照射: { effect: '點名每隊一名補師，放需要分攤的直線 AOE。', tell: '補師被點名，霍布斯朝他打直線。', how: '全隊站到<b>被點名的補師身後</b>，一起分攤。' },
    電磁脈衝攻擊: { effect: '<b>A 隊平臺</b>：地板上間隔的直條發紅光，一段時間後打發光的區域，附加感電。', tell: '對話框「地板下的機械生物動作很可疑……」；地板直條發紅光。', how: '站到<b>沒發光</b>的直條。' },
    強制移動: { effect: '<b>B 隊平臺</b>：場邊變成帶電區域（進去疊受傷加重）；地面滾軸出現左或右箭頭，讀條完成後把玩家往箭頭方向移動約半個場地（不造成傷害）。', tell: '對話框「地面上的滾軸開始運作……」；滾軸上出現方向箭頭。', how: '先站到<b>箭頭的反方向那半邊</b>，被送過去後不會碰到帶電的場邊。' },
    噴油: { effect: '<b>C 隊平臺</b>：連續兩次從地面黃色範圍噴熱油，打中會擊飛並上「油」（移動變慢、火屬性受傷大增）。', tell: '對話框「地板下開始充滿可燃性液體……」；地面出現黃色範圍。', how: '躲開黃色範圍，兩次都要躲。' },
    短途導彈: { effect: '每個平臺點名 4 名 DPS，放大範圍火屬性 AOE。', tell: 'DPS 頭上出現點名。', how: '被點名的人<b>各自跑到四個角落</b>，其他人留在中間。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '你那一隊的平臺', brief: flowHtml(['耐激光檢測', '牆面機制 ×3（右臂／左臂／火炎放射器，順序隨機），中間穿插環形激光、激光照射', '「諸位已被判定為異常個體」→ 你那隊的地板機關', '短途導彈', '耐激光檢測']) + '<p class="bnote">三隊各在自己的平臺，只模擬你那隊；地板機關依上方選的隊伍（A／B／C）。順序為估計。</p>', info: ALL, seg: fullSeg }),
    multi: drill({ name: '右臂：多重攻擊檢測', sub: '三爪扇形旋轉', brief: '', info: ['多重攻擊檢測'], mechs: ['多重攻擊檢測'], seg: multi }),
    box: drill({ name: '左臂：集裝箱', sub: '塌方・崩塌・自爆', brief: '', info: ['集裝箱'], mechs: ['集裝箱', '自爆攻擊'], seg: container }),
    fire: drill({ name: '耐火焰檢測', sub: '看北牆噴頭', brief: '', info: ['耐火焰檢測'], mechs: ['耐火焰檢測'],
      seg: (G, t0) => flame(G, t0, variant<FirePat>(G, 'fire', G.rng.pickOne<FirePat>(['mid', 'sides', 'left', 'right']))) }),
    ring: drill({ name: '環形激光', sub: '由外往內', brief: '', info: ['環形激光'], mechs: ['環形激光'], seg: ringLaser }),
    laser: drill({ name: '激光照射', sub: '補師直線分攤', brief: '', info: ['激光照射'], mechs: ['激光照射'], seg: laserShot }),
    floor: drill({ name: '地板機關', sub: '依你的隊伍', brief: 'A 隊：電磁脈衝攻擊；B 隊：強制移動；C 隊：噴油。', info: ['電磁脈衝攻擊', '強制移動', '噴油'], mechs: ['電磁脈衝攻擊', '強制移動', '噴油'],
      seg: (G, t0) => floor(G, t0, variant<Alliance>(G, 'floor', G.player.al)) }),
    missile: drill({ name: '短途導彈', sub: 'DPS 點名分散', brief: '', info: ['短途導彈'], mechs: ['短途導彈'], seg: missiles }),
  },
  variants: {
    fire: [{ key: 'fire', label: '點火', opts: (['mid', 'sides', 'left', 'right'] as FirePat[]).map((p) => ({ value: p, label: FIRE_NAME[p], tell: `北牆${FIRE_NAME[p]}的噴頭點火`, how: p === 'mid' ? '往兩側躲。' : p === 'sides' ? '往中間躲。' : p === 'left' ? '往東（右）半邊躲。' : '往西（左）半邊躲。' })) }],
    floor: [{ key: 'floor', label: '隊伍', opts: [
      { value: 'A', label: 'A 電磁脈衝', tell: '地板間隔的直條發紅光', how: '站到沒發光的直條。' },
      { value: 'B', label: 'B 強制移動', tell: '滾軸出現方向箭頭、場邊帶電', how: '先站到箭頭反方向的半邊。' },
      { value: 'C', label: 'C 噴油', tell: '地面出現黃色範圍', how: '躲開黃色範圍兩次。' },
    ] }],
  },
  draw(c, G, layer) {
    const s = (G.x.hob ?? {}) as HobState, H = T.half;
    if (layer === 'floor') {
      // 北牆與 8 個噴頭
      c.save();
      c.fillStyle = '#3a372e'; c.fillRect(-H - 1, T.wallY - 2.2, H * 2 + 2, 2.2);
      for (let i = 0; i < 8; i++) {
        const x = -12.25 + i * 3.5, lit = !!s.fire && G.t < s.fire.until && s.fire.lit.includes(i);
        c.fillStyle = lit ? '#ff7a2a' : '#6e6853';
        c.beginPath(); c.arc(x, T.wallY - 1.1, lit ? 0.9 + 0.15 * Math.sin(G.t * 12 + i) : 0.6, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      if (s.roll && G.t < s.roll.until) {
        for (let y = -9; y <= 9; y += 6) for (let x = -8; x <= 8; x += 8) text(c, s.roll.dir > 0 ? '▶' : '◀', x, y, 18, 'rgba(255,211,107,.8)');
      }
    } else {
      if (s.box && G.t < s.box) {
        c.save(); c.fillStyle = 'rgba(110,104,83,.9)'; c.strokeStyle = '#f1ecd8'; c.lineWidth = px(1.5);
        c.fillRect(-2.5, -2.5, 5, 5); c.strokeRect(-2.5, -2.5, 5, 5); c.restore();
        text(c, '集裝箱', 0, 0, 11, '#f1ecd8', 700);
      }
      if (s.rot && G.t < s.rot.until) text(c, s.rot.dir > 0 ? '↻ 順時針' : '↺ 逆時針', 0, -6, 14, '#8bdcff');
    }
  },
  loot: {
    currency: [[TOMES.詩學, 20], [TOMES.數理, 20]],
    items: [...yorha('手部', '手套'), ...yorha('腿部', '軍褲')],
  },
};
