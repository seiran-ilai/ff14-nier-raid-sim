/*
 * 尼爾 1 複製工廠廢墟・最終王：9S：接入多腳戰車
 * 資料：灰機 wiki（機制）＋ 新大陸見聞錄（處理方式）。尺寸、秒數、時間軸順序都是估計（T）。
 * 略過的部分：大型戰車階段的坦克拉怪（直線死刑）、最終程序裡士兵機的旋轉攻擊。
 */
import { ALS, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, dirV, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { HIT, REACT } from '../../core/tuning';
import { alertMsg, at, bossById, encData, moveBoss, present, variant, type Entity, type GameState } from '../../game/state';
import { bad, good, botHit } from '../../game/results';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, castAt, passIf, raidwide, spread, stack } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { px, text, circle } from '../../render/canvas';
import type { Encounter } from '../types';
import { clusterHome, yorha, TOMES } from './shared';

const T = {
  half: 20,
  cannon: { cast: 5, w: 8, len: 45 },
  shell: { cast: 4.5, fixedR: 4.5, r: 4, n: 6, spotR: 16 },
  volley: { cast: 5, w: deg(45), r: 40 },
  mekhane: { cast: 5 },
  bomb: { cast: 5, gap: 1.8, show: 2.5 },
  barrage: { cast: 4, n: 3, ann: 1.2, gap: 1.6, visible: 0.5 },
  hack: { cast: 8, shadowW: 6, shadowLen: 30, boom: 3.5, boomR: 10 },
  final: { stackR: 3.5, shieldR: 6, cast: 8 },
};

const C0: Vec = { x: 0, y: 0 };
const home = clusterHome(C0, 8);
const nameOf = '9S';

/** 主炮激光：面向隨機目標的直線 */
function cannon(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.cannon, tag = '主炮激光';
  const end = castAt(G, t0, tag, o.cast, '9S 面向某人射直線：躲開王的正面', nameOf);
  const target = G.rng.pickOne(G.ents.filter((e) => e.role !== 'MT'));
  at(G, t0, () => {
    const b = bossById(G, 'ns'), a = angTo(b, target);
    b.face = a;
    aoe(G, end, { k: 'rect', O: { x: b.x, y: b.y }, H: a, len: o.len, w: o.w }, { tag, show: o.cast, why: '站在 9S 的正面，被主炮打中' });
  });
  at(G, end + 0.3, () => { bossById(G, 'ns').face = Math.PI; });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 炮擊：固定 AOE＋點名 AOE，分散 */
const FIXED: Vec[] = [{ x: 0, y: -11 }, { x: -11, y: -6 }, { x: 11, y: -6 }];
function shelling(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.shell, tag = '炮擊';
  const end = castAt(G, t0, tag, o.cast, '固定 AOE＋點名 AOE：被點的人分散到場邊，其他人躲開地上的圓', nameOf);
  aoe(G, end, FIXED.map((p) => ({ k: 'circle' as const, ...p, r: o.fixedR })), { tag, show: o.cast, why: '被固定的炮擊打中', ok: null });
  const ang = (e: Entity): number => (angTo(C0, home(e.al, e.role)) + 2 * Math.PI) % (2 * Math.PI);
  const list = G.rng.shuffle(G.ents).slice(0, o.n).sort((a, b) => ang(a) - ang(b));
  spread(G, end, { tag, show: o.cast, r: o.r, targets: list, spot: (_e, i) => { const v = dirV(deg(100 + i * 32)); return { x: v.x * o.spotR, y: v.y * o.spotR }; }, rest: (e) => home(e.al, e.role) });
  settle(G, end + 0.4, me);
  return end + 1;
}

export type VolleyKind = 'fb' | 'side';
/** 前後齊射／側面齊射 */
function volley(G: GameState, t0: number, k: VolleyKind): number {
  const me = claim(G, t0), o = T.volley, tag = k === 'fb' ? '前後齊射' : '側面齊射';
  const end = castAt(G, t0, tag, o.cast, k === 'fb' ? '前後扇形：到王的側面' : '左右扇形：到王的前後', nameOf);
  const f = Math.PI, as = k === 'fb' ? [f, f + Math.PI] : [f + Math.PI / 2, f - Math.PI / 2];
  aoe(G, end, as.map((a) => ({ k: 'fan' as const, x: 0, y: 0, r: o.r, a, w: o.w })), { tag, show: o.cast, why: k === 'fb' ? '站在王的前後' : '站在王的左右兩側' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 請求支援：麥喀士——四角中的三角被手臂打，到沒有手臂的角落 */
const QUAD = [{ x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
function mekhane(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.mekhane, tag = '請求支援：麥喀士';
  const end = castAt(G, t0, tag, o.cast, '三個角落上方出現麥喀士手臂（大齒輪）：到沒有手臂的那個角落', nameOf);
  const safe = G.rng.pickOne([0, 1, 2, 3]);
  const H = T.half;
  const quads: Shape[] = QUAD.filter((_q, i) => i !== safe).map((q) => ({ k: 'rect', O: { x: (q.x * H) / 2, y: 0 }, H: q.y < 0 ? DIR.N : DIR.S, len: H, w: H }));
  at(G, t0, () => QUAD.forEach((q, i) => { if (i !== safe) G.objs.push({ k: 'orb', x: q.x * 14, y: q.y * 14, r: 2.2, col: '#8f8870', until: end + 0.5, label: '麥喀士' }); }));
  aoe(G, end + 0.5, quads, { tag, show: o.cast + 0.5, visible: 2, why: '站在有麥喀士手臂的角落', ok: '到沒有手臂的角落' });
  settle(G, end + 0.9, me);
  return end + 1.4;
}

/** 對接解除＋空襲：場地 1/3 寬的步進式轟炸。第一輪從北往南（直條，左中右順序隨機）；9S 旋回的方向就是下一輪的方向 */
function bombRound(G: GameState, t1: number, axis: 'x' | 'y', tag: string, prep: number): number {
  const o = T.bomb, H = T.half, w = (H * 2) / 3;
  const order = G.rng.shuffle([0, 1, 2]);
  const center = (i: number): number => -H + w * (i + 0.5);
  order.forEach((i, k) => {
    const c = center(i);
    const s: Shape = axis === 'x' ? { k: 'rect', O: { x: c, y: -H }, H: DIR.S, len: H * 2, w } : { k: 'rect', O: { x: -H, y: c }, H: DIR.E, len: H * 2, w };
    aoe(G, t1 + k * o.gap, s, { tag, show: o.show, why: `被第 ${k + 1} 條轟炸打中`, ok: null, dodge: false });
  });
  // Bot：先站在和第一條相鄰、比較晚炸的那條（靠近第一條的邊），第一條炸完就踩進去
  const a = order[0], adj = order.slice(1).filter((i) => Math.abs(i - a) === 1);
  const start = adj.includes(order[2]) ? order[2] : adj[0];
  const edge = center(start) + Math.sign(center(a) - center(start)) * (w / 2 - 1.6);
  const into = center(a) + Math.sign(center(start) - center(a)) * (w / 2 - 2.2);
  const put = (e: Entity, v: number): Vec => (axis === 'x' ? { x: v, y: Math.max(-H + 2, Math.min(H - 2, e.y)) } : { x: Math.max(-H + 2, Math.min(H - 2, e.x)), y: v });
  at(G, prep, () => npcs(G).forEach((e) => { e.mt = put(e, edge); }));
  at(G, t1 + 0.05, () => npcs(G).forEach((e) => { e.mt = put(e, into); }));
  return t1 + 2 * o.gap;
}
function bombing(G: GameState, t0: number): number {
  const me = claim(G, t0), tag = '空襲';
  at(G, t0, () => moveBoss(G, 'ns', C0, 1));
  const end = castAt(G, t0, '對接解除', T.bomb.cast, '9S 變成飛行形態轟炸：判定以煙霧為準，前一條炸完再踩進去', nameOf);
  // 第一輪：詠唱時就先站到第一條旁邊（Bot 照攻略）；第二輪：第一輪炸完就過去
  let t = bombRound(G, end + T.bomb.show, 'x', tag, t0 + REACT) + 1.2;
  at(G, t - 1, () => alertMsg(G, '9S 往側面旋回：下一輪從側面來（橫條）', 2));
  t = bombRound(G, t + T.bomb.show, 'y', tag, t - 1.15);
  passIf(G, t + 0.1, tag, t0, '躲開了兩輪空襲');
  settle(G, t + 0.3, me);
  return t + 0.8;
}

/** 對人導彈亂射：先連續提示落點（半場），再依序轟炸 */
function barrage(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.barrage, tag = '對人導彈亂射';
  const end = castAt(G, t0, tag, o.cast, '先記住提示的順序（每次半場），再依序躲：上一發落下後進下一發的安全區', nameOf);
  const dirs = [DIR.N, DIR.E, DIR.S, DIR.W];
  const seq: number[] = [G.rng.pickOne(dirs)];
  while (seq.length < o.n) { const p = seq[seq.length - 1]; seq.push(G.rng.pickOne([p + Math.PI / 2, p - Math.PI / 2])); }
  const half = (a: number): Shape => ({ k: 'half', x: 0, y: 0, r: 70, a });
  seq.forEach((a, k) => at(G, end - o.cast + 0.5 + k * o.ann, () => { G.tele.push({ ...half(a), until: G.t + o.ann * 0.9, col: 'blue' }); }));
  const t1 = end + 1.5;
  seq.forEach((a, k) => aoe(G, t1 + k * o.gap, half(a), { tag, show: o.visible, why: `第 ${k + 1} 發沒躲開`, ok: null, dodge: false }));
  // Bot：站在這一發與下一發都安全的位置（離中心 4 m 的象限點）
  const spot = (k: number): Vec => {
    const v1 = dirV(seq[k] + Math.PI), v2 = k + 1 < seq.length ? dirV(seq[k + 1] + Math.PI) : { x: 0, y: 0 };
    return { x: Math.sign(v1.x + v2.x * 0.5) * 4 || v1.x * 4, y: Math.sign(v1.y + v2.y * 0.5) * 4 || v1.y * 4 };
  };
  at(G, t0 + REACT + o.ann, () => npcs(G).forEach((e) => { e.mt = spot(0); }));
  seq.forEach((_a, k) => { if (k) at(G, t1 + (k - 1) * o.gap + 0.05, () => npcs(G).forEach((e) => { e.mt = spot(k); })); });
  const last = t1 + (o.n - 1) * o.gap;
  passIf(G, last + 0.1, tag, t0, '照順序躲開了導彈亂射');
  settle(G, last + 0.3, me);
  return last + 0.8;
}

/** 請求支援：大型戰車＋駭入：躲到沒被連線的戰車後面，之後立刻遠離它 */
const TANKS: Vec[] = [{ x: -12, y: 12 }, { x: 12, y: -12 }];
interface NsState { tanks?: { until: number; hacked: number }; shadow?: { O: Vec; H: number; until: number } }
const NS = (G: GameState): NsState => encData(G, 'ns', () => ({}));
function hack(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.hack, tag = '駭入：大型戰車';
  at(G, t0 - 1, () => alertMsg(G, '大型戰車階段（坦克拉戰車、面向場外）略過', 1.8));
  const hacked = G.rng.pickOne([0, 1]), X = TANKS[hacked], Y = TANKS[1 - hacked];
  const H = angTo(X, Y), O = { x: Y.x + Math.sin(H) * 1.8, y: Y.y - Math.cos(H) * 1.8 };
  const end = castAt(G, t0, tag, o.cast, '9S 連線駭入一台戰車：躲到「另一台」戰車的後面', nameOf);
  at(G, t0, () => {
    G.x.ns = { ...NS(G), tanks: { until: end + o.boom + 0.5, hacked }, shadow: { O, H, until: end } };
    G.fx.push({ k: 'tether', from: 'ns', to: { x: X.x, y: X.y } as Entity, until: end, col: 'rgba(255,93,108,.9)' });
  });
  const inShadow = (p: Vec): boolean => {
    const v = dirV(H), dx = p.x - O.x, dy = p.y - O.y, t = dx * v.x + dy * v.y, s = Math.abs(dx * v.y - dy * v.x);
    return t >= HIT && t <= o.shadowLen && s <= o.shadowW / 2 - HIT;
  };
  const spotIn = (G2: GameState): Vec => { const v = dirV(H), d = 3 + G2.rng.rnd(0, 3), s = G2.rng.rnd(-1.4, 1.4); return { x: O.x + v.x * d + v.y * s, y: O.y + v.y * d - v.x * s }; };
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = spotIn(G); }); G.hints = [{ x: O.x + Math.sin(H) * 4, y: O.y - Math.cos(H) * 4, r: 2, label: '躲在這台後面' }]; });
  at(G, end, () => {
    G.hints = [];
    G.fx.push({ k: 'flash', until: G.t + 0.4 });
    const P = G.player;
    present(G).forEach((e) => {
      const ok = inShadow(e);
      if (e === P) {
        const fix = { x: O.x + Math.sin(H) * 4, y: O.y - Math.cos(H) * 4, r: 2, label: '另一台戰車的後面' };
        if (ok) good(G, tag, '躲在另一台戰車後面', fix); else bad(G, tag, '沒躲在另一台戰車後面（即死）', fix);
        if (!ok && !(G.cfg.failMode === 'continue' || G.auto)) { P.dead = true; G.endT = Math.min(G.endT, G.t + 1.5); }
      } else if (!ok) botHit(G, e, tag, '沒躲在戰車後面');
    });
  });
  // 掩體戰車自爆：立刻遠離
  castAt(G, end + 0.3, '自爆', o.boom - 0.3, '掩體戰車也要自爆：立刻遠離', '大型戰車', false);
  aoe(G, end + o.boom, { k: 'circle', x: Y.x, y: Y.y, r: o.boomR }, { tag: '自爆', show: o.boom - 0.2, why: '沒離開掩體戰車，被自爆炸到', ok: '立刻遠離掩體戰車' });
  settle(G, end + o.boom + 0.4, me);
  return end + o.boom + 1;
}

/** 駭入：最終程序——三隊各自打士兵機、殘骸墜落（各隊分攤），最後殲滅爆擊進 2P 的防禦力場 */
const STACK_AT: Record<Alliance, Vec> = { A: { x: -10, y: 2 }, B: { x: 0, y: 10 }, C: { x: 10, y: 2 } };
const SHIELD: Vec = { x: 0, y: 4 };
function finalProgram(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.final;
  at(G, t0, () => { moveBoss(G, 'ns', { x: 0, y: -17 }, 1.5); alertMsg(G, '駭入：最終程序（駭客進度條滿就全滅）', 2.5); });
  const s1 = castAt(G, t0 + 2, '殘骸墜落', 5, '各隊點 1 人分攤：A 西、B 南、C 東各自分攤', nameOf);
  const tg = Object.fromEntries(ALS.map((al) => [al, G.rng.pickOne(G.ents.filter((e) => e.al === al))])) as Record<Alliance, Entity>;
  stack(G, s1, { tag: '殘骸墜落', show: 5, r: o.stackR, targets: ALS.map((al) => tg[al]), groupOf: (e) => tg[e.al], spot: (x) => STACK_AT[x.al], need: 6 });
  const tag = '殲滅爆擊';
  const end = castAt(G, s1 + 2, tag, o.cast, '全場即死：進 2P 的防禦力場（受傷減輕）', nameOf);
  at(G, s1 + 2, () => { G.objs.push({ k: 'orb', x: SHIELD.x, y: SHIELD.y - o.shieldR - 1, r: 0.9, col: '#f1ecd8', until: end + 0.5, label: '2P' }); G.hints = [{ ...SHIELD, r: o.shieldR, label: '2P 的防禦力場' }]; });
  at(G, s1 + 2 + REACT, () => npcs(G).forEach((e) => { e.mt = { x: SHIELD.x + G.rng.rnd(-3, 3), y: SHIELD.y + G.rng.rnd(-3, 3) }; }));
  at(G, end, () => {
    G.hints = [];
    G.fx.push({ k: 'flash', until: G.t + 0.5 });
    const P = G.player, fix = { ...SHIELD, r: o.shieldR, label: '2P 的防禦力場' };
    present(G).forEach((e) => {
      const ok = Math.hypot(e.x - SHIELD.x, e.y - SHIELD.y) <= o.shieldR - HIT;
      if (e === P) { if (ok) good(G, tag, '在防禦力場裡擋下殲滅爆擊', fix); else bad(G, tag, '不在 2P 的防禦力場裡（即死）', fix); }
      else if (!ok) botHit(G, e, tag, '不在防禦力場裡');
    });
  });
  settle(G, end + 0.4, me);
  return end + 1;
}

const suppress = (G: GameState, t0: number): number => castAt(G, t0, '壓制射擊', 4, '對 MT 的死刑：坦克開減傷', nameOf) + 0.5;
const allLaser = (G: GameState, t0: number): number => raidwide(G, t0, '全方位激光', 5, undefined, nameOf) + 0.8;

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [
    suppress, cannon, (g: GameState, x: number) => volley(g, x, 'fb'), shelling, allLaser, (g: GameState, x: number) => volley(g, x, 'side'),
    mekhane, bombing, cannon, barrage, allLaser, hack, finalProgram,
  ]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['壓制射擊', '全方位激光', '主炮激光', '炮擊', '前後齊射', '側面齊射', '請求支援：麥喀士', '對接解除', '對人導彈亂射', '請求支援：大型戰車', '駭入：大型戰車', '駭入：最終程序', '殲滅爆擊'];

export const ninesee: Encounter = {
  id: 'ns',
  name: '9S：接入多腳戰車',
  sub: '最終王',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'ns', name: '9S', x: 0, y: 0, face: Math.PI, r: 5 }],
  home,
  startFace: Math.PI,
  info: {
    壓制射擊: { effect: '對 MT 的死刑。', tell: '9S 詠唱「壓制射擊」。', how: '坦克開減傷。' },
    全方位激光: { effect: '全場 AOE。', tell: '9S 詠唱「全方位激光」。', how: '不用走位。' },
    主炮激光: { effect: '面向隨機目標放直線 AOE。', tell: '9S 詠唱並轉向某人。', how: '躲開王的<b>正面</b>。' },
    炮擊: { effect: '固定 AOE 與點名 AOE 的組合。', tell: '地上出現固定圓圈，部分人頭上出現點名。', how: '被點的人分散，其他人躲開地上的圓。' },
    前後齊射: { effect: '對 9S 前後方放扇形 AOE。', tell: '9S 詠唱「前後齊射」。', how: '到王的<b>側面</b>。' },
    側面齊射: { effect: '對 9S 左右方放扇形 AOE。', tell: '9S 詠唱「側面齊射」。', how: '到王的<b>前後</b>。' },
    '請求支援：麥喀士': { effect: '場地四角召喚數個麥喀士手臂懸停在上方，放 1/4 場地大小的 AOE。', tell: '場地邊上出現大齒輪（手臂）。', how: '到<b>沒有手臂的那一角</b>。' },
    對接解除: { effect: '9S 移到中央讀條後無法選中，切換飛行形態，對場地步進式轟炸（1/3 場地寬）。第一輪一定從北往南，左中右順序隨機；第一次轟炸落地前 9S 會往側面旋回，旋回方向就是下一輪的方向。2P 會在下一輪來之前跳到遠離轟炸來向的一側。', tell: '9S 詠唱「對接解除」，飛行形態轟炸；<b>傷害判定以煙霧特效為準</b>。', how: '不要提前移動：<b>上一條炸完再踩進去</b>；可以標記 2P 方便找下一輪的位置。' },
    對人導彈亂射: { effect: '讀條後放覆蓋半個場地的方塊 AOE；會先連續提示落點再依序轟炸。', tell: '連續提示幾個半場的落點。', how: '記住順序，在上一發落下後進下一發的安全區。' },
    '請求支援：大型戰車': { effect: '9S 在場地西南與東北各召喚一輛大型戰車，戰車每隔一段時間鎖定一仇放直線死刑主炮激光；這段期間 9S 無敵、固定在中央，仍會放炮擊與全方位激光。', tell: '場地兩角掉下兩輛戰車。', how: '每輛戰車都要有一名坦克拉住並<b>面向場外</b>。（模擬器略過）' },
    '駭入：大型戰車': { effect: '打倒兩輛戰車後，9S 連線其中一輛駭入自爆：讀條結束全場即死 AOE；接著掩體戰車也讀條自爆，造成大範圍 AOE。', tell: '9S 和其中一輛戰車連線，戰車上有環形駭入進度條。', how: '所有人到<b>沒被連線的那輛戰車後面</b>躲；結束後<b>立刻遠離</b>這輛掩體戰車。' },
    '駭入：最終程序': { effect: '轉階段：9S 到場地 12 點、無法選中；3、6、9 點各召喚一隻士兵機（攻擊同第一王：強攻擊、中央／側方旋轉攻擊、殘骸墜落＝各隊分攤）。駭客進度條滿就全滅。', tell: '畫面出現駭客進度條。', how: '各隊原地拉住並打倒自己的士兵機；殘骸墜落時三隊各自分攤。' },
    殘骸墜落: { effect: '9S 點各隊 1 人分攤。', tell: '各隊一人頭上出現分攤標記。', how: '三個小隊各自分攤。' },
    殲滅爆擊: { effect: '打倒三隻士兵機後，9S 讀條全場秒殺 AOE；2P 生成防禦力場（受傷減輕）。', tell: '9S 詠唱「殲滅爆擊」，2P 展開防禦力場。', how: '所有人進 <b>2P 的防禦力場</b>。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['壓制射擊', '主炮激光', '前後齊射', '炮擊', '全方位激光', '側面齊射', '請求支援：麥喀士', '對接解除＋空襲（兩輪）', '主炮激光', '對人導彈亂射', '全方位激光', '（大型戰車：略過）→ 駭入：大型戰車', '駭入：最終程序 → 殘骸墜落 → 殲滅爆擊']) + '<p class="bnote">wiki 與攻略都沒有寫完整順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    cannon: drill({ name: '主炮激光', sub: '躲正面', brief: '', info: ['主炮激光'], mechs: ['主炮激光'], seg: cannon }),
    shell: drill({ name: '炮擊', sub: '固定＋點名分散', brief: '', info: ['炮擊'], mechs: ['炮擊'], seg: shelling }),
    volley: drill({ name: '前後／側面齊射', sub: '扇形', brief: '', info: ['前後齊射', '側面齊射'], mechs: ['前後齊射', '側面齊射'],
      seg: (G, t0) => volley(G, t0, variant<VolleyKind>(G, 'volley', G.rng.chance(0.5) ? 'fb' : 'side')) }),
    mekhane: drill({ name: '請求支援：麥喀士', sub: '找沒手臂的角落', brief: '', info: ['請求支援：麥喀士'], mechs: ['請求支援：麥喀士'], seg: mekhane }),
    bombing: drill({ name: '對接解除＋空襲', sub: '1/3 場地步進轟炸', brief: '', info: ['對接解除'], mechs: ['空襲'], seg: bombing }),
    barrage: drill({ name: '對人導彈亂射', sub: '記順序', brief: '', info: ['對人導彈亂射'], mechs: ['對人導彈亂射'], seg: barrage }),
    hack: drill({ name: '駭入：大型戰車', sub: '躲戰車後面', brief: '', info: ['駭入：大型戰車'], mechs: ['駭入：大型戰車', '自爆'], seg: hack }),
    final: drill({ name: '駭入：最終程序', sub: '分攤＋2P 防禦力場', brief: '', info: ['駭入：最終程序', '殘骸墜落', '殲滅爆擊'], mechs: ['殘骸墜落', '殲滅爆擊'], seg: finalProgram }),
  },
  variants: {
    volley: [{ key: 'volley', label: '種類', opts: [
      { value: 'fb', label: '前後齊射', tell: '9S 詠唱「前後齊射」', how: '到王的<b>側面</b>。' },
      { value: 'side', label: '側面齊射', tell: '9S 詠唱「側面齊射」', how: '到王的<b>前後</b>。' },
    ] }],
  },
  draw(c, G, layer) {
    const s = G.x.ns as NsState | undefined;
    if (!s?.tanks || G.t > s.tanks.until) return;
    if (layer === 'floor' && s.shadow && G.t < s.shadow.until) {
      // 駭入：整個場地紅色，只有另一台戰車後面安全
      const { O, H } = s.shadow, v = dirV(H), n = { x: -v.y, y: v.x }, w = T.hack.shadowW / 2, L = T.hack.shadowLen;
      c.save();
      c.beginPath(); c.rect(-T.half, -T.half, T.half * 2, T.half * 2);
      c.moveTo(O.x + n.x * w, O.y + n.y * w); c.lineTo(O.x - n.x * w, O.y - n.y * w); c.lineTo(O.x - n.x * w + v.x * L, O.y - n.y * w + v.y * L); c.lineTo(O.x + n.x * w + v.x * L, O.y + n.y * w + v.y * L); c.closePath();
      c.fillStyle = `rgba(255,70,90,${0.18 + 0.06 * Math.sin(G.t * 8)})`; c.fill('evenodd');
      c.restore();
    }
    if (layer === 'top') {
      TANKS.forEach((p, i) => {
        c.save(); c.fillStyle = i === s.tanks!.hacked ? '#7a2a2a' : '#4a463c'; c.strokeStyle = '#f1ecd8'; c.lineWidth = px(1.5);
        c.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); c.strokeRect(p.x - 2.5, p.y - 2.5, 5, 5); c.restore();
        text(c, i === s.tanks!.hacked ? '被駭入' : '大型戰車', p.x, p.y, 11, '#f1ecd8', 700);
        if (i === s.tanks!.hacked) { c.save(); c.strokeStyle = '#ff5d6c'; c.lineWidth = px(2); circle(c, p.x, p.y, 3.6); c.stroke(); c.restore(); }
      });
    }
  },
  loot: {
    currency: [[TOMES.詩學, 40], [TOMES.數理, 40], [TOMES.記憶, 12]],
    items: [
      ...yorha('頭部', '軍帽'), ...yorha('身體', '軍裝'), ...yorha('手部', '手套'), ...yorha('腿部', '軍褲'),
      { name: '物資貨箱：二號B型防具', kind: '雜貨' },
      { name: '輔助機054', kind: '寵物' }, { name: '輔助機316', kind: '寵物' },
      { name: '九宮幻卡：9S', kind: '九宮幻卡' },
      ...['遺留之所／斜光', '異物顯現', '遠古之歌／贖罪', '雙極的噩夢', '世界的重量／水晶序曲版'].map((n) => ({ name: `管弦樂琴樂譜：${n}`, kind: '管弦樂琴樂譜' })),
    ],
  },
};
