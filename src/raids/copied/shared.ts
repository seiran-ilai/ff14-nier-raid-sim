// 複製工廠廢墟共用：站位、寄葉五一式裝備掉落
import type { LootItem, Slot } from '../types';
import { gearSet } from '../gear';

export { clusterHome } from '../layout';
export { TOMES } from '../gear';

/** 寄葉五一式（Lv80・品級 460）一個部位的 7 件裝備 */
export const yorha = (slot: Slot, piece: string): LootItem[] => gearSet(slot, '寄葉五一式', piece, 'Lv80・品級 460');
