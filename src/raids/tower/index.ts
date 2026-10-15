// 尼爾 3：希望之砲台：塔。每個王一個檔，依副本順序放進 encounters。
import type { Raid } from '../types';
import { knave } from './knave';
import { twins } from './twins';
import { red } from './red';
import { idol } from './idol';

export const tower: Raid = {
  id: 'tower',
  name: '希望之砲台：塔',
  short: '尼爾 3',
  encounters: [knave, twins, red, idol],
  sources: [
    { label: '機制效果、掉落（灰機 wiki）', url: 'https://ff14.huijiwiki.com/' },
    { label: '處理方式（新大陸見聞錄）', url: 'https://ff14.org/duty/779.htm' },
  ],
};
