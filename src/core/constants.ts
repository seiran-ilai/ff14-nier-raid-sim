// 隊伍與職能。尼爾系列是一般 24 人團隊任務：3 個小隊（A／B／C），每隊 1 坦克、2 補師、5 DPS。
export { RUN, HIT } from './tuning';

export interface Vec { x: number; y: number }
export const O0: Readonly<Vec> = { x: 0, y: 0 };

export const ROLES = ['MT', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4', 'D5'] as const;
export type Role = (typeof ROLES)[number];
export const ALS = ['A', 'B', 'C'] as const;
export type Alliance = (typeof ALS)[number];
export type RoleType = 'tank' | 'heal' | 'dps';

export const roleType = (r: Role): RoleType => (r === 'MT' ? 'tank' : r[0] === 'H' ? 'heal' : 'dps');
export const ROLE_NAME: Record<Role, string> = { MT: '坦克', H1: '補師 1', H2: '補師 2', D1: 'DPS 1', D2: 'DPS 2', D3: 'DPS 3', D4: 'DPS 4', D5: 'DPS 5' };
export const ROLE_COL: Record<RoleType, string> = { tank: '#4f7ff2', heal: '#3cba6a', dps: '#d65454' };
export const AL_COL: Record<Alliance, string> = { A: '#ff8a8a', B: '#8ad0ff', C: '#ffd36b' };
