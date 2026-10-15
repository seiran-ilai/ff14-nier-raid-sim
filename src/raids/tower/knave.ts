/*
 * 尼爾 3 希望之砲台：塔・第一王：傑克
 * 資料：機制攻略/尼爾3_希望之砲台塔.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、範圍大小、白塊位置都是估計（T）。場邊會掉下去（衝撞要用白塊擋）。
 * 略過：球體放出（南北兩側的能量彈）。
 */
import { ALS, ROLES, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { deg, dirV, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { HIT, REACT } from '../../core/tuning';
import { at, encData, force, hasBuff, present, variant, type Entity, type GameState } from '../../game/state';
import { good, botHit } from '../../game/results';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, buster, castAt, raidwide, spread } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { px, text } from '../../render/canvas';
import type { Encounter } from '../types';
import { TOMES, towerGear } from './shared';
import { assignSpots, clusterHome } from '../layout';

const T = {
  half: 20,
  boss: { x: 0, y: -12 } as Vec,
  /** 強攻擊：中間直線半寬、兩側直線離中心與半寬（估計） */
  strike: { cast: 5, midHW: 5, sideOff: 10, sideHW: 5 },
  beta: { cast: 4.5, r: 6 },
  /** 協作攻擊：本體與複製依 1、2、3 號順序放強攻擊 */
  coop: { cast: 5, gap: 2.4, show: 2.2, cloneX: 14 },
  /** 魔法衝擊彈 α：隨機 6 人圓形＋兩組橫向直線（估計） */
  alpha: { cast: 5, r: 5, n: 6, lineHW: 2.5, gap: 2.2 },
  /** 輕躍：兩處距離衰減（估計半徑）；衝撞：從一側極遠擊退（估計距離） */
  leap: { cast: 4, r: 9, block: 4, kb: 30, charge: 5 },
};

const B = T.boss;
const home = clusterHome(B, 9);

export type StrikeKind = 'fist' | 'mouth';
const STRIKE_TIP: Record<StrikeKind, string> = { fist: '雙手握拳、全身蓄力＝兩側直線：站中間', mouth: '張嘴發光＝中間直線：站兩側' };
/** 強攻擊的範圍（以 x 為中心、朝南的直線） */
function strikeShapes(x: number, k: StrikeKind): Shape[] {
  const o = T.strike;
  return k === 'mouth' ? [{ k: 'line', x, y: 0, a: 0, hw: o.midHW }] : [-1, 1].map((s) => ({ k: 'line' as const, x: x + s * o.sideOff, y: 0, a: 0, hw: o.sideHW }));
}

function strike(G: GameState, t0: number, k: StrikeKind): number {
  const me = claim(G, t0), o = T.strike, tag = '強攻擊';
  const end = castAt(G, t0, tag, o.cast, STRIKE_TIP[k], '傑克');
  at(G, t0, () => { G.x.knave = { ...encData(G, 'knave', () => ({})), pose: [{ x: B.x, k, until: end }] }; });
  aoe(G, end, strikeShapes(B.x, k), { tag, show: o.cast, why: k === 'fist' ? '兩側直線：站到中間' : '中間直線：站到兩側' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 魔法衝擊彈 β：點名三隊坦克，高傷害圓形 */
const TB_SPOT: Record<Alliance, Vec> = { A: { x: -16, y: 6 }, B: { x: 0, y: 16 }, C: { x: 16, y: 6 } };
function beta(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.beta, tag = '魔法衝擊彈 β';
  const end = castAt(G, t0, tag, o.cast, '坦克被點名：遠離人群、開減傷', '傑克');
  buster(G, end, { tag, show: o.cast, targets: G.ents.filter((e) => e.role === 'MT'), r: o.r, spot: (e) => TB_SPOT[e.al] });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 複製＋協作攻擊：本體與兩邊的複製頭上 1、2、3 號，依序放強攻擊 */
function coop(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.coop, tag = '協作攻擊';
  const xs = G.rng.shuffle([-o.cloneX, 0, o.cloneX]);
  const kinds = xs.map(() => G.rng.pickOne<StrikeKind>(['fist', 'mouth']));
  at(G, t0, () => {
    G.bosses = G.bosses.filter((b) => !b.id.startsWith('clone'));
    [-o.cloneX, o.cloneX].forEach((x, i) => G.bosses.push({ id: `clone${i}`, name: '複製的傑克', x, y: B.y, face: Math.PI, r: 4, px: x, py: B.y, pface: Math.PI }));
  });
  const end = castAt(G, t0, '複製・協作攻擊', o.cast, '三隻頭上 1、2、3 號：照號碼順序看動作躲（握拳＝兩側、張嘴＝中間）', '傑克');
  const t1 = end + 0.5;
  at(G, t0, () => { G.x.knave = { pose: xs.map((x, i) => ({ x, k: kinds[i], until: t1 + i * o.gap, n: i + 1 })) }; });
  xs.forEach((x, i) => aoe(G, t1 + i * o.gap, strikeShapes(x, kinds[i]), { tag, show: o.show, why: `第 ${i + 1} 號的強攻擊沒躲開`, ok: i === 2 ? '照順序躲開三次強攻擊' : null }));
  const last = t1 + 2 * o.gap;
  at(G, last + 0.5, () => { G.bosses = G.bosses.filter((b) => !b.id.startsWith('clone')); });
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 魔法衝擊彈 α：隨機 6 人圓形分散，接著兩組橫向直線 */
const ALPHA_SPOT: Vec[] = [{ x: -16, y: -4 }, { x: -16, y: 10 }, { x: -6, y: 16 }, { x: 6, y: 16 }, { x: 16, y: 10 }, { x: 16, y: -4 }, { x: -8, y: 4 }, { x: 8, y: 4 }];
function alpha(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.alpha, tag = '魔法衝擊彈 α';
  const end = castAt(G, t0, tag, o.cast, '被點名的人分散；接著場上兩組橫向直線先後發動', '傑克');
  const list = G.rng.shuffle(G.ents).slice(0, o.n);
  let spotOf: number[] | null = null;
  spread(G, end, { tag, show: o.cast, r: o.r, targets: list, spot: (_e, i) => ALPHA_SPOT[(spotOf ??= assignSpots(list.map((e) => ({ x: e.x, y: e.y })), ALPHA_SPOT))[i]], rest: (e) => home(e.al, e.role) });
  for (let w = 0; w < 2; w++) {
    const ys = [0, 1, 2].map((i) => -12 + i * 12 + (w ? 6 : 0));
    aoe(G, end + 1.5 + w * o.gap, ys.map((y) => ({ k: 'line' as const, x: 0, y, a: deg(90), hw: o.lineHW })), { tag: `${tag}（直線）`, show: 2, why: '被魔法衝擊彈 α 的直線打中', ok: w ? '躲開兩組直線' : null });
  }
  settle(G, end + 1.5 + o.gap + 0.4, me);
  return end + 1.5 + o.gap + 1;
}

/** 輕躍＋衝撞：兩處距離衰減，之後出現白塊；從一側極遠擊退，要站在白塊後面擋（或開防擊退） */
const BLOCKS: Vec[] = [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: -6, y: 8 }, { x: 6, y: 8 }];
interface KnaveState { pose?: { x: number; k: StrikeKind; until: number; n?: number }[]; blocks?: { until: number }; charge?: { from: number; until: number } }
function leap(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.leap, tag = '衝撞';
  const end = castAt(G, t0, '輕躍', o.cast, '兩處距離衰減 AOE；落地後出現白塊，接著衝撞擊退：站到白塊後面擋住', '傑克');
  const pts: Vec[] = [{ x: G.rng.rnd(-12, 12), y: G.rng.rnd(-8, 12) }];
  pts.push({ x: -pts[0].x, y: G.rng.rnd(-8, 12) });
  aoe(G, end, pts.map((p) => ({ k: 'circle' as const, ...p, r: o.r })), { tag: '輕躍', show: o.cast, why: '離傑克落地點太近（距離衰減）' });
  const side = G.rng.chance(0.5) ? -1 : 1; // 衝撞從西（−1）或東（+1）來
  const dir = side < 0 ? DIR.E : DIR.W, v = dirV(dir);
  const tc = end + 1 + o.charge;
  at(G, end + 0.3, () => { G.x.knave = { ...encData<KnaveState>(G, 'knave', () => ({})), blocks: { until: tc + 0.6 }, charge: { from: side, until: tc } }; });
  castAt(G, end + 1, tag, o.charge, `傑克從${side < 0 ? '西' : '東'}邊衝撞：站在白塊的${side < 0 ? '東' : '西'}側（擋住），或開防擊退`, '傑克', false);
  const hb = o.block / 2;
  const shadowed = (p: Vec): boolean => BLOCKS.some((b) => {
    const dx = p.x - b.x, dy = p.y - b.y, along = dx * v.x + dy * v.y, across = Math.abs(dx * v.y - dy * v.x);
    return along >= hb - 0.2 && along <= hb + 8 && across <= hb - HIT;
  });
  // 24 人平均分到 4 個白塊後面：每個白塊後面 6 人（3 排 × 2 列）
  const spotOf = (e: Entity): Vec => {
    const n = ALS.indexOf(e.al) * 8 + ROLES.indexOf(e.role), b = BLOCKS[n % 4], k = Math.floor(n / 4);
    return { x: b.x + v.x * (hb + 1 + (k % 3) * 1.2), y: b.y + (Math.floor(k / 3) - 0.5) * 1.1 };
  };
  at(G, end + 1 + REACT, () => { npcs(G).forEach((e) => { e.mt = spotOf(e); }); G.hints = [{ ...spotOf(G.player), r: 1.2, label: '白塊後面' }]; });
  at(G, tc, () => {
    G.hints = [];
    G.fx.push({ k: 'kb', x: side * T.half, y: 0, until: G.t + 0.6 });
    present(G).forEach((e) => {
      if (hasBuff(G, e, 'akb') || shadowed(e)) return;
      force(e, v.x, v.y, o.kb, 0.8);
      if (!e.isPlayer) botHit(G, e, tag, '沒站在白塊後面');
    });
  });
  at(G, tc + 1, () => { const P = G.player; if (!P.dead && !((P.fellAt ?? -Infinity) > tc)) good(G, tag, hasBuff(G, P, 'akb') ? '開防擊退擋住衝撞' : '躲在白塊後面擋住衝撞', { ...spotOf(P), r: 1.2, label: '白塊後面' }); });
  settle(G, tc + 1.1, me);
  return tc + 1.6;
}

const roar = (G: GameState, t0: number): number => raidwide(G, t0, '咆哮', 5, undefined, '傑克') + 0.8;
const randStrike = (G: GameState): StrikeKind => G.rng.pickOne<StrikeKind>(['fist', 'mouth']);

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [roar, (g: GameState, x: number) => strike(g, x, randStrike(g)), beta, coop, alpha, leap, roar, coop, (g: GameState, x: number) => strike(g, x, randStrike(g)), leap, beta]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['咆哮', '強攻擊', '魔法衝擊彈 β', '複製', '協作攻擊', '魔法衝擊彈 α', '球體放出', '輕躍'];

export const knave: Encounter = {
  id: 'knave',
  name: '傑克',
  sub: '第一王・場邊會掉下去',
  arena: squareArena(T.half, 'fall'),
  bosses: [{ id: 'knave', name: '傑克', x: B.x, y: B.y, face: Math.PI, r: 5 }],
  home,
  startFace: 0,
  info: {
    咆哮: { effect: '全場 AOE。', tell: '傑克詠唱。', how: '補師注意回復。' },
    強攻擊: { effect: '傑克或複製的傑克二選一：<b>雙手握拳</b> → 兩側直線（物理）；<b>嘴部發光</b> → 中間直線（魔法）。', tell: '觀察特效：<b>張嘴發光</b>或<b>兩手握拳、全身蓄力</b>。', how: '張嘴發光 → 躲<b>兩側</b>；握拳 → 站<b>中間</b>。會和後面的機制組成複合機制。' },
    '魔法衝擊彈 β': { effect: '點名三名坦克，高傷害圓形 AOE。', tell: '坦克頭上紅圈。', how: '遠離人群、開減傷。' },
    複製: { effect: '場地西側與東側出現複製的傑克。', tell: '場邊出現分身。', how: '之後三隻依號碼輪流放技能。' },
    協作攻擊: { effect: '傑克與複製連線，頭上出現 1、2、3 號，代表接下來放強攻擊或衝撞的順序。', tell: '頭上的 1、2、3 號標記。', how: '依號碼順序觀察每一隻的動作，一個一個躲。' },
    '魔法衝擊彈 α': { effect: '點名隨機玩家的圓形 AOE，以及場上先後發動的兩組直線 AOE。', tell: '頭上點名＋地面直線預兆。', how: '被點的人分散；兩組直線依序躲。' },
    球體放出: { effect: '場地南北兩側出現能量彈，碰到會自爆（單體傷害）。', tell: '南北出現能量彈。', how: '不要碰到。（模擬器略過）' },
    輕躍: { effect: '傑克在場中兩個位置放距離衰減 AOE，之後出現白色障礙物（白塊）；接著<b>衝撞</b>：傑克或複製朝對側發動極遠距離擊退，每次衝撞會清掉白塊並生成新的。', tell: '場上出現白塊，傑克準備衝撞。', how: '<b>用白塊擋住</b>擊退（站在白塊的另一側），不然會被擊落；第二次之後可以開<b>防擊退</b>。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['咆哮', '強攻擊', '魔法衝擊彈 β', '複製＋協作攻擊（1、2、3 號）', '魔法衝擊彈 α', '輕躍＋衝撞（白塊）', '咆哮', '協作攻擊', '強攻擊', '輕躍＋衝撞', '魔法衝擊彈 β']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    strike: drill({ name: '強攻擊', sub: '握拳／張嘴', brief: '', info: ['強攻擊'], mechs: ['強攻擊'], seg: (G, t0) => strike(G, t0, variant<StrikeKind>(G, 'strike', randStrike(G))) }),
    coop: drill({ name: '協作攻擊', sub: '1、2、3 號依序', brief: '', info: ['複製', '協作攻擊'], mechs: ['協作攻擊'], seg: coop }),
    alpha: drill({ name: '魔法衝擊彈 α／β', sub: '分散、直線、坦克', brief: '', info: ['魔法衝擊彈 α', '魔法衝擊彈 β'], mechs: ['魔法衝擊彈 α', '魔法衝擊彈 β'], seg: (G, t0) => beta(G, alpha(G, t0) + 1) }),
    leap: drill({ name: '輕躍＋衝撞', sub: '白塊擋擊退', brief: '', info: ['輕躍'], mechs: ['輕躍', '衝撞'], seg: leap }),
  },
  variants: {
    strike: [{ key: 'strike', label: '動作', opts: [
      { value: 'fist', label: '雙手握拳', tell: '兩手握拳、全身蓄力', how: '兩側直線：站<b>中間</b>。' },
      { value: 'mouth', label: '張嘴發光', tell: '嘴部發光', how: '中間直線：躲<b>兩側</b>。' },
    ] }],
  },
  draw(c, G, layer) {
    const s = G.x.knave as KnaveState | undefined;
    if (!s) return;
    if (layer === 'floor' && s.blocks && G.t < s.blocks.until) {
      c.save(); c.fillStyle = '#f1ecd8'; c.strokeStyle = '#4a463c'; c.lineWidth = px(1.5);
      BLOCKS.forEach((b) => { c.fillRect(b.x - T.leap.block / 2, b.y - T.leap.block / 2, T.leap.block, T.leap.block); c.strokeRect(b.x - T.leap.block / 2, b.y - T.leap.block / 2, T.leap.block, T.leap.block); });
      c.restore();
      if (s.charge && G.t < s.charge.until) text(c, s.charge.from < 0 ? '◀ 衝撞從西邊來' : '衝撞從東邊來 ▶', 0, 18, 14, '#ff9aa4');
    }
    if (layer === 'top') (s.pose ?? []).forEach((p) => { if (G.t < p.until) text(c, `${p.n ? p.n + ' ' : ''}${p.k === 'fist' ? '握拳' : '張嘴發光'}`, p.x, B.y - 6, 13, '#ffd36b'); });
  },
  loot: {
    currency: [[TOMES.詩學, 10], [TOMES.數理, 15]],
    items: [...towerGear('頭部'), ...towerGear('腳部')],
  },
};
