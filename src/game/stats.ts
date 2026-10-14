// 紀錄（localStorage）：各練習項目的成功次數，以及各機制的歷史成功率
import { store } from '../core/storage';

export interface DrillStat { ok: number; all: number; streak: number }
export interface MechStat { ok: number; all: number }

export function getDrillStat(drill: string): DrillStat {
  return store.get<Record<string, DrillStat>>('stats', {})[drill] || { ok: 0, all: 0, streak: 0 };
}

export function recordDrill(drill: string, ok: boolean): void {
  const st = store.get<Record<string, DrillStat>>('stats', {});
  const s = st[drill] || { ok: 0, all: 0, streak: 0 };
  s.all++;
  if (ok) { s.ok++; s.streak++; } else s.streak = 0;
  st[drill] = s;
  store.set('stats', st);
}

export const getMechStats = (): Record<string, MechStat> => store.get<Record<string, MechStat>>('mechStats', {});

/** mech：本局每個機制「有沒有失誤」 */
export function recordMechs(mech: Record<string, boolean>): void {
  const st = getMechStats();
  Object.entries(mech).forEach(([k, failed]) => {
    const s = st[k] || { ok: 0, all: 0 };
    s.all++;
    if (!failed) s.ok++;
    st[k] = s;
  });
  store.set('mechStats', st);
}

/** 最常錯的 n 個機制：至少錯過一次，依失誤次數、再依成功率排序 */
export function worstMechs(n = 3): { mech: string; ok: number; all: number; rate: number }[] {
  return Object.entries(getMechStats())
    .map(([mech, s]) => ({ mech, ...s, rate: s.all ? s.ok / s.all : 1 }))
    .filter((s) => s.all > s.ok)
    .sort((a, b) => (b.all - b.ok) - (a.all - a.ok) || a.rate - b.rate)
    .slice(0, n);
}

export function clearMechStats(): void {
  store.set('mechStats', {});
}
