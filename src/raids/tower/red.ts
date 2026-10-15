/*
 * 尼爾 3 希望之砲台：塔・第三王：紅衣少女
 * 資料：機制攻略/尼爾3_希望之砲台塔.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、牆壁位置與大小都是估計（T）。
 * 略過：衝擊波清牆、吸引、複製（九個／六個）的旋轉扇形、超越（電腦空間射擊）、控制人偶（紅衣少女）。
 */
import { ROLES, ALS, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, dirV, DIR } from '../../core/geometry';
import { HIT, REACT } from '../../core/tuning';
import { alertMsg, at, encData, force, present, variant, type Entity, type GameState } from '../../game/state';
import { bad, good, botHit } from '../../game/results';
import { claim, npcs, settle } from '../../game/bots';
import { buster, castAt, passIf, raidwide } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { px, text, circle } from '../../render/canvas';
import type { Encounter } from '../types';
import { TOMES, towerGear } from './shared';
import { clusterHome } from '../layout';

const T = {
  half: 20,
  /** 即死區域：場地周圍寬度、中心半徑（估計） */
  edge: 3, center: 4,
  /** 牆壁：離中心距離、長度（估計） */
  wall: { d: 8, len: 9 },
  meteor: { cast: 7 },
  energy: { cast: 4.5, r: 6 },
  /** 控制人偶：強制移動 4 秒（資料），距離約半場（估計） */
  puppet: { cast: 5, dur: 4, dist: 11, n: 6 },
};

const C0: Vec = { x: 0, y: 0 };
const home = clusterHome(C0, 9.5);
type Col = 'white' | 'black';
interface Wall { c: Vec; dir: number; col: Col }
interface RedState { walls?: Wall[]; meteor?: { p: Vec; col: Col; until: number }; arrows?: { e: Entity; dir: number; until: number }[] }
const S = (G: GameState): RedState => encData<RedState>(G, 'red', () => ({}));
const setS = (G: GameState, patch: Partial<RedState>): void => { G.x.red = { ...S(G), ...patch }; };

/** 四面牆（北、東、南、西，離中心 d），顏色白黑交錯或隨機；dir＝牆的方向（沿牆的角度） */
function makeWalls(G: GameState): Wall[] {
  const d = T.wall.d, white = G.rng.chance(0.5);
  return [
    { c: { x: 0, y: -d }, dir: DIR.E, col: white ? 'white' : 'black' },
    { c: { x: d, y: 0 }, dir: DIR.S, col: white ? 'black' : 'white' },
    { c: { x: 0, y: d }, dir: DIR.E, col: white ? 'white' : 'black' },
    { c: { x: -d, y: 0 }, dir: DIR.S, col: white ? 'black' : 'white' },
  ];
}

/** 從隕石 M 看過去，牆有沒有擋在 p 前面（判定圈整個被擋住） */
function blocked(M: Vec, p: Vec, w: Wall): boolean {
  const u = dirV(w.dir), dx = p.x - M.x, dy = p.y - M.y;
  const nx = -u.y, ny = u.x; // 牆的法向量
  const denom = dx * nx + dy * ny;
  if (Math.abs(denom) < 1e-6) return false;
  const t = ((w.c.x - M.x) * nx + (w.c.y - M.y) * ny) / denom; // M→p 線段上碰到牆線的位置
  if (t <= 0 || t >= 1) return false;
  const hx = M.x + dx * t - w.c.x, hy = M.y + dy * t - w.c.y, along = hx * u.x + hy * u.y;
  // 角色要在牆後面一點（不能貼在牆上）
  const behind = Math.hypot(dx, dy) * (1 - t);
  return Math.abs(along) <= T.wall.len / 2 - HIT && behind >= HIT;
}

/** 再現：隕石——隕石落下時全場即死，要讓同色的牆擋在自己和隕石之間。center＝第一次（場中白色隕石） */
function meteor(G: GameState, t0: number, where: 'center' | 'side'): number {
  const me = claim(G, t0), o = T.meteor, tag = '再現：隕石';
  const walls = makeWalls(G);
  const col: Col = where === 'center' ? 'white' : variant<Col>(G, 'meteorCol', G.rng.chance(0.5) ? 'white' : 'black');
  const M: Vec = where === 'center' ? C0 : G.rng.pickOne([{ x: 0, y: -17 }, { x: 17, y: 0 }, { x: 0, y: 17 }, { x: -17, y: 0 }]);
  const end = castAt(G, t0, tag, o.cast, `${col === 'white' ? '白' : '黑'}色隕石：躲到${col === 'white' ? '白' : '黑'}色牆壁後面（牆擋在你和隕石之間）`, '紅衣少女');
  at(G, t0, () => setS(G, { walls, meteor: { p: M, col, until: end } }));
  // Bot：躲到和隕石同色、擋得住的牆後面（每面牆後面排一排）
  const usable = walls.filter((w) => w.col === col && Math.hypot(w.c.x - M.x, w.c.y - M.y) > 1);
  const spotOf = (e: Entity): Vec => {
    const n = ALS.indexOf(e.al) * 8 + ROLES.indexOf(e.role), w = usable[n % usable.length], k = Math.floor(n / usable.length);
    const out = M === C0 ? angTo(C0, w.c) : angTo(M, w.c), v = dirV(out), u = dirV(w.dir);
    // 每面牆後面排兩排、每排 6 人（排太多排會排進中央的即死區）
    const along = -3.6 + (k % 6) * 1.44, back = 2 + Math.floor(k / 6) * 1.3;
    return { x: w.c.x + v.x * back + u.x * along, y: w.c.y + v.y * back + u.y * along };
  };
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = spotOf(e); }); G.hints = [{ ...spotOf(G.player), r: 1.2, label: '躲牆後' }]; });
  at(G, end, () => {
    G.hints = [];
    G.fx.push({ k: 'flash', until: G.t + 0.5 });
    const P = G.player;
    present(G).forEach((e) => {
      const ok = walls.some((w) => w.col === col && blocked(M, e, w));
      if (e === P) {
        const fix = { ...spotOf(P), r: 1.2, label: `${col === 'white' ? '白' : '黑'}色牆後面` };
        if (ok) good(G, tag, '同色牆壁擋住了隕石', fix); else bad(G, tag, '沒有同色牆壁擋住隕石（即死）', fix);
        if (!ok && !(G.cfg.failMode === 'continue' || G.auto)) { P.dead = true; G.endT = Math.min(G.endT, G.t + 1.5); }
      } else if (!ok) botHit(G, e, tag, '沒躲在同色牆後');
    });
  });
  at(G, end + 0.5, () => setS(G, { walls: [], meteor: undefined }));
  settle(G, end + 0.6, me);
  return end + 1.2;
}

/** 能量集中：點名三名坦克，高傷害圓形 */
const TB_SPOT: Record<Alliance, Vec> = { A: { x: -12, y: 12 }, B: { x: 0, y: 14 }, C: { x: 12, y: 12 } };
function energy(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.energy, tag = '能量集中';
  const end = castAt(G, t0, tag, o.cast, '坦克紅色點名：遠離人群', '紅衣少女');
  buster(G, end, { tag, show: o.cast, targets: G.ents.filter((e) => e.role === 'MT'), r: o.r, spot: (e) => TB_SPOT[e.al] });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 控制人偶（玩家）：鎖鏈連住部分玩家、出現方向箭頭，讀條結束朝那個方向強制移動 4 秒；不要走進即死區域 */
function puppet(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.puppet, tag = '控制人偶';
  const end = castAt(G, t0, tag, o.cast, '先看自己有沒有被連線、箭頭往哪：站好位置，被強制移動後不會走進中央或場邊的即死區', '紅衣少女');
  const list = G.rng.shuffle(G.ents).slice(0, o.n);
  const dirs = list.map(() => G.rng.pickOne([DIR.N, DIR.E, DIR.S, DIR.W]));
  // 起點：往反方向退一半距離、往側面偏 9 m（路線不會經過中央）
  const startOf = (e: Entity): Vec => {
    const i = list.indexOf(e), v = dirV(dirs[i]), n = { x: -v.y, y: v.x }, s = i % 2 ? 1 : -1;
    return { x: -v.x * (o.dist / 2) + n.x * s * 9.5, y: -v.y * (o.dist / 2) + n.y * s * 9.5 };
  };
  at(G, t0, () => {
    setS(G, { arrows: list.map((e, i) => ({ e, dir: dirs[i], until: end + o.dur })) });
    list.forEach((e) => G.fx.push({ k: 'tether', from: 'red', to: e, until: end, col: 'rgba(255,93,108,.8)' }));
    if (list.includes(G.player)) G.hints = [{ ...startOf(G.player), r: 1.4, label: '從這裡被拉走' }];
  });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { if (list.includes(e)) e.mt = startOf(e); }));
  at(G, end, () => {
    G.hints = [];
    list.forEach((e, i) => { if (e.dead || e.away) return; const v = dirV(dirs[i]); force(e, v.x, v.y, o.dist, o.dur); if (npcs(G).includes(e)) e.mt = null; });
  });
  passIf(G, end + o.dur + 0.1, tag, t0, '強制移動後沒走進即死區域');
  settle(G, end + o.dur + 0.3, me);
  return end + o.dur + 1;
}

const cruelty = (G: GameState, t0: number): number => raidwide(G, t0, '殘忍', 5, '全場 AOE，並清掉場上所有白色、黑色障礙', '紅衣少女') + 0.8;

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [cruelty, (g: GameState, x: number) => meteor(g, x, 'center'), energy, puppet, cruelty, (g: GameState, x: number) => meteor(g, x, 'side'), puppet, energy, (g: GameState, x: number) => meteor(g, x, 'side')]) t = f(G, t) + 1.5;
  at(G, t, () => alertMsg(G, '超越：三隊被傳送到電腦空間（模擬器略過）', 2.5));
  return t + 3;
}

const ALL = ['殘忍', '即死區域', '再現：隕石', '能量集中', '控制人偶', '複製', '超越'];

export const red: Encounter = {
  id: 'red',
  name: '紅衣少女',
  sub: '第三王・白牆黑牆',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'red', name: '紅衣少女', x: 0, y: -14, face: Math.PI, r: 3, col: '#ff8a8a' }],
  home,
  startFace: Math.PI,
  // 場地周圍與中心是即死區域（資料：開場不久出現；模擬器一開始就有）
  onEnter(G) {
    const H = T.half, E = T.edge, why = '走進紅色的即死區域', z = (O: Vec, Hd: number): void => { G.zones.push({ shape: { k: 'rect', O, H: Hd, len: H * 2, w: E * 2 }, from: 0, until: 1e9, tag: '即死區域', why, col: 'fire', lethal: true }); };
    z({ x: -H, y: -H }, DIR.E); z({ x: -H, y: H }, DIR.E); z({ x: -H, y: -H }, DIR.S); z({ x: H, y: -H }, DIR.S);
    G.zones.push({ shape: { k: 'circle', x: 0, y: 0, r: T.center }, from: 0, until: 1e9, tag: '即死區域', why, col: 'fire', lethal: true });
  },
  info: {
    殘忍: { effect: '全場 AOE，並清除場上所有白色與黑色障礙。', tell: '紅衣少女詠唱。', how: '不用走位。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    即死區域: { effect: '場地周圍與中心會出現即死區域。', tell: '開場不久，場地周圍與中央變紅。', how: '紅色區域是秒殺區，不要進去。' },
    '再現：隕石': { effect: '場上出現黑或白隕石，落下時發動秒殺級全場 AOE；玩家和隕石之間有<b>同色</b>障礙就不受傷害。第一次固定是場地中心的白色隕石，之後黑白各一顆。', tell: '隕石的顏色與位置。', how: '躲到<b>同色牆壁</b>的另一側，讓牆擋在自己和隕石之間；黑白各一顆時要找能同時擋住兩顆的位置。（白點名清黑牆、黑點名清白牆：模擬器略過）' },
    能量集中: { effect: '點名三名坦克，高傷害圓形 AOE。', tell: '坦克紅色預警。', how: '遠離人群。', tank: '三隊坦克各自離開人群、互相不要重疊，開減傷（模擬器站位：A 隊西南、B 隊南側、C 隊東南）。不要退進場邊的即死區域。', heal: '三名坦克同時吃高傷害：先替自己隊的坦克上盾、抬滿血。' },
    控制人偶: { effect: '紅衣少女用鎖鏈連住部分玩家並出現方向預兆，讀條結束後被連線的玩家朝那個方向強制移動 4 秒（約半場；開疾跑距離接近 2 倍）。', tell: '鎖鏈連線，身上出現箭頭（4 個箭頭指向 Boss＝向前，左／右箭頭＝向左／右）。', how: '先確認自己有沒有被連線，再判斷方向與安全區：站好位置，被拉完不會走進即死區域。' },
    複製: { effect: '場上出現 9 個（或 6 個）面向隨機的紅衣少女，放 120° 扇形（擴散能量彈），每次順時針或逆時針轉 120°。', tell: '分身出現扇形預警與旋轉提示。', how: '隨便找一個少女<b>站到她下方</b>，跟著旋轉提示轉。（模擬器略過）' },
    超越: { effect: '全場 AOE，三隊分別被傳送到電腦空間 A／B／C：變成程序化白／黑，只能射擊與色相反轉，打掉白黑牆與中央紅球後回到原場地。', tell: '紅衣少女瞬移到北側。', how: '1 號技能攻擊、2 號技能變色（可打異色、免疫同色）；打球時出現圓柱要優先處理。（模擬器略過）' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['殘忍', '再現：隕石（場中白色）', '能量集中', '控制人偶', '殘忍', '再現：隕石（側邊）', '控制人偶', '能量集中', '再現：隕石', '（超越：略過）']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法；牆壁位置是示意。</p>', info: ALL, seg: fullSeg }),
    meteor: drill({ name: '再現：隕石', sub: '躲同色牆後', brief: '', info: ['再現：隕石'], mechs: ['再現：隕石'], seg: (G, t0) => meteor(G, t0, variant(G, 'meteor', G.rng.chance(0.5) ? 'center' : 'side') === 'center' ? 'center' : 'side') }),
    puppet: drill({ name: '控制人偶', sub: '強制移動', brief: '', info: ['控制人偶', '即死區域'], mechs: ['控制人偶', '即死區域'], seg: puppet }),
    energy: drill({ name: '能量集中', sub: '坦克點名', brief: '', info: ['能量集中'], mechs: ['能量集中'], seg: energy }),
  },
  variants: {
    meteor: [
      { key: 'meteor', label: '隕石位置', opts: [
        { value: 'center', label: '場中（第一次）', tell: '場地中心的白色隕石', how: '躲到白色牆壁外側。' },
        { value: 'side', label: '側邊', tell: '場邊的黑或白隕石', how: '躲到同色牆壁後面（牆擋在你和隕石之間）。' },
      ] },
    ],
  },
  draw(c, G, layer) {
    const s = G.x.red as RedState | undefined;
    if (!s) return;
    if (layer === 'floor') {
      (s.walls ?? []).forEach((w) => {
        const u = dirV(w.dir), L = T.wall.len / 2;
        c.save(); c.lineCap = 'butt'; c.lineWidth = 1.2; c.strokeStyle = w.col === 'white' ? '#f1ecd8' : '#141210';
        c.beginPath(); c.moveTo(w.c.x - u.x * L, w.c.y - u.y * L); c.lineTo(w.c.x + u.x * L, w.c.y + u.y * L); c.stroke();
        c.lineWidth = px(1.5); c.strokeStyle = w.col === 'white' ? '#8f8870' : '#8f8870'; c.stroke(); c.restore();
      });
      if (s.meteor && G.t < s.meteor.until) {
        const m = s.meteor;
        c.save(); c.fillStyle = m.col === 'white' ? 'rgba(241,236,216,.85)' : 'rgba(20,18,16,.9)'; c.strokeStyle = '#ff5d6c'; c.lineWidth = px(2);
        circle(c, m.p.x, m.p.y, 2); c.fill(); c.stroke(); c.restore();
        text(c, `${m.col === 'white' ? '白' : '黑'}色隕石`, m.p.x, m.p.y - 3, 12, '#ffd36b');
      }
    } else {
      (s.arrows ?? []).forEach((a) => { if (G.t < a.until && !a.e.dead) text(c, ['↑', '→', '↓', '←'][Math.round(a.dir / (Math.PI / 2)) % 4], a.e.x, a.e.y - 2.4, 16, '#ff9aa4'); });
    }
  },
  loot: {
    currency: [[TOMES.詩學, 30], [TOMES.數理, 35]],
    items: [...towerGear('身體'), ...towerGear('腳部')],
  },
};
