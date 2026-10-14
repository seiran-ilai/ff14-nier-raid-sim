// 事件佇列：依時間排序，時間到就執行。同時間的事件維持加入順序。
export interface ScheduledEvent { t: number; fn: () => void }

export class Scheduler {
  private q: ScheduledEvent[] = [];

  /** 依時間插入（同時間的排在後面）；執行中途加入的事件也會在正確的位置 */
  at(t: number, fn: () => void): void {
    let lo = 0, hi = this.q.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.q[mid].t <= t) lo = mid + 1; else hi = mid; }
    this.q.splice(lo, 0, { t, fn });
  }

  /** 機制組裝完後排序一次（Array.sort 是穩定排序） */
  sort(): void {
    this.q.sort((a, b) => a.t - b.t);
  }

  /** 執行所有 t <= now 的事件 */
  runUntil(now: number): void {
    while (this.q.length && this.q[0].t <= now) this.q.shift()!.fn();
  }

  get size(): number {
    return this.q.length;
  }
}
