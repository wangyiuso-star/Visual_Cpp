# ARCHITECTURE.md — 專案結構與解耦計畫

> 2026-08-17（v0.10.0 時盤點）。每一輪功能都往同幾個檔案裡塞，這份是「現在長什麼樣、哪裡該拆、為什麼」。
> 原則：**先抽出可測的純函式，再搬檔案**；每次搬完一定要 `npm test`（35 個測試檔會把所有 preset 的每一個畫面都渲染一次，是搬檔案的安全網）。

## 1. 現況（v0.10.0）

| 檔案 | 行數 | 角色 |
|---|---|---|
| `src/interpreter/interpreter.ts` | **2930** | 直譯器核心 + **全部內建函式**（sort/stoi/字串方法/容器方法…）+ 陳述式執行 + cin 游標 |
| `src/interpreter/parser.ts` | 1019 | 語法分析（含 typedef/#define/cast/comparator 等各種語法） |
| `src/index.css` | 715 | 全部樣式 |
| `src/components/viz/tree.tsx` | 534 | 樹 / BST / 堆 / 呼叫樹 + 共用縮放視口 |
| `src/App.tsx` | 493 | 主殼：**一個 480 行的 App 元件**（播放、鍵盤、分割、持久化、topbar、輸出面板全在裡面） |
| `src/components/VariablesPanel.tsx` | 487 | 面板外殼（卡片、拖動、縮放、全寬）—— v0.10.0 從 1983 行拆下來的 |
| `src/components/viz/window.tsx` | 334 | 一維／二維／struct 矩陣視窗 + 共用的 `useWindowOffset` |
| `src/components/viz/containers.tsx` | 310 | string / stack / queue / deque / set / map / struct / pair 檢視 |
| 其他 | ~600 | lexer / memory / ast / CodeEditor / panelLayout / editorSetup / graphLimit / ErrorBoundary / presets |

### v0.10.0 做了什麼

1. **`VariablesPanel.tsx` 1983 → 487 行**：拆成 `src/components/viz/` 五個模組 ——
   - `format.ts`（純函式：格式化、命中判斷、型別標籤）**沒有任何 React 依賴**；
   - `window.tsx`（1D/2D/struct 矩陣視窗）、`containers.tsx`（線性/關聯容器）、`graph.tsx`（圖）、`tree.tsx`（樹與呼叫樹）。
   - 依賴方向是單向的：`panel → {tree, graph, containers, window} → format`（`containers → window` 是為了共用的「还有 N 项未显示」提示），**沒有循環 import**。
2. **去掉一份複製**：`Windowed2D` 與 `StructArrayView` 原本各有一份一模一樣的「偏移 + 跟隨讀寫 + 滑桿」邏輯（改一處要記得改另一處 —— v0.9.7 就吃過一次虧，得用 `replace_all` 才改得乾淨）。現在共用 `useWindowOffset()`。
3. **測試可以只匯入純函式**：`test/summary-test.ts` 以前 `import { formatCellShort } from '../src/components/VariablesPanel'`（為了測一個純函式而拉進整個 React 元件），現在從 `viz/format` 匯入。

## 2. 還沒做、建議排後面做的

### (A) `interpreter.ts` 2930 行 ／ 97 個 function —— 優先度最高
它是現在最大的檔案，而且**每次加語言功能都會動它**。建議切成：
| 目標檔 | 內容 | 風險 |
|---|---|---|
| `interpreter/runtime.ts` | `Runtime` 介面、`RuntimeError`、`Snapshot`/`RunOptions` 型別、`MAX_STEPS`、`isIntegral` | 低（純型別與常數） |
| `interpreter/values.ts` | 值轉換與比較：`num` / `coerceTo` / `cmp` / `eq` / `cellOrder` / `valueOrder` / `toStringVal` / `formatDouble` / `charCode` | 低（純函式） |
| `interpreter/input.ts` | cin 游標（`readCinToken` / `readCinLine` / `cinReadTargets`）+ `getline` / `cin.ignore` | 低 |
| `interpreter/builtins.ts` | `execCall` 裡全部內建（sort / 數學 / 字串 / stoi / 容器方法…，約 600 行） | 中（要共用 values 的函式與 Runtime） |
| `interpreter/stmts.ts` | `execStmt` / `execDecl` / `execBlock` / 控制流 | 中 |
| 留在 `interpreter.ts` | `run()`、函式呼叫與參數綁定、呼叫樹 | — |
為什麼先做它：**它是唯一一個「不拆就會持續變胖」的檔案**（語言功能只會加、不會少），而且它的測試覆蓋最完整（35 個檔案幾乎都在跑它）。

### (B) `App.tsx`：一個 480 行的元件
建議抽成：`usePlayer()`（collect / start / step / 播放計時 / 斷點 / 跳步）、`Topbar`（約 120 行 JSX）、`Splitter`（拖拽分割）、`OutputPane`。價值是**以後改 UI 不用在 480 行裡找位置**；風險低（App 這層本來就沒有自動化測試，只靠 build + 手動驗）。

### (C) 31 個既有的 TypeScript 型別錯誤（`tsc --noEmit`）
`npm run build` 只跑 vite（rolldown 會剝掉型別、**不做型別檢查**），所以這些錯誤不會擋住建置，但會蓋掉「新增的型別錯誤」。目前幾乎都是同一類：`Cell` 是聯合型別，存取 `.cells` / `.elemType` 前沒有先窄化（`ref` 這種 Cell 沒有那兩個欄位）。
建議做法：在 `memory.ts` 加幾個窄化小工具（`asSeq(cell): Cell[] | null`、`elemTypeOf(cell): Type | null`），把 31 處一次換掉；之後 `tsc --noEmit` 應該回到 0，就能把它加進 CI/發版流程。

### (D) 測試檔的樣板重複
每個 `test/*.test.ts` 都自己重寫一次 `pass/fail/check/eq/err`（每個約 15 行 × 35 個檔）。可以抽到 `test/_helpers.ts`（底線開頭，`scripts/run-tests.mjs` 不會把它當成測試檔，但仍可被 import）。價值中等、風險接近零。

### (E) `index.css` 715 行
暫時不建議拆：CSS 拆檔只會多出 import 順序的坑（這份檔案有幾處是刻意靠「後面的規則覆蓋前面的」在運作的，例如 `.card-wide` 蓋 `.var`）。等它超過 ~1000 行或出現主題切換需求再說。

## 3. 幾條已經被驗證有效的規矩（請繼續遵守）

1. **純邏輯抽成純函式模組**：`panelLayout.ts` / `editorSetup.ts` / `graphLimit.ts` / `viz/format.ts` 都是這個模式 —— node 端就能斷言，不必開瀏覽器。
2. **契約測試**（讀原始碼斷言結構）用在「node 端測不到但很容易改壞」的地方：ErrorBoundary 是否包住面板、面板讀 localStorage 是否有 try/catch、2D 視窗是否固定 5×5、兩個矩陣視窗是否共用 `useWindowOffset`。
3. **渲染層測試是搬檔案的安全網**：`render-test` / `hkoi-presets-test` / `render-limit-test` 會把所有 preset 的每一幀渲染成 HTML，搬家後跑 `npm test` 就知道有沒有漏東西。
4. **手動跑單一測試一定要先重新打包**：`rolldown test/x.ts -o test/x.mjs -f esm -p node` 再 `node test/x.mjs`，否則看的是舊 bundle（這個坑踩過兩次）。

