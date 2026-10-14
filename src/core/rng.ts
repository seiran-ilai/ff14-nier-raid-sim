// 可設定種子的亂數：同一個種子可以重打同一局。沒給種子時每局隨機產生一個。
export interface Rng {
  readonly seed: number;
  /** [0,1) */
  next(): number;
  /** 機率 p 為 true */
  chance(p: number): boolean;
  /** [a,b) 均勻 */
  rnd(a: number, b: number): number;
  pickOne<T>(a: readonly T[]): T;
  shuffle<T>(a: readonly T[]): T[];
}

/** mulberry32：32 位元種子、速度快、分布夠用 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;

export function createRng(seed: number = randomSeed()): Rng {
  const next = mulberry32(seed);
  return {
    seed: seed >>> 0,
    next,
    chance: (p) => next() < p,
    rnd: (a, b) => a + next() * (b - a),
    pickOne: (a) => a[Math.floor(next() * a.length)],
    shuffle: (a) => {
      const b = a.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      return b;
    },
  };
}
