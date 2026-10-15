// 希望之砲台：塔 共用：裝備掉落（Lv80・品級 520）
// 禦敵、制敵是「寄葉五五式」，其他是「人造人舊式」；頭部詠咒、治癒是「髮飾」，其他是「軍帽」（資料）
import type { LootItem, Slot } from '../types';
import { gearSet, type GearKind } from '../gear';

export { TOMES } from '../gear';

const SERIES = (k: GearKind): string => (k === '禦敵' || k === '制敵' ? '寄葉五五式' : '人造人舊式');
const PIECE: Record<Slot, (k: GearKind) => string> = {
  頭部: (k) => (k === '詠咒' || k === '治癒' ? '髮飾' : '軍帽'),
  身體: () => '軍裝', 手部: () => '手套', 腿部: () => '軍褲', 腳部: () => '軍靴', 武器: () => '武器', 飾品: () => '飾品',
};

export const towerGear = (slot: Slot): LootItem[] => gearSet(slot, SERIES, PIECE[slot], 'Lv80・品級 520（名稱依資料組合）');
