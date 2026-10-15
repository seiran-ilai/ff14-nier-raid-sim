/*
 * 尼爾 3 希望之砲台：塔・第二王：格雷特、韓塞爾
 * 韓塞爾在西（藍：左手槍、右手盾）、格雷特在東（紅：左手盾、右手槍）。
 * 資料：機制攻略/尼爾3_希望之砲台塔.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、範圍大小都是估計（T）。
 * 略過：強化（槍／盾）與報復的輸出規則（只顯示提示）、魔障輪的魔力奔流、槍突進的爆炸、慟哭。
 */
import type { Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { deg, dirV } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { alertMsg, at, moveBoss, present, variant, type GameState } from '../../game/state';
import { claim, settle } from '../../game/bots';
import { aoe, castAt, spread, stack } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { partyHit, tankHit, tankOf } from '../../game/roles';
import type { Encounter } from '../types';
import { TOMES, towerGear } from './shared';
import { assignSpots, clusterHome } from '../layout';

const T = {
  half: 20,
  /** 組合二：魔法彈 α（多人圓形）＋魔法彈放射（一人分攤） */
  combo2: { cast: 5, spreadR: 5, n: 4, stackR: 6 },
  /** 協作攻擊：橫掃——槍的直線寬度與離對角線的距離（估計） */
  sweep: { cast: 5, w: 8, off: 9, innerHW: 8 },
  /** 協作攻擊：槍突進——兩條對角直線（估計） */
  lance: { cast: 5, hw: 4 },
  /** 魔障輪＋重突進：東西衝鋒的直線、場中相撞的距離衰減（估計） */
  heavy: { cast: 5, hw: 4, crashR: 12 },
  /** 魔法彈 β：部分玩家腳下的圓（估計） */
  beta: { cast: 4, r: 5, n: 6 },
};

const HAN: Vec = { x: -8, y: 0 }, GRE: Vec = { x: 8, y: 0 };
const home = clusterHome({ x: 0, y: 2 }, 7);

function reset(G: GameState, t: number): void {
  at(G, t, () => { moveBoss(G, 'han', HAN, 0.6); moveBoss(G, 'gre', GRE, 0.6); });
}

/** 組合一：痛擊（死刑）＋喊叫（全場），之後互換再一次 */
function combo1(G: GameState, t0: number): number {
  const a = castAt(G, t0, '痛擊／喊叫', 5, '一隻放死刑（坦克減傷）、另一隻放全場 AOE；之後互換再一次', '韓塞爾與格雷特');
  at(G, a, () => { G.fx.push({ k: 'flash', until: G.t + 0.25 }); });
  // 痛擊：先打韓塞爾的坦克（A 隊），互換後打格雷特的坦克（B 隊）；喊叫＝全場
  tankHit(G, a, [tankOf(G, 'A')], '痛擊');
  partyHit(G, a, '喊叫');
  const b = castAt(G, a + 1, '喊叫／痛擊', 5, '互換：死刑換另一位坦克吃', '韓塞爾與格雷特', false);
  at(G, b, () => { G.fx.push({ k: 'flash', until: G.t + 0.25 }); });
  tankHit(G, b, [tankOf(G, 'B')], '痛擊');
  partyHit(G, b, '喊叫');
  return b + 1;
}

/** 組合二：魔法彈 α（多人分散）＋魔法彈放射（一人分攤）同時；沒被點的人到槍 Boss 下方分攤 */
const SPREAD_SPOT: Vec[] = [{ x: -16, y: -16 }, { x: 16, y: -16 }, { x: -16, y: 16 }, { x: 16, y: 16 }, { x: 0, y: -17 }, { x: 0, y: 17 }];
function combo2(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.combo2;
  const end = castAt(G, t0, '魔法彈 α／魔法彈放射', o.cast, '多人點名分散＋一人分攤：沒被點名的人到槍 Boss 下方一起分攤', '韓塞爾與格雷特');
  const spear = G.rng.chance(0.5) ? HAN : GRE, S: Vec = { x: spear.x, y: spear.y + 3 };
  const marked = G.rng.shuffle(G.ents).slice(0, o.n);
  const tg = G.rng.pickOne(G.ents.filter((e) => !marked.includes(e)));
  let spotOf: number[] | null = null;
  spread(G, end, { tag: '魔法彈 α', show: o.cast, r: o.spreadR, targets: marked, spot: (_e, i) => SPREAD_SPOT[(spotOf ??= assignSpots(marked.map((e) => ({ x: e.x, y: e.y })), SPREAD_SPOT))[i]] });
  stack(G, end, { tag: '魔法彈放射', show: o.cast, r: o.stackR, targets: [tg], groupOf: (e) => (marked.includes(e) ? null : tg), spot: () => S, need: 10 });
  at(G, t0, () => { G.x.twins = { spear: spear === HAN ? 'han' : 'gre', until: end }; });
  settle(G, end + 0.4, me);
  return end + 1;
}

export type SweepSide = 'out' | 'in';
/** 協作攻擊：橫掃——瞬移到西北與東南，看槍發光的位置：外側 → 兩隻中間；內側 → 離兩隻最遠的方向 */
function sweep(G: GameState, t0: number, side: SweepSide): number {
  const me = claim(G, t0), o = T.sweep, tag = '橫掃';
  at(G, t0, () => { moveBoss(G, 'han', { x: -14, y: -14 }, 0.4); moveBoss(G, 'gre', { x: 14, y: 14 }, 0.4); });
  const end = castAt(G, t0, '協作攻擊：橫掃', o.cast, side === 'out' ? '槍在外側發光：靠近兩隻 Boss 的中央' : '槍在內側發光：往離兩隻 Boss 最遠的方向（東北／西南）', '韓塞爾與格雷特');
  const a = deg(135), n = dirV(a + Math.PI / 2);
  const shapes: Shape[] = side === 'out'
    ? [-1, 1].map((s) => ({ k: 'line' as const, x: n.x * s * o.off, y: n.y * s * o.off, a, hw: o.w / 2 }))
    : [{ k: 'line', x: 0, y: 0, a, hw: o.innerHW }];
  at(G, t0, () => { G.x.twins = { glow: side, until: end }; });
  aoe(G, end, shapes, { tag, show: o.cast, why: side === 'out' ? '槍在外側：要站兩隻中央' : '槍在內側：要離兩隻最遠' });
  reset(G, end + 0.5);
  settle(G, end + 0.4, me);
  return end + 1.2;
}

/** 協作攻擊：槍突進——韓塞爾西北、格雷特東北，朝場中衝鋒（兩條對角直線） */
function lance(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.lance, tag = '槍突進';
  at(G, t0, () => { moveBoss(G, 'han', { x: -17, y: -17 }, 0.4); moveBoss(G, 'gre', { x: 17, y: -17 }, 0.4); });
  const end = castAt(G, t0, '協作攻擊：槍突進', o.cast, '兩隻從北邊兩角朝場中衝：找沒有紅球的位置、貼場邊', '韓塞爾與格雷特');
  aoe(G, end, [{ k: 'line', x: 0, y: 0, a: deg(135), hw: o.hw }, { k: 'line', x: 0, y: 0, a: deg(45), hw: o.hw }], { tag, show: o.cast, why: '站在槍突進的路線上' });
  reset(G, end + 0.5);
  settle(G, end + 0.4, me);
  return end + 1.2;
}

/** 魔障輪＋協作攻擊：重突進——兩隻瞬移到東西兩側，朝場中衝鋒並在中間相撞（距離衰減） */
function heavyCharge(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.heavy;
  at(G, t0, () => { moveBoss(G, 'han', { x: -18, y: 0 }, 0.4); moveBoss(G, 'gre', { x: 18, y: 0 }, 0.4); alertMsg(G, '魔障輪：場上召喚 8 個魔力奔流', 2); });
  const end = castAt(G, t0, '協作攻擊：重突進', o.cast, '兩隻從東西兩側朝場中衝鋒、在中間相撞：離開中線，到南北兩側', '韓塞爾與格雷特');
  aoe(G, end, { k: 'line', x: 0, y: 0, a: deg(90), hw: o.hw }, { tag: '重突進', show: o.cast, why: '站在重突進的路線上', ok: null });
  aoe(G, end + 1.2, { k: 'circle', x: 0, y: 0, r: o.crashR }, { tag: '激烈撞擊', show: o.cast + 1.2, why: '離場中太近，吃到激烈撞擊（距離衰減）', ok: '躲開重突進與激烈撞擊' });
  reset(G, end + 1.6);
  settle(G, end + 1.6, me);
  return end + 2.4;
}

/** 魔法彈 β：部分玩家腳下出現圓形預兆 */
function betaShot(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.beta, tag = '魔法彈 β';
  const end = castAt(G, t0, tag, o.cast, '部分人腳下出現圓圈：走出來', '韓塞爾與格雷特');
  at(G, end - 2.5, () => { const list = G.rng.shuffle(present(G)).slice(0, o.n); aoe(G, end, list.map((e) => ({ k: 'circle' as const, x: e.x, y: e.y, r: o.r })), { tag, show: 2.5, why: '沒走出腳下的圓' }); });
  settle(G, end + 0.4, me);
  return end + 1;
}

const strengthen = (G: GameState, t0: number): number => castAt(G, t0, '強化：槍／強化：盾', 4, '血多的那隻強化槍、血少的強化盾：轉火打槍 Boss；盾 Boss 只吃正面傷害（反彈背後與側面）', '韓塞爾與格雷特') + 0.8;
const randSide = (G: GameState): SweepSide => (G.rng.chance(0.5) ? 'out' : 'in');

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [combo1, strengthen, (g: GameState, x: number) => sweep(g, x, randSide(g)), combo2, lance, betaShot, heavyCharge, combo1, (g: GameState, x: number) => sweep(g, x, randSide(g)), combo2]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['強化：槍／盾', '組合一', '組合二', '協作攻擊：橫掃', '轉移', '協作攻擊：槍突進', '魔障輪', '魔法彈 β', '慟哭'];

export const twins: Encounter = {
  id: 'twins',
  name: '格雷特、韓塞爾',
  sub: '第二王・雙王',
  arena: squareArena(T.half, 'wall'),
  bosses: [
    { id: 'han', name: '韓塞爾', x: HAN.x, y: HAN.y, face: Math.PI, r: 3, col: '#8ad0ff' },
    { id: 'gre', name: '格雷特', x: GRE.x, y: GRE.y, face: Math.PI, r: 3, col: '#ff8a8a' },
  ],
  home,
  startFace: 0,
  pulls: { A: 'han', B: 'gre' },
  info: {
    '強化：槍／盾': { effect: '血量較高的讀「強化：槍」、較低的讀「強化：盾」；兩隻靠近時都變成槍盾強化。從背後或側面打帶盾強化的那隻會被反彈（報復：受傷＋擊退）。', tell: '兩隻各自讀條強化。', how: '兩名坦克分開拉、保持距離；其他人<b>轉火打槍 Boss</b>；拉盾 Boss 的坦克讓它的頭朝向人群（只打正面）。', tank: '兩名坦克各拉一隻並保持距離（太近兩隻都會變成槍盾強化）；拉盾 Boss 的讓它的正面朝向人群。', dps: '轉火打槍 Boss；打盾 Boss 只能從正面打（背後、側面會被反彈）。' },
    組合一: { effect: '兩隻同時各放一種（不重複）：痛擊（死刑）、喊叫（全場 AOE），之後互換再放一次。', tell: '兩隻同時讀條。', how: '坦克減傷、補師抬血。', tank: '痛擊是死刑：兩隻互換後再打一次，拉兩隻的坦克各吃一次，都要開減傷。', heal: '死刑和全場 AOE 同時來、之後再一次：先上群盾、抬坦克。' },
    組合二: { effect: '兩隻同時各放一種（不重複）：魔法彈 α（點名多人的圓形）、魔法彈放射（點名一人的分攤）。', tell: '一人分攤、多人散開同時出現。', how: '沒被點名的人到<b>槍 Boss 下方</b>參與分攤；被點散開的人離開人群。' },
    '協作攻擊：橫掃': { effect: '兩隻失去強化，隨機瞬移到場地西北與東南，以手中的槍發動直線 AOE，之後瞬移回場中。', tell: 'Boss 跳到場邊，看手上槍<b>發光的位置</b>。', how: '槍在<b>外側</b> → 靠近兩隻 Boss 的<b>中央</b>；槍在<b>內側</b> → 離兩隻 Boss <b>最遠</b>的方向。' },
    轉移: { effect: '韓塞爾與格雷特交換位置。', tell: '第二次橫掃時兩隻之間有連線。', how: '代表會交換位置，安全區要反過來判斷。' },
    '協作攻擊：槍突進': { effect: '韓塞爾瞬移到西北、格雷特到東北，朝場中衝鋒，手中的槍發動直線 AOE；另有場上的直線爆炸。', tell: '兩隻中間出現一排紅球。', how: '找<b>沒有紅球的位置並貼場邊</b>。' },
    魔障輪: { effect: '場上召喚 8 個魔力奔流，搭配重突進（兩隻從東西衝向場中相撞，距離衰減；魔力奔流 4 個順時針、4 個逆時針轉）或槍掃擊（場中朝面向的扇形；魔力奔流沿直徑移動）。', tell: '場上出現魔力奔流。', how: '第一次（重突進）：找另一邊沒有魔障輪的位置；第二次（槍掃擊）：先到場地一側躲開魔障輪，再找槍掃擊的安全區。' },
    '魔法彈 β': { effect: '部分玩家腳下出現圓形預兆，隨後發動圓形 AOE。', tell: '腳下出現圓圈。', how: '走出來。' },
    慟哭: { effect: '其中一隻死亡後，另一隻持續放全場 AOE，並在隨機玩家腳下召喚圓形 AOE。', tell: '一隻倒下。', how: '盡快打倒另一隻。', heal: '持續全場 AOE：持續群補到另一隻倒下。', dps: '盡快打倒剩下的那隻。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['組合一（痛擊／喊叫）', '強化：槍／盾', '協作攻擊：橫掃', '組合二（分散＋分攤）', '協作攻擊：槍突進', '魔法彈 β', '魔障輪＋重突進', '組合一', '協作攻擊：橫掃', '組合二']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    sweep: drill({ name: '協作攻擊：橫掃', sub: '槍在外側／內側', brief: '', info: ['協作攻擊：橫掃', '轉移'], mechs: ['橫掃'], seg: (G, t0) => sweep(G, t0, variant<SweepSide>(G, 'sweep', randSide(G))) }),
    combo2: drill({ name: '組合二', sub: '分散＋到槍 Boss 下分攤', brief: '', info: ['組合二'], mechs: ['魔法彈 α', '魔法彈放射'], seg: combo2 }),
    charges: drill({ name: '槍突進＋重突進', sub: '衝鋒路線', brief: '', info: ['協作攻擊：槍突進', '魔障輪'], mechs: ['槍突進', '重突進', '激烈撞擊'], steps: [['槍突進', '槍突進'], ['重突進', '重突進']], seg: (G, t0) => heavyCharge(G, lance(G, t0) + 1) }),
    beta: drill({ name: '魔法彈 β', sub: '走出腳下圓', brief: '', info: ['魔法彈 β'], mechs: ['魔法彈 β'], seg: betaShot }),
  },
  variants: {
    sweep: [{ key: 'sweep', label: '槍發光', opts: [
      { value: 'out', label: '外側', tell: '槍在外側發光', how: '靠近兩隻 Boss 的<b>中央</b>。' },
      { value: 'in', label: '內側', tell: '槍在內側發光', how: '往離兩隻 Boss <b>最遠</b>的方向（東北／西南）。' },
    ] }],
  },
  loot: {
    currency: [[TOMES.詩學, 20], [TOMES.數理, 25]],
    items: [...towerGear('手部'), ...towerGear('腿部')],
  },
};
