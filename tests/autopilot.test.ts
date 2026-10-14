// 示範模式自動跑：時間軸成功率 ≥ 95%，單一機制 100%，而且 Bot 不可以違反規則被打中
import { describe, it, expect } from 'vitest';
import { ALL_DRILLS, SINGLES, getDrill, randKey } from '../src/drills';
import { RAIDS } from '../src/raids';
import { runDemo, seatOf } from './helpers';

const TL_RUNS = 24;
const SINGLE_RUNS = 8;

function runMany(key: string, n: number, seed0: number): { ok: number; fails: string[]; bots: string[] } {
  let ok = 0;
  const fails: string[] = [], bots: string[] = [];
  for (let i = 0; i < n; i++) {
    const { al, role } = seatOf(i * 5);
    const seed = seed0 + i * 7919;
    const r = runDemo(key, al, role, seed);
    expect(r.G.state).toBe('end');
    if (r.ok) ok++;
    else fails.push(`seed=${seed} ${al}-${role}: ${r.fails.join(' / ')}`);
    r.botFails.forEach((b) => bots.push(`seed=${seed} ${b.t.toFixed(1)}s ${b.tag} ${b.who}：${b.why}`));
  }
  console.log(`[autopilot] ${key}: ${ok}/${n}，Bot 被打中 ${bots.length} 次${fails.length ? '\n  ' + fails.join('\n  ') : ''}${bots.length ? '\n  ' + bots.slice(0, 10).join('\n  ') : ''}`);
  return { ok, fails, bots };
}

describe('示範模式自動跑', () => {
  for (const d of ALL_DRILLS) {
    const tl = !!d.drill.tl, n = tl ? TL_RUNS : SINGLE_RUNS;
    it(`${d.raid.short} ${d.enc.name}：${d.drill.name}（${n} 次）`, () => {
      const r = runMany(d.key, n, 1000);
      expect(r.ok / n).toBeGreaterThanOrEqual(tl ? 0.95 : 1);
      expect(r.bots).toEqual([]);
    });
  }

  for (const raid of RAIDS.filter((x) => x.encounters.length)) {
    it(`整個副本連續：${raid.name}（6 次）`, () => {
      const r = runMany(`cont:${raid.id}`, 6, 2000);
      expect(r.ok).toBeGreaterThanOrEqual(5);
      expect(r.bots).toEqual([]);
    });
  }

  it('隨機練習（全部機制、可重複、2 分鐘）', () => {
    const key = randKey({ repeat: true, mins: 2, ids: SINGLES.map((d) => d.key) });
    expect(getDrill(key).drill.name).toContain('隨機');
    const r = runMany(key, 6, 3000);
    expect(r.ok).toBeGreaterThanOrEqual(5);
    expect(r.bots).toEqual([]);
  });
});
