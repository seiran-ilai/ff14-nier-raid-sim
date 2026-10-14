import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // 兩個頁面：模擬器（index.html）、機制教學（guide.html）
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        guide: fileURLToPath(new URL('./guide.html', import.meta.url)),
        loot: fileURLToPath(new URL('./loot.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    // UI 測試會載入整頁（jsdom），一次跑一個檔，避免 Windows 上平行跑太慢
    fileParallelism: false,
  },
});
