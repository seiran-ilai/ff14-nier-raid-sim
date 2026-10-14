// 複製工廠廢墟共用：站位、寄葉五一式裝備掉落
import { ROLES, type Alliance, type Role, type Vec } from '../../core/constants';
import { deg, polar } from '../../core/geometry';
import type { LootItem, Slot } from '../types';

/**
 * 原位：以 c 為中心，A／B／C 各佔一個方向（角度，0＝北），每隊 4×2 排列，離中心 d 公尺。
 * 預設 A 西南、B 南、C 東南（王在北或中央時，大家在王的南側）。
 */
export function clusterHome(c: Vec, d: number, angs: Record<Alliance, number> = { A: deg(225), B: deg(180), C: deg(135) }) {
  return (al: Alliance, role: Role): Vec => {
    const i = ROLES.indexOf(role), a = angs[al], p = polar(c, a, d);
    // 沿著切線排 4 個、往外排 2 排
    const tx = Math.cos(a), ty = Math.sin(a), along = -2.1 + (i % 4) * 1.4, out = Math.floor(i / 4) * 1.4;
    const n = polar({ x: 0, y: 0 }, a, out);
    return { x: p.x + tx * along + n.x, y: p.y + ty * along + n.y };
  };
}

/** 寄葉五一式（Lv80・品級 460）七種職能版本；職能分類說明在 GEAR_KINDS（掉落物頁） */
const VARIANTS = ['禦敵', '制敵', '強襲', '遊擊', '精準', '詠咒', '治癒'];

/** 一個部位的 7 件裝備 */
export const yorha = (slot: Slot, piece: string): LootItem[] =>
  VARIANTS.map((v) => ({ name: `寄葉五一式${v}${piece}`, slot, kind: v, note: 'Lv80・品級 460' }));

export const TOMES = { 詩學: '亞拉戈詩學神典石', 數理: '亞拉戈數理神典石', 記憶: '亞拉戈記憶神典石' } as const;
