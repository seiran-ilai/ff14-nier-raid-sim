// 職能判定：玩家自己練（不是示範）時，坦克的挑釁／減傷、補師的盾／補血、DPS 的團隊減傷
import { describe, it, expect } from 'vitest';
import type { Alliance, Role } from '../src/core/constants';
import type { ActType } from '../src/core/config';
import type { GameState } from '../src/game/state';
import { DT, makeSession } from './helpers';

/** 自己練（錯誤不停）跑到 until 秒；uses：在某個時間按某種技能 */
function play(drill: string, al: Alliance, role: Role, until: number, uses: [number, ActType][] = []): GameState {
  const s = makeSession(drill, al, role);
  s.cfg.failMode = 'continue';
  const G = s.newGame(false, 1);
  G.state = 'run';
  const left = [...uses].sort((a, b) => a[0] - b[0]);
  while (G.t < until && G.state === 'run') {
    while (left.length && left[0][0] <= G.t) { const [, type] = left.shift()!; s.useAct(G.cfg.acts.findIndex((a) => a.type === type)); }
    s.step(DT);
  }
  return G;
}
const texts = (G: GameState, tag: RegExp): string[] => G.checks.filter((c) => tag.test(c.tag)).map((c) => `${c.ok ? 'OK' : c.warn ? 'WARN' : 'NG'} ${c.text}`);

describe('坦克', () => {
  it('時間軸開場沒挑釁＝失誤；挑釁了＝成功', () => {
    expect(texts(play('copied/cmd/full', 'A', 'MT', 8), /^挑釁$/)).toEqual([expect.stringMatching(/^NG .*沒挑釁/)]);
    expect(texts(play('copied/cmd/full', 'A', 'MT', 8, [[1, 'provoke']]), /^挑釁$/)).toEqual([expect.stringMatching(/^OK 挑釁了/)]);
  });

  it('B 隊坦克挑了 A 隊的王＝失誤', () => {
    expect(texts(play('copied/cmd/full', 'B', 'MT', 3, [[1, 'provoke']]), /^挑釁$/)).toEqual([expect.stringMatching(/^NG 挑了.*A 隊坦克拉/)]);
  });

  it('死刑沒開減傷＝失誤；開了＝成功', () => {
    const tb = /高性能跟蹤導彈（減傷）/;
    expect(texts(play('copied/eng/missiles', 'A', 'MT', 8), tb)).toEqual([expect.stringMatching(/^NG 沒用減傷/)]);
    expect(texts(play('copied/eng/missiles', 'A', 'MT', 8, [[4, 'mit']]), tb)).toEqual(['OK 死刑時開著減傷']);
  });
});

describe('補師', () => {
  it('全場 AOE 前沒上群盾、之後沒補血＝失誤', () => {
    const G = play('copied/cmd/full', 'A', 'H1', 50);
    expect(texts(G, /大震動（群盾）/)).toEqual([expect.stringMatching(/^NG 沒用群盾/)]);
    expect(texts(G, /大震動（補血）/)).toEqual([expect.stringMatching(/^NG 全場 AOE 後隊伍平均只剩/)]);
  });

  it('先上群盾、打完群補＝成功', () => {
    const G0 = play('copied/cmd/full', 'A', 'H1', 50);
    const hit = G0.checks.find((c) => /大震動（群盾）/.test(c.tag))!.t;
    const G = play('copied/cmd/full', 'A', 'H1', 50, [[hit - 3, 'aoeShield'], [hit + 1, 'aoeHeal']]);
    expect(texts(G, /大震動（群盾）/)).toEqual(['OK 全場 AOE 前上了群盾']);
    expect(texts(G, /大震動（補血）/)).toEqual(['OK 全場 AOE 後把隊伍補起來']);
  });

  it('死刑前沒給自己隊的坦克上單盾＝失誤；上了＝成功', () => {
    const sh = /高性能跟蹤導彈（單盾）/;
    expect(texts(play('copied/eng/missiles', 'B', 'H1', 8), sh)).toEqual([expect.stringMatching(/^NG 沒用單盾/)]);
    expect(texts(play('copied/eng/missiles', 'B', 'H1', 8, [[4, 'shield']]), sh)).toEqual(['OK 死刑前給坦克上了單盾']);
  });
});

describe('DPS', () => {
  it('全場 AOE 時團隊減傷冷卻好了卻沒開＝失誤；開了＝成功', () => {
    const G0 = play('copied/cmd/full', 'C', 'D1', 50);
    const c = G0.checks.find((x) => /大震動（團隊減傷）/.test(x.tag))!;
    expect(c.ok || c.warn).toBeFalsy();
    expect(c.text).toMatch(/^沒用團隊減傷/);
    const G = play('copied/cmd/full', 'C', 'D1', 50, [[c.t - 3, 'raidMit']]);
    expect(texts(G, /大震動（團隊減傷）/)).toEqual(['OK 全場 AOE 時開著團隊減傷']);
  });
});
