// 所有副本（畫面上的副本按鈕順序）
import type { Raid } from './types';
import { copied } from './copied';
import { puppets } from './puppets';
import { tower } from './tower';
import { basic } from './basic';

export const RAIDS: Raid[] = [copied, puppets, tower, basic];

export const raidById = (id: string): Raid | undefined => RAIDS.find((r) => r.id === id);
