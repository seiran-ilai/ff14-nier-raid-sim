// localStorage 包裝：niersim: 前綴；無法存取（私密視窗、Node 測試環境）時回傳預設值
const PREFIX = 'niersim:';

export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(PREFIX + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch {
      /* 存不了就算了 */
    }
  },
};
