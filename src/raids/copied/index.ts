// 尼爾 1：複製工廠廢墟。每個王一個檔，依副本順序放進 encounters。
import type { Raid } from '../types';
import { commander } from './commander';
import { hobbes } from './hobbes';
import { engels } from './engels';
import { ninesee } from './ninesee';

export const copied: Raid = {
  id: 'copied',
  name: '複製工廠廢墟',
  short: '尼爾 1',
  encounters: [commander, hobbes, engels, ninesee],
  sources: [
    { label: '機制效果、掉落（灰機 wiki）', url: 'https://ff14.huijiwiki.com/wiki/%E5%A4%8D%E5%88%B6%E5%B7%A5%E5%8E%82%E5%BA%9F%E5%A2%9F' },
    { label: '處理方式（新大陸異聞錄）', url: 'https://ff14.org/duty/700.htm' },
  ],
  note: '機制資料整理中。',
};
