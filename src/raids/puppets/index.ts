// 尼爾 2：人偶軍事基地。每個王一個檔，依副本順序放進 encounters。
import type { Raid } from '../types';
import { aegis } from './aegis';
import { flight } from './flight';
import { heavy } from './heavy';
import { compound } from './compound';

export const puppets: Raid = {
  id: 'puppets',
  name: '人偶軍事基地',
  short: '尼爾 2',
  encounters: [aegis, flight, heavy, compound],
  sources: [
    { label: '機制效果、掉落（灰機 wiki）', url: 'https://ff14.huijiwiki.com/' },
    { label: '處理方式（新大陸見聞錄）', url: 'https://ff14.org/duty/736.htm' },
  ],
};
