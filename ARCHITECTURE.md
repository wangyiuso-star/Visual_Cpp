# ARCHITECTURE.md — 專案結構與解耦計畫

> 2026-08-17 起盤點，之後每完成一個重構步驟就更新這一份（進度見 §4）。每一輪功能都往同幾個檔案裡塞，這份是「現在長什麼樣、哪裡該拆、為什麼」。
> 原則：**先抽出可測的純函式，再搬檔案**；每次搬完一定要 `npm test`（36 個測試檔會把所有 preset 的每一個畫面都渲染一次，是搬檔案的安全網）。

## 1. 現況（v0.10.0 + 重構 S0–S6）

| 檔案 | 行數 | 角色 |
|---|---|---|
| `src/interpreter/builtins.ts` | 1044 | 全部內建（sort / 數學 / stoi / 字串與容器方法 / memset / sizeof / fill…）—— S4 抽出 |
| `src/interpreter/parser.ts` | 1019 | 語法分析（含 typedef/#define/cast/comparator 等各種語法） |
| `src/interpreter/core.ts` | **826** | 執行引擎：求值 `evalExpr` / 敘述 `execStmt` / 呼叫 `execCall`（三者互相遞迴，必須同檔）—— S6 抽出 |
| `src/index.css` | 715 | 全部樣式 |
| `src/interpreter/values.ts` | 634 | 值轉換與比較的純函式（`num`/`coerceTo`/`cmp`/`applyBinary`/`toStringVal`/`formatDouble`…）—— S2 抽出 |
| `src/components/viz/tree.tsx` | 534 | 樹 / BST / 堆 / 呼叫樹 + 共用縮放視口 |
| `src/App.tsx` | 493 | 主殼：**一個 480 行的 App 元件**（播放、鍵盤、分割、持久化、topbar、輸出面板全在裡面） |
| `src/components/VariablesPanel.tsx` | 487 | 面板外殼（卡片、拖動、縮放、全寬）—— v0.10.0 從 1983 行拆下來的 |
| `src/components/viz/window.tsx` | 334 | 一維／二維／struct 矩陣視窗 + 共用的 `useWindowOffset` |
| `src/components/viz/containers.tsx` | 310 | string / stack / queue / deque / set / map / struct / pair 檢視 |
| `src/interpreter/interpreter.ts` | **113** | 只剩 `run()`（公開入口）+ 公開型別轉出（`Snapshot` / `CallNode` / `RunOptions` / `RuntimeError`）—— 從 2930 行一路降到這裡 |
| 其他 | ~900 | lexer(348) / memory(165) / snapshot(159) / ast(118) / runtime(118) / cells(77) / input(53) / CodeEditor / panelLayout / editorSetup / graphLimit / ErrorBoundary / presets |

### v0.10.0 做了什麼

1. **`VariablesPanel.tsx` 1983 → 487 行**：拆成 `src/components/viz/` 五個模組 ——
   - `format.ts`（純函式：格式化、命中判斷、型別標籤）**沒有任何 React 依賴**；
   - `window.tsx`（1D/2D/struct 矩陣視窗）、`containers.tsx`（線性/關聯容器）、`graph.tsx`（圖）、`tree.tsx`（樹與呼叫樹）。
   - 依賴方向是單向的：`panel → {tree, graph, containers, window} → format`（`containers → window` 是為了共用的「还有 N 项未显示」提示），**沒有循環 import**。
2. **去掉一份複製**：`Windowed2D` 與 `StructArrayView` 原本各有一份一模一樣的「偏移 + 跟隨讀寫 + 滑桿」邏輯（改一處要記得改另一處 —— v0.9.7 就吃過一次虧，得用 `replace_all` 才改得乾淨）。現在共用 `useWindowOffset()`。
3. **測試可以只匯入純函式**：`test/summary-test.ts` 以前 `import { formatCellShort } from '../src/components/VariablesPanel'`（為了測一個純函式而拉進整個 React 元件），現在從 `viz/format` 匯入。

## 2. 還沒做、建議排後面做的

### (A) `interpreter.ts` —— **已做完（S0–S6）**，2930 → 113 行
拆解結果（依賴方向單向，無循環 import）：

```
interpreter.ts  run() + 型別轉出
      ↓
   core.ts      求值 / 敘述 / 呼叫（三者互相遞迴 → 同一個檔）
      ↓
snapshot.ts  builtins.ts  cells.ts  values.ts  input.ts  runtime.ts  （memory / ast / lexer 更下層）
```

為什麼 `evalExpr` / `execStmt` / `execCall` 不能各拆一檔：`evalExpr → execCall → execBlock → evalExpr` 是**互相遞迴**的，硬拆一定要互相 import。硬拆的替代方案（把回呼當參數層層傳）會讓每個簽章都多兩個參數、可讀性反而變差，所以選擇「同一個檔、只依賴下層」。下一步的拆法若真的要拆，得先把三者的共同狀態集中成一個 context 物件再談。

仍然可以再拆的：`core.ts` 826 行裡的 `execCall`（函式呼叫與參數綁定）和 `sizeofOperand` / `applyStructInit` 都是獨立的主題，等它再變胖再說。

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

## 4. 執行計畫（逐步 commit，方便回檔）

**規矩**：每一步都 ①先跑 `npm test`（含特性化 golden）②一個 commit（`refactor(S<N>): …`）③推送。
任一步壞掉就 `git revert <sha>`（已推送）或 `git reset --hard <上一步 sha>`（還沒推送）—— 因為行為已經被 golden 鎖住，回檔是安全的。

**驗證三層**：
1. `test/interp-golden-test.ts` —— **特性化 golden**：把 31 個代表性程式的「每一帧 digest」整體雜湊錄下來。
   重構不該改變任何行為，digest 一變就是搬檔時動到了什麼。要**刻意**改行為時：`UPDATE_GOLDEN=1 node test/interp-golden.mjs` 重錄，並在 commit message 說明為什麼。
2. 既有 36 個測試檔 —— 語意與渲染（`render-test` / `hkoi-presets-test` 會把所有 preset 的每一幀渲染成 HTML）。
3. `node_modules/.bin/tsc.cmd --noEmit` —— 目前 31 個既有錯誤（見 §2C），S8 會清掉並納入流程。

| 步驟 | 內容 | 檔案 | 驗證 |
|---|---|---|---|
| **S0** | 手冊（本檔）+ 特性化 golden 測試 + 執行計畫 | `ARCHITECTURE.md`, `test/interp-golden-test.ts`, `test/_golden/interp-golden.txt` | `npm test` 全過 |
| **S1** | 抽出 `interpreter/runtime.ts`：`Runtime` 介面、`RuntimeError`、`Snapshot` / `RunOptions` / `CallNode`、`MAX_STEPS`、`isIntegral` / `truthy` / `defaultScalar` | 新檔 + `interpreter.ts` | golden |
| **S2** | 抽出 `interpreter/values.ts`：`num` / `coerceTo` / `cmp` / `eq` / `cellOrder` / `valueOrder` / `charCode` / `toStringVal` / `formatDouble` / `parseInputValue` / `scalarCmp` / `assertScalarRV` / `cellScalar` 等**純函式** | 新檔 + `interpreter.ts` | golden |
| **S3** | 抽出 `interpreter/input.ts`：cin 游標（`readCinToken` / `readCinLine` / `skipInputSpace` / `inadequateInputMsg`）+ `cinReadTargets` + `getline` / `cin.ignore` 的部分 | 新檔 + `interpreter.ts` | golden |
| **S4** | 抽出 `interpreter/builtins.ts`：`execCall` 裡的**全部內建**（sort / 數學 / stoi / 字串與容器方法 / memset / sizeof / fill…）—— 最大的一塊 | 新檔 + `interpreter.ts` | golden |
| **S5** ✅ | 抽出 `interpreter/snapshot.ts`（157 行）：`dumpAll` / `collectLocals` / `updateActiveLocals` / `mark` / `markCondition` / `formatCellValue` + 呼叫樹工具。**原計畫的 `stmts.ts` 併進 S6** —— 它和求值互相遞迴，單獨拆會循環 import | 新檔 + `interpreter.ts` | golden ✅（`d9cb389`） |
| **S6** ✅ | 抽出 `interpreter/core.ts`（826 行）：`sizeofOperand` / `applyStructInit` / `resolveTarget` / `evalExpr` / `execAssign` / `execUpdate` / `execCall` / `execMethodCall` / `execDecl` / `execBlock` / `cinReadTargets` / `execStmt`（**求值 + 敘述 + 呼叫同檔**，理由見 §2A）。`interpreter.ts` 933 → **113 行**，只剩 `run()` + 型別轉出 | 新檔 + `interpreter.ts` | golden ✅（31 檔全過、`tsc` 仍 31） |
| **S7** | `App.tsx` 拆出 `usePlayer()`（collect / 播放 / 斷點 / 跳步）/ `Topbar` / `Splitter` / `OutputPane` | 新檔 + `App.tsx` | `npm test` + 手動開 dev |
| **S8** | `memory.ts` 加 `asSeq()` / `elemTypeOf()` 等窄化工具，清掉 31 個型別錯誤；`package.json` 加 `typecheck` 腳本並在發版流程跑它 | `memory.ts`、各檔、`package.json` | `tsc --noEmit` = 0 |
| **S9** | 測試樣板抽 `test/_helpers.ts`（`check` / `eq` / `err` / `run1`） | `test/*.ts` | `npm test` 全過 |

做完 S0–S9 再發一個版本（v0.11.0）。中途每一步都可以單獨發版，因為每一步都是完整可用的狀態。
