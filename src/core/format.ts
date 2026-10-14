// 顯示用文字格式
const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];

/** 角度轉八方位名稱 */
export const DIRNAME = (a: number): string =>
  DIRS[Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];

/** 秒數轉 m:ss */
export const fmtT = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
