# 尼爾團隊任務機制模擬器（測試版）

FF14 尼爾系列 24 人團隊任務的機制練習器，三個副本做在同一個模擬器：

| 副本 | 狀態 |
|---|---|
| 尼爾 1 複製工廠廢墟 | 四個王完成（司令機、霍布斯、昂格士、9S），整理與待確認見 [docs/copied-factory.md](docs/copied-factory.md) |
| 尼爾 2 人偶軍事基地 | 四個王完成（813P、強化型飛行裝置、905P、融合的人偶群／2P），見 [docs/puppets-bunker.md](docs/puppets-bunker.md) |
| 尼爾 3 希望之砲台：塔 | 四個王完成（傑克、格雷特與韓塞爾、紅衣少女、偽造／開花的神明），見 [docs/tower-paradigm.md](docs/tower-paradigm.md) |
| 基礎機制（訓練木人） | 完成：鋼鐵／月環／扇形／十字、分攤、分散、擊退、踩塔、背對 |

在網頁上用鍵盤滑鼠操作角色，23 名隊友照攻略跑位；可看示範、慢動作回放失誤；另有「機制教學」頁（`guide.html`）與「掉落物」頁（`loot.html`，可切換依部位／依王，並篩選職能版本）。
架構參考「暗黑之雲機制模擬器」，改成**一個副本有好幾個王、每個王自己的場地（預設方形）**。

Vite + TypeScript（strict）+ Canvas 2D，沒有 UI 框架。

**直接玩：** https://seiran-ilai.github.io/ff14-nier-raid-sim/

## 資料來源

| 用途 | 來源 |
|---|---|
| 機制效果、掉落 | [FF14 灰機 wiki](https://ff14.huijiwiki.com/)（簡體中文，已轉繁體整理） |
| 處理方式（攻略） | [新大陸見聞錄](https://ff14.org/) |

各技能詠唱秒數、AOE 大小、場地尺寸、時間軸順序大多是估計值（資料沒寫明），寫在各王檔案的 `T` 常數並標「估計」。

## 指令

```
npm install
npm run dev      # 開發伺服器（或雙擊「試玩.cmd」）
npm test         # Vitest：幾何、示範模式自動跑、UI 冒煙測試、教學頁
npm run build    # 型別檢查 + 打包到 dist/
```

## 結構

```
src/
  main.ts / guide.ts   模擬器、機制教學頁的進入點
  core/                常數（隊伍、職能）、幾何、AOE 形狀與判定（shapes.ts）、場地（arena.ts）、亂數、設定、通用估計值（tuning.ts）
  game/                狀態型別、事件排程、判定結果、模擬一步、Bot、Session、回放、紀錄
  mechanics/common.ts  通用機制積木：aoe／stack（分攤）／spread（分散）／knockback（擊退）／towers（踩塔）／gaze（背對）
  raids/               每個副本一個資料夾；每個王一個 Encounter（場地、王、原位、標點、機制說明、練習項目）
    copied/            尼爾 1 複製工廠廢墟
    puppets/           尼爾 2 人偶軍事基地
    tower/             尼爾 3 希望之砲台：塔
    basic/             基礎機制訓練場（範例：新增一個王就照這個檔的寫法）
  drills/              練習項目 key 解析：單一王、整個副本連續、隨機、弱點練習
  render/              Canvas 繪製（只讀狀態）
  ui/ input/ styles/   DOM、鍵盤滑鼠、樣式
```

## 練習方式

- **單一王**：選副本 → 王 → 完整時間軸或單一機制。
- **整個副本**：從第一個王連續打到最後一個王（中間自動換場地）。
- **隨機練習**：從勾選的機制（可跨王、跨副本）隨機出題。
- **常錯機制**：自己練的失誤會記在瀏覽器，一鍵只練最常錯的 3 個。

## 截圖／除錯網址參數（只在 `npm run dev`）

`/?drill=basic/dummy/all&seed=7&t=20&auto=1&cam=follow` 會用示範模式快轉到 20 秒並停住。

FINAL FANTASY XIV 及相關名稱為 SQUARE ENIX 的商標。本專案為玩家自製的非官方練習工具。
