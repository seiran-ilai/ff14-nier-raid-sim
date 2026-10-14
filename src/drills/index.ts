// 練習項目 key：
//   <副本>/<王>/<項目>        某個王的時間軸或單一機制，例如 basic/dummy/stack
//   cont:<副本>               整個副本從第一個王連續打到最後（每個王跑它的時間軸）
//   rand:<r|n>:<分鐘>:<id,…>  隨機練習（id 是單一機制的 key；r＝可重複、n＝不重複）
//   weak:<id,…>               弱點練習：把幾個單一機制串成一局
import type { Drill, GameState } from '../game/state';
import { at, alertMsg, freshBosses, seqAdd } from '../game/state';
import { clampIn } from '../core/arena';
import type { Encounter, MechInfo, Raid } from '../raids/types';
import { RAIDS, raidById } from '../raids';
import { flowHtml } from './build';

export interface DrillRef { key: string; raid: Raid; enc: Encounter; id: string; drill: Drill }

export const drillKey = (raid: string, enc: string, id: string): string => `${raid}/${enc}/${id}`;

/** 所有王的所有練習項目（副本 → 王 → 項目的順序） */
export const ALL_DRILLS: DrillRef[] = RAIDS.flatMap((raid) => raid.encounters.flatMap((enc) =>
  Object.entries(enc.drills).map(([id, drill]) => ({ key: drillKey(raid.id, enc.id, id), raid, enc, id, drill }))));

/** 單一機制（隨機、弱點練習用） */
export const SINGLES = ALL_DRILLS.filter((d) => !d.drill.tl);

export const drillRef = (key: string): DrillRef | undefined => ALL_DRILLS.find((d) => d.key === key);

/** 第一個有資料的王（預設練習） */
export const firstDrill = (): DrillRef => ALL_DRILLS[0];

/** 王的時間軸（沒有就第一個項目） */
export const encMain = (raid: Raid, enc: Encounter): DrillRef =>
  ALL_DRILLS.find((d) => d.raid === raid && d.enc === enc && d.drill.tl) ?? ALL_DRILLS.find((d) => d.raid === raid && d.enc === enc)!;

/** 機制說明：先找目前的王，再找全部 */
export function findInfo(name: string, enc?: Encounter): MechInfo | undefined {
  if (enc?.info[name]) return enc.info[name];
  for (const r of RAIDS) for (const e of r.encounters) if (e.info[name]) return e.info[name];
  return undefined;
}

/** 機制名稱 → 單練項目 key（弱點練習用） */
export const singleForMech = (mech: string): string | undefined => SINGLES.find((d) => (d.drill.mechs ?? [d.drill.name]).includes(mech))?.key;

/** 在 t 瞬間切換到另一個王：場地、王、所有人直接站到新場地的原位 */
export function setEncounter(G: GameState, t: number, enc: Encounter): void {
  at(G, t, () => {
    if (G.enc === enc) return;
    G.enc = enc;
    G.arena = enc.arena;
    G.bosses = freshBosses(enc);
    G.x = {};
    G.tele = []; G.objs = []; G.hints = []; G.zones = [];
    G.ents.forEach((e) => {
      const h = clampIn(enc.arena, enc.home(e.al, e.role), 1);
      Object.assign(e, { x: h.x, y: h.y, px: h.x, py: h.y, mt: { ...h }, ov: null, faceLock: null, forced: null, marker: undefined, statuses: [], away: false });
    });
    enc.onEnter?.(G);
    alertMsg(G, `換王：${enc.name}`, 1.8);
  });
}

/** 換王之間的空檔（秒） */
const GAP = 1.5, ENC_GAP = 2.5;

function contDrill(raid: Raid): Drill {
  const mains = raid.encounters.map((enc) => encMain(raid, enc));
  const seg = (G: GameState, t0: number): number => {
    let t = t0;
    mains.forEach((m, i) => {
      if (i > 0) { setEncounter(G, t, m.enc); t += ENC_GAP; }
      seqAdd(G, t, `【${m.enc.name}】`);
      t = m.drill.seg(G, t) + 3;
    });
    return t;
  };
  return {
    tl: true,
    name: `${raid.short}・${raid.name}・連續`,
    sub: mains.map((m) => m.enc.name).join(' → '),
    brief: `從第一個王一路打到最後一個王，每個王跑完整時間軸。${flowHtml(mains.map((m) => `${m.enc.name}：${m.drill.name}`))}`,
    info: [...new Set(mains.flatMap((m) => m.drill.info ?? []))],
    seg,
    setup(G) { const end = seg(G, 0.5); at(G, end, () => { G.endT = G.t; }); },
  };
}

export interface RandOpts { repeat: boolean; mins: number; ids: string[] }
export const randKey = (o: RandOpts): string => `rand:${o.repeat ? 'r' : 'n'}:${o.mins}:${o.ids.join(',')}`;

export function parseRand(key: string): RandOpts | null {
  const m = /^rand:([rn]):([1-5]):(.*)$/.exec(key);
  if (!m) return null;
  const ids = m[3].split(',').filter((id) => SINGLES.some((d) => d.key === id));
  return { repeat: m[1] === 'r', mins: Number(m[2]), ids: ids.length ? ids : SINGLES.map((d) => d.key) };
}

/** 從選的機制隨機抽、一個接一個出；不同王的機制會瞬間換場地 */
function randDrill(o: RandOpts): Drill {
  const refs = o.ids.map((id) => drillRef(id)!);
  const seg = (G: GameState, t0: number): number => {
    const limit = o.mins * 60;
    let t = t0, last = '', cur = G.enc;
    const left = [...o.ids];
    while (t < limit) {
      const pool = o.repeat ? (o.ids.length > 1 ? o.ids.filter((id) => id !== last) : o.ids) : left;
      if (!pool.length) break;
      const id = G.rng.pickOne(pool);
      if (!o.repeat) left.splice(left.indexOf(id), 1);
      const r = drillRef(id)!;
      if (r.enc !== cur) { setEncounter(G, t, r.enc); t += ENC_GAP; cur = r.enc; }
      seqAdd(G, t, `【${r.drill.name}】`);
      t = r.drill.seg(G, t) + GAP;
      last = id;
    }
    return t;
  };
  return {
    tl: true,
    name: `隨機練習・${o.mins} 分鐘`,
    sub: `${o.repeat ? '可重複' : '不重複'}・${o.ids.length} 種機制`,
    brief: `從選的機制隨機抽、一個接一個出（${o.repeat ? '可以重複' : '不重複，用完就提前結束'}），練換機制時的快速反應；不同王的機制會瞬間換場地。`,
    info: [...new Set(refs.flatMap((r) => r.drill.info ?? []))],
    seg,
    setup(G) { const end = seg(G, 1); at(G, end, () => { G.endT = G.t; }); },
  };
}

function weakDrill(ids: string[]): Drill {
  const refs = ids.map(drillRef).filter((r): r is DrillRef => !!r);
  const seg = (G: GameState, t0: number): number => {
    let t = t0;
    refs.forEach((r, i) => {
      if (i > 0 && r.enc !== refs[i - 1].enc) { setEncounter(G, t, r.enc); t += ENC_GAP; }
      seqAdd(G, t, `【${r.drill.name}】`);
      t = r.drill.seg(G, t) + GAP;
    });
    return t;
  };
  return {
    tl: refs.length > 1,
    name: '弱點練習',
    sub: refs.map((r) => r.drill.name).join('・'),
    brief: '把最常失誤的機制串在一起練。' + flowHtml(refs.map((r) => `${r.enc.name}：${r.drill.name}`)),
    info: [...new Set(refs.flatMap((r) => r.drill.info ?? []))],
    seg,
    setup(G) { const end = seg(G, 1); at(G, end, () => { G.endT = G.t; }); },
  };
}

export interface Resolved { drill: Drill; enc: Encounter; raid: Raid }

/** 解析練習項目 key；不認得就用第一個王的第一個項目 */
export function getDrill(key: string): Resolved {
  if (key.startsWith('cont:')) {
    const raid = raidById(key.slice(5));
    if (raid && raid.encounters.length) return { drill: contDrill(raid), enc: raid.encounters[0], raid };
  }
  const rand = parseRand(key);
  if (rand) { const r0 = drillRef(rand.ids[0])!; return { drill: randDrill(rand), enc: r0.enc, raid: r0.raid }; }
  if (key.startsWith('weak:')) {
    const r0 = drillRef(key.slice(5).split(',')[0]);
    if (r0) return { drill: weakDrill(key.slice(5).split(',')), enc: r0.enc, raid: r0.raid };
  }
  const r = drillRef(key) ?? firstDrill();
  return { drill: r.drill, enc: r.enc, raid: r.raid };
}
