# ARCHITECTURE.md — 專案結構與解耦計畫

> 2026-08-17 起盤點，之後每完成一個重構步驟就更新這一份（進度見 §4）。每一輪功能都往同幾個檔案裡塞，這份是「現在長什麼樣、哪裡該拆、為什麼」。
> 原則：**先抽出可測的純函式，再搬檔案**；每次搬完一定要 `npm test`（36 個測試檔會把所有 preset 的每一個畫面都渲染一次，是搬檔案的安全網）。
>
> 交接總綱見 [AI-HANDOFF.md](./AI-HANDOFF.md)；語言子集規格見 [LANGUAGE-SUBSET.md](./LANGUAGE-SUBSET.md)。

## 1. 現況（v0.11.2）

| 檔案 | 行數 | 角色 |
|---|---|---|
| `src/interpreter/builtins.ts` | 1044 | 全部內建（sort / 數學 / stoi / 字串與容器方法 / memset / sizeof / fill…）—— S4 抽出 |
| `src/interpreter/parser.ts` | 1020 | 語法分析（含 typedef/#define/cast/comparator 等各種語法） |
| `src/interpreter/core.ts` | **828** | 執行引擎：求值 `evalExpr` / 敘述 `execStmt` / 呼叫 `execCall`（三者互相遞迴，必須同檔）—— S6 抽出 |
| `src/index.css` | 718 | 全部樣式 |
| `src/interpreter/values.ts` | 634 | 值轉換與比較的純函式（`num`/`coerceTo`/`cmp`/`applyBinary`/`toStringVal`/`formatDouble`…）—— S2 抽出 |
| `src/components/viz/tree.tsx` | 534 | 樹 / BST / 堆 / 呼叫樹 + 共用縮放視口 |
| `src/App.tsx` | **257** | 主殼：只負責版面與接線（播放/單步在 `usePlayer`、工具列在 `Topbar`、輸出在 `OutputPane`、分割線在 `Splitter`）—— S7 從 493 行拆下來 |
| `src/components/VariablesPanel.tsx` | 521 | 面板外殼（卡片、拖動、縮放、全寬）—— v0.10.0 從 1983 行拆下來的 |
| `src/components/viz/window.tsx` | 338 | 一維／二維／struct 矩陣視窗 + 共用的 `useWindowOffset` |
| `src/components/viz/containers.tsx` | 310 | string / stack / queue / deque / set / map / struct / pair 檢視 |
| `src/interpreter/interpreter.ts` | **113** | 只剩 `run()`（公開入口）+ 公開型別轉出（`Snapshot` / `CallNode` / `RunOptions` / `RuntimeError`）—— 從 2930 行一路降到這裡 |
| `test/_helpers.ts` | 73 | 測試共用樣板（`check` / `eq` / `err` / `run1` / `report`）—— S9 新增，不算測試檔 |
| 其他 | ~1000 | lexer(348) / memory(193) / snapshot(159) / ast(121) / runtime(118) / cells(77) / input(53) / CodeEditor / panelLayout / editorSetup / graphLimit / ErrorBoundary / presets |

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

### (B) `App.tsx` —— **已做完（S7）**，493 → 206 行（v0.11.2 加了「自動並排」後是 257 行）
| 新模組 | 行數 | 內容 |
|---|---|---|
| `components/usePlayer.ts` | 187 | 播放器狀態與動作（collect / start / step / play / reset / jump / 斷點）+ 三個 effect + `invalidate()` |
| `components/Topbar.tsx` | 153 | 工具列 JSX（執行控制、速度、設定選單、步數、跳步） |
| `components/Splitter.tsx` | 100 | `<Splitter>` + `useVerticalDrag` + `useStackDrag` |
| `components/OutputPane.tsx` | 32 | 輸出面板 + 純函式 `outputView()` |

**這層現在也有自動化測試了**：`test/appshell-test.ts`（23 項）包含用 `react-dom/server` 把整個 `<App/>` 渲染一次（以前只靠 build + 手動開瀏覽器）。

### (C) 31 個既有的 TypeScript 型別錯誤 —— **已清到 0（S8）**
`npm run build` 只跑 vite（rolldown 會剝掉型別、**不做型別檢查**），所以這些錯誤不會擋住建置，但會蓋掉「新增的型別錯誤」。

清法（31 → 0，分五類）：
1. **`memory.ts` 加窄化工具** `asIndexable(cell): Cell[] | null`（只有 array/vector —— stack/queue/set 的 `s[0]` 在 C++ 也不合法，所以刻意不算，要讓它報錯）與 `elemTypeOf(cell): Type | null`。渲染層（window / graph / format）用它，順手拿掉「`cell.kind === 'array' ? cell.size : cell.cells.length`」這種重複分支（array 的 `cells.length` 永遠等於 `size`）。
2. **`ast.ts` 補節點子型別** `AssignExpr` / `UpdateExpr`（`Extract<Expr, {kind:'assign'|'update'}>`，和既有的 `CallExpr` / `MethodCallExpr` 同一個模式）→ `execAssign` / `execUpdate` 的參數不再是寬的 `Expr`，`.value` / `.target` / `.op` / `.prefix` 就合法了。
3. **可變陣列的推論**：`const members = []` + `push({kind:'scalar',…})` 會被推成 `kind: string`（不是 `Cell`）→ 明確標 `{ name: string; cell: Cell }[]`（`builtins.ts` / `cells.ts`）。
4. **`ref` 真的不該出現在面板**：`dumpAll` 早就解引用完了 → `VariablesPanel` / `format.cellLabel` 各加一個明確分支（畫成「（未解析的引用 x）」而不是靜默畫成空容器）。
5. 零星的：`parser.ts` 的 `arraySizes` 型別應為 `(Expr | undefined)[]`（省略大小的維度）；CodeMirror gutter 的 `domEventHandlers` 事件型別是寬鬆的 `Event`，要自己收窄成 `MouseEvent`。
6. **順手把 `InitExpr` 的推斷缺口補成明確錯誤**：`int a[] = x`（省略大小但沒有初始化列表）以前會存取到 `undefined.items` → 現在是「省略数组大小时必须提供初始化列表」。

現在 `npm run typecheck`（= `tsc --noEmit`）是 **0 錯誤**，`npm run verify` 會依序跑 typecheck → test → build。

### (D) 測試檔的樣板重複 —— **第一批已做（S9）**
`test/_helpers.ts`（73 行，底線開頭所以 `run-tests.mjs` 不把它當測試檔）提供 `check` / `eq` / `run1` / `out` / `err` / `report`，並用 `stats` 計數。每個測試檔都是**獨立的 node 行程**，所以共用計數器不會跨檔累加。

**已遷移 9 個**（它們的樣板本來就一字不差：`let pass/fail` + `check` + 同樣的結尾）：aliasbadge / appshell / crash / editor-setup / panellayout / render / render-limit / summary —— 每個檔開頭換成 `import { check, report } from './_helpers'`、結尾換成 `report('<name>')`。

**還沒遷移的**（其餘 28 個）：它們各自有**不同簽章與語意**的自訂迷你 harness —— `eq` 至少三種（`(name, code, want)` 跑程式比輸出 / `(actual, expected, name)` 比字串 / `(name, code, want, input)`）、`err` 兩種（比對訊息片段的第二個參數位置不同）、`run1` 回傳形狀也不同（`Snapshot` / `{out, err, snaps}`）。逐檔換要一個一個對呼叫端，屬於後續可選工作，不影響正確性。

### (E) `index.css` 718 行
暫時不建議拆：CSS 拆檔只會多出 import 順序的坑（這份檔案有幾處是刻意靠「後面的規則覆蓋前面的」在運作的，例如 `.card-wide` 蓋 `.var`）。等它超過 ~1000 行或出現主題切換需求再說。

## 3. 幾條已經被驗證有效的規矩（請繼續遵守）

1. **純邏輯抽成純函式模組**：`panelLayout.ts` / `editorSetup.ts` / `graphLimit.ts` / `viz/format.ts` 都是這個模式 —— node 端就能斷言，不必開瀏覽器。
2. **契約測試**（讀原始碼斷言結構）用在「node 端測不到但很容易改壞」的地方：ErrorBoundary 是否包住面板、面板讀 localStorage 是否有 try/catch、2D 視窗是否固定 5×5、兩個矩陣視窗是否共用 `useWindowOffset`。
3. **渲染層測試是搬檔案的安全網**：`render-test` / `render-limit-test` 會把所有 preset 的每一幀渲染成 HTML，搬家後跑 `npm test` 就知道有沒有漏東西。
4. **手動跑單一測試一定要先重新打包**：`rolldown test/x.ts -o test/x.mjs -f esm -p node` 再 `node test/x.mjs`，否則看的是舊 bundle（這個坑踩過兩次）。
5. **「擋住並排」的手動設定都存在 localStorage**：`wide`（⤢）與 `zoom`（>100%）會讓 `panelLayout.isWide()` 無視面板寬度 —— 所以「為什麼我拖寬了還是不並排」幾乎都是這個。UI 上要有出口（右側面板標題列的 **⇔ 自動並排**：清掉樹類卡片的手動設定 + 依量到的實際寬度把中線往左移；`panelLayout.twoColumnMinWidth()` 是它的算式）。
6. **佈局這種 node 端測不到的行為，就真的開瀏覽器量**（v0.11.1 用這招抓到「樹不能並排」）：`tmp/cdp-probe*.mjs` = headless Chrome（`--headless=new --remote-debugging-port=9333 --remote-allow-origins=*`）+ CDP（node 內建 `fetch` / `WebSocket`，不必裝 playwright）→ 在頁面裡 `Runtime.evaluate` 點按鈕、讀 `getBoundingClientRect()` 與 `className`，再用 `Emulation.setDeviceMetricsOverride` 一次量 2560 / 1920 / 1400 三種寬度。**注意：`--user-data-dir` 一定要放 `%TEMP%`，不要放 repo 裡** —— Chrome 會鎖住 `Cookies`，Vite watcher 撞到就 EBUSY 崩掉 dev server（`watch.ignored` 已加 `**/tmp/**`，但放外面才是正解）。

## 4. 執行計畫（逐步 commit，方便回檔）

**規矩**：每一步都 ①先跑 `npm test`（含特性化 golden）②一個 commit（`refactor(S<N>): …`）③推送。
任一步壞掉就 `git revert <sha>`（已推送）或 `git reset --hard <上一步 sha>`（還沒推送）—— 因為行為已經被 golden 鎖住，回檔是安全的。

**驗證三層**：
1. `test/interp-golden-test.ts` —— **特性化 golden**：把 31 個代表性程式的「每一帧 digest」整體雜湊錄下來。
   重構不該改變任何行為，digest 一變就是搬檔時動到了什麼。要**刻意**改行為時：`UPDATE_GOLDEN=1 node test/interp-golden.mjs` 重錄，並在 commit message 說明為什麼。
2. 既有 36 個測試檔 —— 語意與渲染（`render-test` / `render-limit-test` 會把所有 preset 的每一幀渲染成 HTML）。
3. `npm run typecheck`（`tsc --noEmit`）—— **S8 之後是 0 錯誤**，從此任何新增的型別錯誤都會立刻看得出來。發版前跑 `npm run verify`（typecheck + test + build）。

| 步驟 | 內容 | 檔案 | 驗證 |
|---|---|---|---|
| **S0** | 手冊（本檔）+ 特性化 golden 測試 + 執行計畫 | `ARCHITECTURE.md`, `test/interp-golden-test.ts`, `test/_golden/interp-golden.txt` | `npm test` 全過 |
| **S1** | 抽出 `interpreter/runtime.ts`：`Runtime` 介面、`RuntimeError`、`Snapshot` / `RunOptions` / `CallNode`、`MAX_STEPS`、`isIntegral` / `truthy` / `defaultScalar` | 新檔 + `interpreter.ts` | golden |
| **S2** | 抽出 `interpreter/values.ts`：`num` / `coerceTo` / `cmp` / `eq` / `cellOrder` / `valueOrder` / `charCode` / `toStringVal` / `formatDouble` / `parseInputValue` / `scalarCmp` / `assertScalarRV` / `cellScalar` 等**純函式** | 新檔 + `interpreter.ts` | golden |
| **S3** | 抽出 `interpreter/input.ts`：cin 游標（`readCinToken` / `readCinLine` / `skipInputSpace` / `inadequateInputMsg`）+ `cinReadTargets` + `getline` / `cin.ignore` 的部分 | 新檔 + `interpreter.ts` | golden |
| **S4** | 抽出 `interpreter/builtins.ts`：`execCall` 裡的**全部內建**（sort / 數學 / stoi / 字串與容器方法 / memset / sizeof / fill…）—— 最大的一塊 | 新檔 + `interpreter.ts` | golden |
| **S5** ✅ | 抽出 `interpreter/snapshot.ts`（157 行）：`dumpAll` / `collectLocals` / `updateActiveLocals` / `mark` / `markCondition` / `formatCellValue` + 呼叫樹工具。**原計畫的 `stmts.ts` 併進 S6** —— 它和求值互相遞迴，單獨拆會循環 import | 新檔 + `interpreter.ts` | golden ✅（`d9cb389`） |
| **S6** ✅ | 抽出 `interpreter/core.ts`（826 行）：`sizeofOperand` / `applyStructInit` / `resolveTarget` / `evalExpr` / `execAssign` / `execUpdate` / `execCall` / `execMethodCall` / `execDecl` / `execBlock` / `cinReadTargets` / `execStmt`（**求值 + 敘述 + 呼叫同檔**，理由見 §2A）。`interpreter.ts` 933 → **113 行**，只剩 `run()` + 型別轉出 | 新檔 + `interpreter.ts` | golden ✅（31 檔全過、`tsc` 仍 31） |
| **S7** ✅ | `App.tsx` 493 → 206 行（v0.11.2 後 257）：`usePlayer.ts`（187）/ `Topbar.tsx`（150）/ `Splitter.tsx`（100）/ `OutputPane.tsx`（31，含純函式 `outputView`）。新增 `test/appshell-test.ts`（23 項，含整個 `<App/>` 的 SSR 渲染煙霧測試） | 4 新檔 + `App.tsx` | 37 檔全過 ✅ + tsc 仍 31 + dev server 五個新模組都 200 |
| **S8** ✅ | `memory.ts` 加 `asIndexable()` / `elemTypeOf()`、`ast.ts` 加 `AssignExpr` / `UpdateExpr`，清掉**全部 31 個**型別錯誤（做法見 §2C）；`package.json` 加 `verify`（typecheck + test + build）。順手把「不能下標的容器」從 undefined 崩潰改成明確 RuntimeError，並補 5 條 `compat-test` 斷言 | `memory.ts` / `ast.ts` / `core.ts` / `builtins.ts` / `cells.ts` / `parser.ts` / `viz/*` / `VariablesPanel.tsx` / `CodeEditor.tsx` / `package.json` | `npm run typecheck` = 0 ✅ + 37 檔全過 ✅ |
| **S9** ✅ | 新增 `test/_helpers.ts`（`check` / `eq` / `run1` / `out` / `err` / `report`），把**樣板一字不差的 9 個測試檔**遷移過去（其餘 28 個的自訂 harness 簽章不一，列為後續可選，見 §2D） | `test/_helpers.ts` + 9 個測試檔 | 37 檔全過 ✅ + `npm run typecheck` 0 ✅ |

做完 S0–S9 再發一個版本（v0.11.0）。中途每一步都可以單獨發版，因為每一步都是完整可用的狀態。
