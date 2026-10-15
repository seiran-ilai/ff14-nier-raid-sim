// 尼爾系列裝備掉落：七種職能版本（禦敵、制敵、強襲、遊擊、精準、詠咒、治癒）
import type { LootItem, Slot } from './types';

export const GEAR_KIND = ['禦敵', '制敵', '強襲', '遊擊', '精準', '詠咒', '治癒'] as const;
export type GearKind = (typeof GEAR_KIND)[number];

export const TOMES = { 詩學: '亞拉戈詩學神典石', 數理: '亞拉戈數理神典石', 記憶: '亞拉戈記憶神典石' } as const;

/**
 * 一個部位的 7 件裝備。series／piece 可以依職能版本不同（例如希望之砲台：禦敵、制敵是寄葉五五式，其他是人造人舊式）。
 */
export function gearSet(slot: Slot, series: string | ((k: GearKind) => string), piece: string | ((k: GearKind) => string), note: string): LootItem[] {
  return GEAR_KIND.map((k) => {
    const s = typeof series === 'string' ? series : series(k), p = typeof piece === 'string' ? piece : piece(k);
    return { name: `${s}${k}${p}`, slot, kind: k, note };
  });
}
