# HANDOFF.md — 项目详细状态档案

> 註：本檔是逐版本開發日誌。早期條目提到的「HKOI」是作者當時參與的外部教學專案；**2026-10-19 起本專案已與該專案脫鉤**（跨專案測試已移除，倉庫自包含），歷史條目保持原樣以保留脈絡。

- 2026-10-19：**v0.12.0 —— preset 自带 cin 输入 + 长整型精度警告**。
  - 25 个示例：新增「读入 n 个数求和 / while(cin) 读到 EOF / getline 读整行」，三个都带 `input`，选中示例时自动填进 cin 框（以前要手动敲，很容易先在空输入上跑一次、看到「输入不足」以为示例坏了）。`presets-test` 增加不变量：任何用 cin/getline 的示例必须自带 input。
  - `long long` 超过 2^53：`core.ts` 的 `notePrecision()` 记一条警告，快照带 `warning` 字段，输出面板上方显示琥珀色提示（**不中断程序**）——这是项目「绝不静默给错答案」原则的最后一块缺口。`compat-test` 加了两条（超范围必须有警告 / 正常范围不许乱报）。
  - `interpreter.ts` 里手工构造的三个快照（`done`、执行期错误、内部错误）也带上 warning，否则程序跑完那一帧警告会消失。

## 最近更新
- 2026-10-19：**開源上架整理（v0.11.2，未改程式行為）**。把專案整理成可以公開的個人專案：
  - **文件結構**：`ARCHITECTURE.md` / `HANDOFF.md` / `DEBUG.md` 移進 `docs/`；新增 **`docs/AI-HANDOFF.md`（交接總綱）** 與 **`docs/LANGUAGE-SUBSET.md`（語言子集完整參考）**；刪掉 AI 工作階段留下的草稿檔（`*.template.md`、`CHECKPOINT-2026-08-16.md`、`PROJECT_REVIEW.md`，內容已併入上面兩份）。
  - **對外門面**：`README.md` 重寫（含兩張實機截圖 `docs/screenshot-*.png`、快速開始、功能一覽、限制摘要、文件索引）；新增 `LICENSE`（MIT）；`package.json` 補 description/keywords/license/repository；`index.html` 補 meta description 與 inline SVG favicon。
  - **工程**：新增 `.github/workflows/ci.yml`（`npm ci` → typecheck → test → build）；`.gitignore` 重寫（原本的註解是亂碼）。
  - **驗證**：`npm run verify` 全綠（37 檔測試、typecheck 0、build 過）；截圖是用 headless Chrome + CDP 在 1600×900 @2x 實拍（歸併排序 第 58/283 步、Dijkstra 第 78/130 步）。
- 2026-08-17：**發布 v0.11.2 —— 新增「⇔ 自動並排」按鈕（右側面板標題列）**（使用者：「我把中綫往左拖，還是不會自己并排，你出一個按鈕，按完就是自己調整寬度並排」）。
  - **為什麼拖中線還是沒用**：`wide`（⤢ 手動整行）與 `zoom`（放大 >100%）都**存在 localStorage** 裡，而且兩者都會讓 `isWide()` **無視面板寬度**。所以在 v0.11.1 修好自動判斷之後，只要卡片上有舊的手動設定，拖多寬都還是佔整行（我在 headless Chrome 裡把 `localStorage['cpp-viz.panel-layout']` 設成 `{zoom:{'@calltree':1.3},wide:{'@calltree':true}}` 就重現了）。
  - **按鈕做三件事**（一次點擊全部解決）：
    1. **清掉「樹 / BST / 堆 / 遞歸樹」的手動整行與 >100% 放大**（App 送遞增的 `packSignal` 給 `VariablesPanel`；只動這幾類卡片，其他卡片的手動設定刻意保留）。
    2. **把中線往左移到卡片區放得下兩欄**：用**量到的實際寬度**反推 —— 面板寬 = 卡片區寬 + 內距 + 純量欄（`body.clientWidth - main.clientWidth`），目標是 `twoColumnMinWidth(viewportW)`（寬螢幕 2×360+12 = 732；`@media ≤1440px` 用 2×300+10 = 610，見 `index.css`）。state 更新是非同步的，所以每 40ms 重新量一次、最多 4 次（每次多留 24px 安全邊際）。
    3. **真的做不到就講清楚**：例如視窗只有 640px 寬時顯示「螢幕不夠寬：面板已放到最大（編輯器 15%），卡片區仍放不下两栏」，不靜默沒反應。
  - **接線**：按鈕在 App 的 `pane-title`（`.pack-btn`），`editorPct` 的夾制常數 `EDITOR_PCT_MIN/MAX` 移到 `panelLayout.ts`，拖曳與按鈕共用同一組。
  - **瀏覽器實測**（headless Chrome + CDP，`tmp/cdp-probe5/6.mjs`）：

    | 情境 | 按鈕前 | 按鈕後 |
    |---|---|---|
    | 2560 寬 + localStorage 有 `wide:true`、`zoom:1.3` | 遞歸樹 `card-wide`、放大 130%、`perRow [1]` | 已清成 `{zoom:{},wide:{}}`、回到 100%、`wide:false` ✅ |
    | 1600 寬（編輯器 55% → 面板 714 → 卡片區 548） | 1 欄、樹佔整行 | 編輯器 43% → 面板 904 → 卡片區 738 → **2 欄** ✅ |
    | 1600 寬 · Dijkstra 最後一步 | — | `pq`（priority_queue，樹狀）與 `g` 同列 → **樹狀卡片真的並排** ✅ |
    | 640 寬 | — | 顯示「螢幕不夠寬…」提示（不靜默）✅ |
  - **測試**：`test/panellayout-test.ts` +9（兩欄最小寬度 732/610、拖曳與按鈕共用夾制、按鈕存在、用 `gridTemplateColumns` 量欄數、`packSignal` 有接上、會清掉樹的 `wide`/放大、做不到時會顯示提示）→ 現 56 項。
- 2026-08-17：**發布 v0.11.1 —— 修「數據結構樹 / 遞歸樹沒辦法並排」**（使用者回報：改完之後數據結構/遞歸樹沒辦法並列了）。
  - **症狀**：右側面板的樹 / BST / 堆 / 遞歸樹永遠佔整行，不能跟別的卡片並排（其他卡片可以）。
  - **根因是兩個疊在一起的 bug**（都不是這次重構引入的，用 `git show v0.9.7/v0.9.8/v0.10.0/HEAD:src/components/VariablesPanel.tsx` 逐版比對確認）：
    1. **v0.9.8 的「面板 ≥ TREE_PACK_MIN 才並排」只做了一半**：寬度判斷 `treeAutoWide` 算出來了，但呼叫端傳的是**死的 `true`**（`cardView('@calltree', true)`、`cardView(name, isTreeLike(cell))`）→ 樹類卡片永遠 wide。**從 v0.9.8 起就一直是壞的。**
    2. **面板寬度從來沒被量到**：寬度是用 `useEffect([]) + panelRef` 量 `.viz-body`，但第一帧 `snapshot === null` 走的是另一棵**沒有掛 ref** 的子樹 → `panelRef.current === null` 就直接 return，之後跑起來也不會再掛 → `panelW` 永遠 0 → 就算修好 (1) 也還是永遠「窄面板」。
  - **修法**：
    1. 呼叫端真的用 `treeAutoWide`：`cardView('@calltree', treeAutoWide)`、`cardView(item.v.name, isTreeLike(item.v.cell) && treeAutoWide)`。
    2. 量寬度改用 **callback ref**（`useCallback((el) => …)` + `roRef`），而且**兩條分支都掛 `ref={panelRef}`** —— 節點被換掉或重新掛載都會重新量。
    3. 判斷抽成 `panelLayout.treeAutoWideOf(panelW)`（可測的純函式），VariablesPanel 只呼叫它。
  - **驗證（真的開瀏覽器量 DOM，不是只看測試）**：headless Chrome（`--headless=new --remote-debugging-port=9333`，profile 放 `%TEMP%`）+ CDP（node 內建 `fetch`/`WebSocket`，腳本 `tmp/cdp-probe*.mjs`）→ 在頁面裡點「運行 / 跳轉」、用 `Emulation.setDeviceMetricsOverride` 換寬度、量每張卡片的 className 與座標：

    | 視窗寬 | 面板寬 | .viz-main | 量到的結果 |
    |---|---|---|---|
    | 2560 | 1146 | 980 | 遞歸樹與 `a` 陣列**同列**（`perRow [2,1]`）；Dijkstra 最後一步的 `pq`（priority_queue，樹狀）與 `g` 同列 → **可以並排 ✅** |
    | 1920 | 858 | 692 | 只有一欄 —— 網格 `minmax(360px,1fr)` 自己放不下兩欄（`.viz-scalars` 佔掉約 134px），不是樹的規則擋的 |
    | 1400 | 624 | — | 樹佔整行（面板 < 800，**刻意如此**：窄面板時半寬會看不清） |

    修好前（同一支程式、1920）：BST 卡片是 `var card-wide`、遞歸樹是 `calltree-section card-wide`。
  - **新增契約測試**（`test/panellayout-test.ts`，現 47 項）：`treeAutoWideOf` 的四個門檻 + 「兩個 `.viz-body` 分支都掛了 `panelRef`」+ 「呼叫端不能傳死的 `true`」—— 這兩條正是這次兩個 bug 的形狀，誰再改回去就立刻 FAIL。
  - **順手修掉的坑**：headless Chrome 的 `--user-data-dir` 一開始放在 repo 的 `tmp/` 裡 → Chrome 鎖住 `Cookies` → Vite watcher **EBUSY 直接崩掉 dev server**（跟之前 `*.TMP` 那個老坑同一類）。修法：`vite.config.ts` 的 `watch.ignored` 加 `**/tmp/**`（`tmp/` 本來就是放臨時腳本的地方），驗證用的 profile 改放 `%TEMP%`。
- 2026-08-17：**發布 v0.11.0 —— 解耦重構第二批（S0–S9）完成，型別債清零**。
  - **結果**：`interpreter.ts` **2930 → 113 行**（只剩 `run()` 與公開型別轉出）；`App.tsx` **493 → 206 行**；**`tsc --noEmit` 31 → 0**；測試 36 → **37 檔**（新增 `appshell-test`）。
  - **模組地圖**（依賴單向、無循環）：
    ```
    interpreter.ts  run() + 型別轉出
          ↓
       core.ts      求值 / 敘述 / 呼叫（三者互相遞迴 → 必須同檔）
          ↓
    snapshot.ts  builtins.ts  cells.ts  values.ts  input.ts  runtime.ts
          ↓（更下層）
       memory.ts  ast.ts  lexer.ts
    ```
    UI：`App.tsx`（版面/接線）→ `usePlayer`（播放器狀態）/ `Topbar` / `Splitter` / `OutputPane` → `VariablesPanel` → `viz/{tree,graph,containers,window,format}`。
  - **安全網**：`test/interp-golden-test.ts` 的 **31 個 golden 案例**（每一帧 digest 整體雜湊）在每一步都一字不差 —— 這是「拆檔 0 行為差異」的證據。要刻意改行為時 `UPDATE_GOLDEN=1` 重錄並在 commit message 說明。
  - **新的發版指令**：`npm run verify` = `typecheck` + `test` + `build`（三者都要綠）。`npm run typecheck` 從此是 0 錯誤，任何新增的型別錯誤都看得見。
  - **每步一個 commit**（方便回檔）：S0 `71bd588`、S1 `bbe7817`、S2 `4149dd0`、S3 `d4cccd7`、S4 `44548bf`、S5 `d9cb389`、S6 `c652c25`、S7 `31e24eb`、S8 `0cbbf8e`、S9 `c2a0c62`。任一步壞掉可 `git revert <sha>`。
  - **行為修正（S8 順手抓到的靜默錯誤）**：對 set / stack / queue / pair / struct 取下标（`s[0]`）以前會變成 `undefined.length` 崩潰，現在是明確的「不能对 set 取下标」；`int a[] = x`（省略大小卻沒有初始化列表）以前存取 `undefined.items`，現在是明確錯誤。兩者都補了 `compat-test` 斷言。
  - **還沒做（後續可選）**：其餘 28 個測試檔各自的自訂 harness 尚未統一（簽章不一，見 `ARCHITECTURE.md` §2D）；`core.ts` 826 行裡的 `execCall` / `sizeofOperand` 等主題若再變胖可再拆（§2A）。
- 2026-08-17：**重構 S0–S1（大工程的逐步拆檔；每步一個 commit，方便回檔）**。計畫與驗證方式見 `ARCHITECTURE.md` §4。
  - **S0（`71bd588`）**：手冊（`ARCHITECTURE.md` 補上「執行計畫 S0–S9」）+ **特性化 golden 測試** `test/interp-golden-test.ts` 與 `test/_golden/interp-golden.txt`（31 個代表性程式，把「每一帧 digest」整體雜湊錄下來）。重構不該改變行為 —— digest 一變就是動到了什麼；要刻意改行為時 `UPDATE_GOLDEN=1` 重錄並在 commit 說明。
  - **S1**：抽出 `src/interpreter/runtime.ts`（118 行）—— `Runtime` 介面、`Snapshot` / `CallNode` / `RunOptions`、`RuntimeError`、`RV` / `LValue` / 三個控制流 signal、`Frame`、`MAX_STEPS`、`isIntegral` / `truthy` / `defaultScalar`。`interpreter.ts` 2930 → **2832** 行；對外公開型別仍從 `interpreter.ts` 轉出（App / 面板 / 測試的 import 不用改）。
  - 重構過程中新增的兩個踩坑：①這個檔在磁碟上是 **CRLF**，用腳本切檔時要 `split(/\r?\n/)` 再以 LF 寫回（`git config core.autocrlf=true` 會處理儲存）；②`0-diff` 驗證要看 golden，不要只看 build。
  - **S2**：抽出 `src/interpreter/values.ts`（634 行）—— 全部**純函式**：數值轉換與比較（`num` / `coerceTo` / `cmp` / `eq` / `charCode`）、容器比較（`cellOrder` / `valueOrder` / `seqOf`…）、運算（`applyBinary` / `numeric` / `combineAssign`）、格式化（`toStringVal` / `formatDouble` / `formatExpr`）、`sizeof` 的位元組計算、`set`/`map`/`heap`/`bst` 的純演算法。`interpreter.ts` 2832 → **2259** 行。**踩坑：`typeBytes`/`cellBytes` 其實需要 `Runtime` 型別（查 struct 成員大小），所以 values.ts 要 `import type { Runtime }`；不補的話 tsc 一次多 4 個錯誤。**
  - **S3**：抽出 `src/interpreter/input.ts`（53 行）—— cin 的游標模型：`skipInputSpace` / `readCinToken`（char 目標只吃一個字元）/ `readCinLine` / `inadequateInputMsg`。`interpreter.ts` 2259 → **2215** 行。使用游標的 generator（cin 陳述式、`cin >> x` 條件、getline）留在原地，等 S5 一起搬到 stmts。**順手做了一個可重複的切檔工具 `tmp/extract.mjs`（來源/目的/檔頭/項目名 → 自動加 export、自動產生 import），S4–S6 都會用它。**
  - **S4（最大的一步）**：抽出 **`src/interpreter/builtins.ts`（1046 行）** 與 **`src/interpreter/cells.ts`（77 行）**。
    - `cells.ts`：純粹的 Cell 配置工具（`allocStruct` / `allocFromType` / `allocVector` / `allocTree` / `fillAllScalars`）—— 宣告（execDecl）與容器方法都要用。
    - `builtins.ts`：`execCall` 的**內建函式段**（sort / 數學 / stoi / memset / sizeof / 區間寫法…）＋ `execMethodCall` 的**全部主體**（string/vector/stack/queue/map/set/… 方法），以及只被它們用到的輔助（`resolveRange` / `buildElemCell` / `buildStructFromList` / `stableSortWithCmp` / `callComparator` / `requireStringArg` / `MUTATING_METHODS`）。
    - **循環依賴怎麼解**：內建函式要「求值」（`evalExpr`）與「取左值」（`resolveTarget`），但那兩個在核心、而核心又呼叫 builtins → 所以核心用 **`EvalCtx`** 把能力**注入**（`const evalCtx: EvalCtx = { evalExpr, resolveTarget }`），builtins 只依賴型別與純函式。`execCall` / `execMethodCall` 在 interpreter 裡只剩幾行的轉發。
    - `interpreter.ts` 2215 → **1078 行**（累計 2930 → 1078，**−63%**）。
  - S4 踩到的坑（都記在 commit 裡）：①我的字串切檔工具把**註解**算進前一個項目的範圍，害我以為 execCall 的最後一行是 `}` → 改用「往下找第一個 `}`」當邊界；②S2 當時把 import 區塊補在檔案**結尾**（ESM 匯入會被提升，所以編譯與測試都正常），S4 重建檔頭時順手清掉；③注入 `ctx` 的腳本一開始把參數插在 `rt` **前面**，與呼叫端 `(rt, ctx, …)` 對不上 → tsc 的 `Type 'Runtime' is missing … from type 'EvalCtx'` 一次抓出 6 處；④重建檔頭時漏了 `export type { Snapshot, CallNode, RunOptions }` 的轉出，害下游 8 個隱式 any、tsc 一次多 12 個錯誤（補回就回到 31）。
  - **S5**：抽出 `src/interpreter/snapshot.ts`（157 行）—— 快照與呼叫樹工具：`dumpAll` / `collectLocals` / `updateActiveLocals` / `mark` / `markCondition` / `formatCellValue` + 呼叫樹的 `getVar` / `findCallNode` / `callPath` / `updateCallAt` / `cloneCallTree`。這些只依賴 Runtime 狀態與純函式（不求值），所以能獨立成檔，execStmt 每條敘述都會呼叫 `mark`。`interpreter.ts` 1078 → **933** 行。
  - **S6（本輪）**：抽出 **`src/interpreter/core.ts`（826 行）** —— 直譯器的執行引擎：求值（`sizeofOperand` / `resolveTarget` / `evalExpr` / `evalReturnValue`）、敘述（`execAssign` / `execUpdate` / `execDecl` / `execBlock` / `cinReadTargets` / `execStmt`）、呼叫（`execCall` / `execMethodCall` / `buildFromInit` / `applyInitList` / `applyStructInit`）與序列輔助（`RangeSeq` / `bstInOrder` / `rangeForSequence`）。
    - **為什麼求值/敘述/呼叫一定要同一個檔**：三者**互相遞迴**（`evalExpr → execCall → execBlock → evalExpr`），硬拆成三個檔必然循環 import；把回呼當參數層層傳則會讓每個簽章都多兩個參數。所以 S5 原計畫的 `stmts.ts` 併進這裡。依賴方向單向：`interpreter → core → {snapshot, builtins, cells, values, input, runtime}`（memory / ast / lexer 更下層）。
    - `interpreter.ts` 933 → **113 行**（累計 2930 → 113，**−96%**），只剩 `run()` + `export type { CallNode, RunOptions, Snapshot }` + `export { RuntimeError }`。**公開面完全沒變**（App / 面板 / 36 個測試檔的 import 一行都不用改）。
    - **驗證**：`npm run build` ✅（built in 218ms）、`npm test` **36/36 全過**（含 31 個 golden 特性化案例 —— 每一帧 digest 一字不差，代表搬檔是 0 行為差異）、`tsc --noEmit` **仍 31**（與搬檔前逐條相同，全是既有的 Cell/Expr 窄化錯誤，S8 處理）。
    - **踩坑**：改寫檔頭時**只幫 `run()` 匯入了 runtime/snapshot/core 三個模組**，漏了它還用到的 `Program`（ast）/ `Memory`（memory）/ `toStringVal`（values）→ tsc 由 31 變 36。修法：檔頭的 import 產生器要**對所有下層模組都跑一次**（`importsOf` 只匯出真正用到的名字，沒用到的模組自然不產生 import），改完就回到 31。腳本：`tmp/s6.mjs`。
  - **S7**：`App.tsx` **493 → 206 行**，拆成四個模組（都在 `src/components/`）：
    - `usePlayer.ts`（187 行）：`usePlayer({ code, input, showIf, showWhile, showFor, boolAsInt })` → **播放器全部狀態與動作** —— `snapshots` / `index` / `playing` / `speed` / `error` / `breakpoints` / `jumpVal`、`collect` / `start` / `stepForward` / `stepBack` / `reset` / `togglePlay` / `doJump` / `toggleBreakpoint`，以及三個 effect（播放計時器、跑到底自動暫停、**撞到斷點自動暫停**）。另外收斂出 `invalidate()`（改程式碼／改 cin／改顯示開關都要讓舊快照失效 —— v0.5.2 的 bug 就是漏了其中一條）。
    - `Topbar.tsx`（150 行）：標題、示例下拉、執行控制、速度滑桿、**設定選單（顯示開關 + Tab 縮排）**、步數與跳步；`menuOpen` 是純 UI 狀態所以留在這裡。
    - `Splitter.tsx`（100 行）：`<Splitter orientation="vertical|horizontal">` + `useVerticalDrag`（左右）+ `useStackDrag`（程式碼／cin／輸出三段的上下夾制）。
    - `OutputPane.tsx`（31 行）：面板本體 + **純函式 `outputView(cur, error)`**（執行期錯誤 > 這一步的輸出 > 解析錯誤 > 「尚未執行」）—— 以前這段 if/else 埋在元件裡，node 端測不到。
    - **新增測試 `test/appshell-test.ts`（23 項）**：`outputView` 五個分支 + 真快照 + 11 條原始碼契約（`setInterval` 不能在 App、`cond-menu` 不能在 App、App 不能有裸的 `className="divider"`、App ≤ 260 行…）+ **用 `react-dom/server` 把整個 `<App/>` 渲染一次**（拆完最容易斷的是接線）。順手修了 `editor-setup-test` 裡「設定選單在 App」的假設（JSX 搬去 Topbar，接線留在 App）。
  - **S8**：**`tsc --noEmit` 的 31 個既有型別錯誤 → 0**（`npm run typecheck` 從此可用；新增 `npm run verify` = typecheck + test + build）。分五類修：
    1. `memory.ts` 加 **`asIndexable(cell): Cell[] | null`**（**只有 array/vector** —— stack/queue/set 的 `s[0]` 在 C++ 也不合法，所以刻意不算進「可下標」；`array` 的 `cells.length` 永遠等於 `size`，呼叫端不用再分支）與 `elemTypeOf(cell): Type | null`；渲染層（`viz/window` / `viz/graph` / `viz/format`）改用它們。
    2. `ast.ts` 補節點子型別 `AssignExpr` / `UpdateExpr`（`Extract<Expr, {kind:'assign'|'update'}>`，和既有的 `CallExpr` / `MethodCallExpr` 同模式）→ `execAssign` / `execUpdate` 不再是寬的 `Expr`。
    3. `const members = []` + `push({kind:'scalar',…})` 被推成 `kind: string`（不是 `Cell`）→ 明確標型別（`builtins.ts` / `cells.ts`）。
    4. **`ref` 真的不該出現在面板**（`dumpAll` 早就解引用完）→ `VariablesPanel` / `format.cellLabel` 各加一個明確分支，寧可顯示「（未解析的引用 x）」也不要靜默畫成空容器。
    5. 零星：`parser.ts` 的 `arraySizes` 型別是 `(Expr | undefined)[]`；CodeMirror gutter 的 `domEventHandlers` 事件是寬鬆 `Event`，要自己收窄成 `MouseEvent`。
    - **順手的行為修正（不是純型別）**：①以前對 set/stack/queue/pair/struct 取下标會變成 `undefined.length` 崩潰（使用者看到的是 `Cannot read properties of undefined`）→ 現在是明確的 **`不能对 set 取下标`**；②`int a[] = x`（省略大小卻沒有初始化列表）以前也是存取 `undefined.items` → 現在是「省略数组大小时必须提供初始化列表」。兩者都補進 `test/compat-test.ts`（+5 條，現 69 項）。
    - **驗證**：`npm run typecheck` **0 錯誤**、`npm test` **37/37**（含 31 個 golden 案例 —— 顯示 digest 一字不差，證明型別修正沒有動到行為）、`npm run build` ✅。
  - **S9（重構最後一步）**：新增 **`test/_helpers.ts`（73 行）** —— 測試共用樣板 `check` / `eq` / `run1` / `out` / `err` / `report` + `stats` 計數。檔名以 `_` 開頭，`scripts/run-tests.mjs` 會忽略（並在輸出裡列出「（忽略 1 個 _ 前綴檔案：_helpers.ts）」），但仍可被 import；每個測試檔是**獨立 node 行程**，所以共用計數器不會跨檔累加。
    - **已遷移 9 個樣板一字不差的檔**（aliasbadge / appshell / crash / editor-setup / hkoi-presets / panellayout / render / render-limit / summary）：開頭 `import { check, report } from './_helpers'`、結尾 `report('<name>')`，每個檔少掉那 15 行重複。
    - **其餘 28 個刻意不動**：它們的自訂 harness 簽章與語意各不相同（`eq` 至少三種、`err` 兩種比對位置、`run1` 三種回傳形狀），逐檔換要一個一個對呼叫端 —— 屬於後續可選工作，已記在 `ARCHITECTURE.md` §2D。
    - **驗證**：`npm test` 37/37、`npm run typecheck` 0 ✅。
- 2026-08-17：**v0.10.0 —— 解耦重構（第一批）：`VariablesPanel.tsx` 1983 → 487 行，拆成 `src/components/viz/` 五個模組，並去掉一份複製**。
  - **起因**：使用者問「整個專案有沒有需要對/解耦的地方？方便後續更新」。
  - **盤點**（寫進新增的 `ARCHITECTURE.md`）：`interpreter.ts` **2930** / `parser.ts` 1019 / `index.css` 715 / `App.tsx` 493（**單一 480 行元件**）/ `VariablesPanel.tsx` 1983。
  - **這輪做的**：
    1. **拆檔**：`viz/format.ts`（純函式：格式化、命中判斷、型別標籤，**沒有 React 依賴**）、`viz/window.tsx`（1D/2D/struct 矩陣視窗）、`viz/containers.tsx`（string/stack/queue/deque/set/map/struct/pair）、`viz/graph.tsx`（圖）、`viz/tree.tsx`（樹與呼叫樹）。依賴是單向的 `panel → {tree, graph, containers, window} → format`，沒有循環 import。
    2. **去重**：`Windowed2D` 與 `StructArrayView` 原本各有一份一模一樣的「偏移 + 跟隨讀寫 + 滑桿」邏輯（v0.9.7 改那兩份時得用 `replace_all` 才改得乾淨，就是這個味道）→ 共用 `useWindowOffset()`。
    3. **測試不再為了測純函式而拉進整個元件**：`summary-test` 改成 `import { formatCellShort } from '../src/components/viz/format'`。
  - **做法**（可重複）：先用 `tmp/outline.mjs` 列出每個 top-level 項目的行範圍 → `tmp/split.mjs` 按目的地切檔 → `tmp/exportify.mjs` 補 `export` → `tsc --noEmit` 找出缺的 import 補上 → `npm test`（35 檔全過）。**渲染層測試就是搬檔案的安全網**。
  - **後續計畫**（詳見 `ARCHITECTURE.md`）：(A) `interpreter.ts` 切 `runtime` / `values` / `input` / `builtins`（**最高優先** —— 語言功能只會加、不會少）；(B) `App.tsx` 抽 `usePlayer` / `Topbar` / `Splitter` / `OutputPane`；(C) 31 個既有 `tsc --noEmit` 型別錯誤（幾乎都是 `Cell` 聯合型別沒先窄化，建議加 `asSeq()` / `elemTypeOf()` 一次清掉）；(D) 測試樣板抽 `test/_helpers.ts`；(E) `index.css` 暫不拆（有幾處刻意靠覆蓋順序運作）。
- 2026-08-17：**v0.9.8 —— 遞歸樹與 2D array 卡片也可以並排（面板夠寬時自動）**。
  - **使用者原話**：「能不能把遞歸樹和 2D array 這些也做成能並排？可以設置固定大小，或者當我右邊比例/大小大於某個數值後才允許並排」。
  - **做法**：
    1. **2D array 卡片不再佔整行**：二維視窗固定 5×5 之後（v0.9.7），它的自然寬度只有 ~250px，所以直接當普通卡片（一欄）→ 可以和別的卡片並排；想要整行按 ⤢。**移除了 v0.9.6 加的「行長 > 12 就佔整行」規則**。
    2. **樹 / BST / 堆 / 遞歸樹（呼叫樹）改成有門檻的自動**：面板寬度 ≥ `TREE_PACK_MIN = 800px`（≈ 兩個 400px 欄位）時只佔一欄、可以並排；否則佔整行。面板寬度用 `ResizeObserver` 量 `.viz-body` 的 `clientWidth`（`panelW`）；**量不到（第一幀 / SSR）先當窄面板佔整行**，避免「先擠在一起再跳開」。
    3. **手動優先**：`isWide(layout, key, auto)` 的規則是「**手動選過就以手動為準**，沒選過才看 auto；另外放大 > 100% 一律整行」。所以 ⤢/⤡ 按鈕永遠反映目前有效的大小、按下去一定有變化（以前樹在窄面板自動佔整行時，按鈕顯示「改成整行宽」但按了等於沒反應）—— 這也正好提供使用者要的「設置固定大小」。選擇存在 `localStorage['cpp-viz.panel-layout']`。
    4. **移除 `shapeClass`**：卡片欄數完全由 `isWide()` 決定（不再看容器種類），CSS 的 `.shape-square` / `.shape-horizontal` 收成單純的 `.card-wide`。
  - 測試：`panellayout-test.ts` +6（auto 的優先序：auto 生效 / 手動覆蓋 auto / 放大強制整行 / 門檻是合理數字）；`render-test.ts` 改寫成用 `card-wide` 判斷（二維表、一維陣列、pair、字串都不佔整行；樹在「量不到寬度」時仍佔整行）+3 項契約（面板有量寬度、有 `TREE_PACK_MIN`、`isWide` 有 `auto` 參數）。`aliasbadge-test.ts` 的切卡片字串改成 `class=var`。**35 個測試檔全過**。
  - ⚠️ **踩坑（浪費了一輪）**：改完測試檔後我直接 `node test/aliasbadge-test.mjs`，看到的是**舊 bundle** 的失敗（`cards()` 回空陣列），就以為是正則寫錯；其實 `npm test` 會自己重新打包。**手動跑單一測試一定要先 `rolldown` 重新打包**（AGENTS.md 早有這條，這次又踩）。
- 2026-08-17：**v0.9.7 —— 2D 視窗改回固定 5×5（使用者要求：大小可預期，靠寫入自動跳轉就夠）**。
  - 使用者原話：「2D array 的大小改回 5*5，有寫入時自動跳轉就好」。也就是**不要**讓二維視窗跟著卡片寬度變（v0.9.6 我做的自適應），固定 5×5 反而可預期；要看別的行列就用滑桿，而且**寫入/讀取到的那一格會自動滾進視窗**（這個 focus 跟隨本來就有，保留）。
  - 改動：`Windowed2D` 與 `StructArrayView`（結構體矩陣）都拿掉 `useFit`／`winRows`／`cols`，回到 `WIN_2D = 5` 的固定 5×5；`maxRowOff`／`maxColOff`／focus 跟隨／滑桿條件／視窗標籤全部改回 `WIN_2D`。
  - **1D 視窗保留自適應**（`useFit(WIN_1D, 40)`）：那是「卡片並排」的前提 —— 半寬卡片若固定顯示 10 格會把陣列擠成兩行（正是上一輪被迫退成單欄的原因）。如果使用者也想要 1D 固定 10，說一聲就改。
  - 測試：`test/render-limit-test.ts` +4 項**原始碼契約**（因為 SSR 量不到寬度，渲染結果分辨不出「有沒有自適應」）：`WIN_2D = 5`、**不准再出現 `useFit(WIN_2D`**、1D 仍必須自適應、focus 跟隨邏輯仍在。共 16 項。35 個測試檔全過。
- 2026-08-17：**v0.9.6 —— 讓多個變數／資料結構並排（右側不再一張卡片佔一行）**。
  - **使用者的原意**（第一次我理解錯了）：不是要單一 2D 陣列變大，而是**讓更多變數卡片並排放在右邊**。
  - **根因（兩層疊在一起）**：
    1. `.viz-main` 以前是「寬螢幕寫死兩欄、窄螢幕硬退成單欄」，而 `@media (max-width: 1440px)` 在一般筆電就命中 → **幾乎所有情況都是單欄**：一張卡片一行。
    2. 而且大部分卡片的形狀被寫死成 `shape-horizontal`（`grid-column: 1 / -1` ＝佔整行）：**一維陣列／vector、字串（string）、set / map / queue / deque、tree / bst / pqueue** 全部都是整行 → 即使有兩欄也會佔滿，右邊永遠空著。
  - **修法**：
    1. **網格改成 `repeat(auto-fill, minmax(360px, 1fr))`**（`@media (max-width: 1440px)` 那條也一起改）→ 卡片按可用寬度自動分欄：寬螢幕多欄、拖窄了自然變單欄。容器查詢的單欄門檻由 680px 收到 520px（600~680px 其實放得下兩欄，不該被硬退成單欄）。
    2. **卡片形狀改成「預設一欄」**（`shapeClass`）：只有真的需要橫向空間的才佔整行 —— **樹 / BST / 堆**（橫向層級佈局）與**很寬的二維表**（行長 > 12，例如 501 列的 DP 表）。一維陣列、字串、set/map、queue/deque、stack、pair 全部變成單欄，可以並排。
    3. **讓單欄卡片不會被擠爆**：新增 `useFit()`（量卡片實際寬度，`offsetWidth` 與容器 `clientWidth` 同一座標系、不受卡片 zoom 影響），`Windowed1D` / `Windowed2D` / `StructArrayView` 的**視窗欄數改成跟著寬度走**（一維 10~40 格、二維 5~26 欄，行數 ≈ 0.7 倍、5~12 行）。以前寫死「一行 5／10 格」，窄卡片就會把陣列擠成兩行 —— 那正是上一輪被迫退成單欄的原因。
  - 註：寬的 DP 表「變大」只是副作用（拿到整行 + 自適應視窗會多顯示幾欄）；使用者的主訴求由「形狀 + 網格」解決。
  - 測試：`test/render-test.ts` 補 6 項，**用真的 DOM 渲染斷言卡片形狀**：寬 2D（20 列）→ `shape-horizontal`、一維陣列／pair／字串 → `shape-square`、樹 → `shape-horizontal`；再加 CSS 必須是 auto-fill ×2、`useFit` 必須存在。⚠️ 踩坑：測試裡的 `cardOf(name)` 正則要錨在 `</span>NAME<span`（caret 之後緊跟變數名），否則單字母變數名（`s`）會誤判到第一張卡片。35 個測試檔全過。
- 2026-08-17：**v0.9.5 —— 編輯器 Tab 縮排改成 4 格（可切回 2）+ 整行加減縮排的快捷鍵**。
  - **起因**：使用者說「Windows 上預設 Tab = 4 個空格，我們專案裡只有 2 個；能不能改預設 4？另外有什麽快捷鍵能一鍵加/減 Tab？」
  - **根因**：CodeMirror 的 `indentUnit` facet **預設就是 2 個空格**（`@codemirror/language`），而 `@uiw/react-codemirror` 又預設掛了 `indentWithTab`（Tab→`indentMore`、Shift-Tab→`indentLess`），所以 Tab 一直只縮 2 格。
  - **修法**：新增 `src/components/editorSetup.ts`（**抽出來才測得動**：node 端建 `EditorState` 就能驗 facet 與快捷鍵，不需要真 DOM）：
    - `DEFAULT_INDENT_SIZE = 4`、`INDENT_SIZES = [2, 4]`、`indentUnitOf()`、`normalizeIndentSize()`（亂值一律回 4）。
    - `editorIndentExtensions(size)` = `indentUnit.of(' '.repeat(size))` + `EditorState.tabSize.of(size)` + 快捷鍵：**Tab→`indentMore`、Shift-Tab→`indentLess`、`Mod-]`/`Mod-[`（Ctrl+] / Ctrl+[）** 各一組。後兩組是 VS Code / Sublime 的寫法，**不用先選取整行**，游標在那一行按一下就能加/減一層；選取多行時整批處理。
    - `CodeEditor` 用 **`Compartment`** 動態重設這一小塊 extension（改設定不必重建編輯器、不會丟 undo 歷史），並新增 `indentSize` prop。
    - `App` 新增狀態 + `localStorage['cpp-viz-indent-size']` 記憶，並在「設置 ▾」選單加一區「編輯器：Tab 縮排 [2 格][4 格]」與一行說明「整行加减缩排：Tab / Shift-Tab，或 Ctrl+] / Ctrl+["（順手讓功能被發現）。
  - 測試：新增 `test/editor-setup-test.ts`（**19 項**）——預設 4 格、換算、**真的建 `EditorState` 驗 `indentUnit` = 4 個空格與 `tabSize` = 4**、切成 2 時是 2 格、四組快捷鍵各自綁到 `indentMore`/`indentLess`，以及**接線的契約測試**（App 必須把 `indentSize` 傳給 CodeEditor、選單要有選項、要記進 localStorage、CodeEditor 要用 Compartment 重設）。35 個測試檔全過。
- 2026-08-17：**v0.9.4 —— 修「501×501 的 DP 表讓畫面卡死」**（使用者：那段 `make_same` 程式「卡死在第 4 步」）。
  - **重現並量化**：解釋器本身完全沒問題（99 幀、10ms 跑完）。**卡死的是右側面板的渲染**：`vector<vector<int>> memo(501, vector<int>(501,-1))` 在面板裡走「鄰接表 → 圖」這條路，501 行 × 每行 501 個鄰居 = **251k 條邊** → 卡片要產生 251k 個 `<line>`。實測那一幀產出 **40.8MB 的 HTML**、node 端渲染一次要 **2.9~4.5 秒**（瀏覽器再加上 layout 與 paint 就是整個分頁卡死）。使用者說的「第 4 步」＝ `memo` 第一次出現在畫面上的那一幀（我的實測是 step 5，同一件事）。**不是死循環、也不是解釋器慢。**
  - **修法（三層）**：
    1. 新增 `src/components/graphLimit.ts`：**畫圖前先檢查規模**（節點上限 80、邊上限 800）。超過就不畫 SVG，改顯示「不画成图：501 个节点（上限 80）—— 这比较像二维表格…已自动切成『查看表格』的 5×5 视窗」。
    2. `AdjListView` **預設就用表格**（`rows > GRAPH_MAX_NODES` 時 `useState(true)`）：那種表一開始就是可用的 5×5 視窗（可用滑桿移動）；按「查看图」也只會看到說明，不會把瀏覽器卡死。
    3. **同一類的破口一起補**：`stack` / `queue` / `deque` / `set` / `map` 這五個「逐項列出」的視圖以前**完全沒有上限**（陣列與 2D 有 `WIN_1D`/`WIN_2D` 的滑動視窗，所以沒事），元素一多就一次產生上萬個 DOM 節點。現在統一截斷在 **`VIEW_MAX_ITEMS = 300`**，並顯示「… 还有 N 项未显示（共 M 项；面板一次最多画 300 项，避免页面卡住）」。
  - **效果**：那一幀 **40.8MB → 5.5KB**（渲染 2.9s → 5ms），整個程式的每一幀都 < 7KB。
  - **測試**：新增 `test/render-limit-test.ts`（12 項）—— 規模判斷的邊界（剛好到上限可畫、超一點就不畫）、**501×501 的每一幀 HTML 都 < 100KB**、那張卡走表格模式、預設不畫圖、大 set 只畫 300 項且有「还有 N 项未显示」。**刻意用「渲染出來的 HTML 大小」當門檻**：卡死必然先表現為 HTML 爆掉，這個斷言不需要真瀏覽器就能守住。34 個測試檔全過。
  - 註：真正的成本是**邊數**（每個 `<line>` 約 150 bytes），所以兩個上限都設；節點上限 80 是因為圓形佈局再多也看不清。
- 2026-08-17：**v0.9.3 —— 複查提案第二／三優先的現況，並修掉「函式多載」的靜默錯答案**。
  - **起因**：使用者問「第二／三優先做了嗎？」。我把提案那份清單（2.1~2.12、3.1~3.8）逐條重跑一次，結果：**第二優先 12 項中 11 項可用**（v0.8.0 就做完了），唯一沒做的 2.11 `s.find(x) != s.end()` 是迭代器（永久排除），但訊息會給指引；**第三優先 8 項中 2 項可用**（3.5 `size_t`、3.6 `min({...})`），其餘（switch / lambda / 預設參數 / for 逗號 / `__builtin_popcount`）沒做。
  - ⚠️ **複查時抓到一個「靜默給錯答案」**：3.4「函式多載」原本看起來是「可用」，其實是 `parseProgram` 裡 `functions.set(fn.name, fn)` **直接把同名函式覆蓋掉** → 後定義的那個默默生效。實測 `int f(int x){ return x*10; } int f(double x){ return 1; } cout<<f(3);` 在 C++ 是 **30**，工具印 **1**。這正是這條線一路在消滅的類型（`sort` 忽略第三參、`find` 忽略第二參、`c == 97`…）。**已改成解析期明確報錯**：「不支援函数多载（同名函数定义了两次）："f"。C++ 会靠参数型别挑一个，本工具做不到，请改用不同的函数名」。
  - 順手：`__builtin_*`（popcount 那類）以前只說「未定义的函数」→ 現在講清楚「本工具不做位元运算相关的内建函数（位元运算已决定不做），可以改用迴圈或 x % 2 自己算」。
  - 測試：`test/gap-test.ts` +2 項（同名函式兩次定義必須明確報錯、`__builtin_popcount` 的訊息要提到位元運算）。33 個測試檔全過 —— 也就是說**沒有任何 preset/test 依賴「覆蓋」這個行為**（HKOI 那 32 個 preset 也重跑過）。
  - 第三優先的判斷（未變）：`switch` / lambda / 預設參數 / for 標頭逗號 都是「有等價寫法、初級組少見」，我建議不做；除非教材真的要用。
- 2026-08-17：**v0.9.2 —— 卡片放大到 160% 時「不夠寬」（圖被裁掉 + 橫向捲軸）**。使用者附截圖回報。
  - **症狀**：`vector<pair<int,int>> g[4]`（圓形佈局的圖）的卡片按到 160%，圖只畫得出 3 個節點、右邊被裁掉，卡片底部長出橫向捲軸。
  - **根因（兩件事疊在一起）**：
    1. v0.9.0 的寬度補償 `width: calc(100% / var(--card-zoom))` 在**放大**時把卡片的**佈局寬度壓成 1/z**（這樣 1.6× 的渲染才剛好等於格子寬）—— 但**固定像素尺寸的內容不會跟著縮**：圖的 SVG 是 `width={2 * max(110, N*13) + 80}`（N=4 → 300px），壓到 283px 的內容框裡就已經溢出，再乘 1.6 直接撐出格子。
    2. 半寬格子（筆電約 307px，扣 padding 剩 ~283px）**本來就比圖的 300px 窄**，所以其實 100% 時就已經在捲了，只是 160% 更明顯。
  - **修法**：
    1. **放大 → 自動佔整行**（`panelLayout.isWide(layout, key) = wide || zoomOf(...) > 1`）。「放大」的語意就是「給它空間」：整行格子 630px 扣掉 1/1.6 補償後仍有 394px > 300px，圖不但不再溢出，還真的以自然尺寸佈局再放大 1.6×（視覺上確實變大）。
    2. **圖的 SVG 改成響應式**：加 `viewBox={'0 0 ' + size + ' ' + size}` + CSS `.graph-svg { max-width: 100%; height: auto }`。一般大小（300~400px）的圖在窄卡片裡會自己縮到卡片寬度內（不再長捲軸裁人），大圖（N≥20 → 600px）也整張可見。**取捨**：很大的圖在窄卡片裡會被縮小（標籤跟著縮），想要大字就按＋放大（那時卡片自動佔整行）——這是刻意的：先看到全貌，再放大看細節。
    3. **⤡ 按鈕的語意**：因為放大會自動佔整行，這時只把 `wide` 設回 false 畫面不會有任何變化（使用者會以為按鈕壞了）→ 這一按順便**把縮放回到 100%**（tooltip 講清楚：「放大時自動佔整行；按這裡回到 100% 半宽」）。＋ 的 tooltip 也註明「放大时卡片会自动占整行」。
  - 測試：`test/panellayout-test.ts` +5 項（`isWide` 的規則：100% 不佔、160% 佔、80% 不佔、按過 ⤢ 一直佔、別的卡片不受影響）；`test/render-test.ts` +3 項（圖的 svg 必須帶 `viewBox`，且 `viewBox` 與 `width`/`height` 一致 —— 這是「響應式縮放生效」的前提）。33 個測試檔全過。
- 2026-08-17：**v0.9.1 —— 「黑屏」防護（ErrorBoundary）+ localStorage 讀取守衛 + 初始化列表尾逗號**。
  - **使用者回報**：`vector<int> primes={2,3,7,13};` 這樣初始化會黑屏。
  - **重現不了**（逐項測過）：有無空白、區域/全域、有無 `main`、只有那一行、每一幀都渲染、App 的 options、遞迴＋呼叫樹、60 個元素的大列表、嵌套列表、含算式/含 cin、以及各種畸形輸入（少分號/未閉合/片段/尾逗號）都不會拋錯也不會卡住。所以**先把「黑屏」這個失敗模式本身修掉**，並請使用者回報 Console 訊息。
  - **（1）ErrorBoundary + CrashCard（`src/components/ErrorBoundary.tsx`）**：渲染期拋錯時 React 會把整棵樹卸掉 —— 使用者看到的就是黑屏/白屏，而且不知道要回報什麼。現在包在 `App` 的右側面板外面，任何這類錯誤會變成看得懂的一張卡：「⚠ 內部錯誤（這是本工具的 bug，不是你程式寫錯）」+ 錯誤訊息 + 堆疊前 5 行 + 「重置」按鈕，並印到 Console。**這是通案的修正：以後任何渲染錯誤都不會再無聲無息地白屏**。`resetKey={code}` 讓改過程式碼就自動清掉錯誤狀態。
  - **（2）localStorage 讀取守衛**：`readStoredLayout()` 把 `localStorage.getItem` 包進 try/catch。某些隱私設定/無痕模式下**連讀都會拋 SecurityError**，而它是在 `useState` 的初始化式裡呼叫的 → 會在**渲染期**炸掉整棵樹（我認為這是這次最可能的元兇）。
  - **（3）初始化列表尾逗號**：`vector<int> v = {2, 3, 7, 13,};` 是**合法 C++**（`int a[] = {1,2,3,}`、struct 初始化列表也一樣），以前報「无法解析 \"}\"」。已修 `parsePrimary` 的 `{…}` 與 `parseInitList`（`while (this.eatOp(',') && !this.isOp('}'))`）。
  - 另註：**Vite HMR 的殘留狀態**也會造成這種「突然白屏」（v0.9.0 新增了 `panelLayout.ts` 模組，舊的模組圖可能對不上），所以這類回報第一步都是**強制重新載入（Ctrl+Shift+R）**。
  - 測試：新增 **`test/crash-test.ts`（15 項）**——`describeCrash` 的訊息、`CrashCard` 的替代畫面（有內容/有指引/有重置/有無堆疊兩種）、沒出錯時不干擾渲染，以及**契約測試**（App 必須 import ErrorBoundary 且把 `VariablesPanel` 包住；面板讀 localStorage 必須有 try/catch）。`gap-test` 補 6 項（尾逗號 3 種、空列表 2 種）。測試檔 **33 個**，全過。
- 2026-08-17：**v0.9.0 —— 右側卡片「畫布化」：拖動排序 + 單卡縮放 + 整行寬（+ 持久化）**。這是待辦清單上最後一項（`[ ] 右侧卡片自由拖拽 + 缩放`）。
  - **拖動排序**：卡片標題列左邊加一個拖动把手（⠿，`draggable`），拖到哪張卡片上就佔那張的位置（`moveKeyTo`），落點有虛線框提示、被拖的卡片半透明。原有的 ↑/↓ 按鈕保留（精確、方便鍵盤）。
  - **單卡縮放**：每張卡片有自己的 `−  100%  ＋`（70%~160%，步進 10%，點百分比還原 100%）。實作用 **CSS 的 `zoom` 屬性**而不是 `transform`：`zoom` 會連 `.cell` 裡寫死的 13px 字號與內距一起縮放，而且**參與佈局**（`transform` 會留下一塊空白）；另外補了 `width: calc(100% / var(--card-zoom))`，放大後才不會溢出格子。
  - **整行寬**：`⤢/⤡` 在「半寬」與「跨整行」之間切換（`grid-column: 1 / -1`）——筆電上把二維陣列/圖那張拉成整行很實用。
  - **持久化**：順序 / 縮放 / 全寬存在 `localStorage['cpp-viz.panel-layout']`（老師排一次就固定下來）。讀檔一律驗型別，壞掉就當空佈局（不能讓一份舊存檔把面板弄壞）。
  - **可測性**：拖動與 localStorage 在 node 端測不到（要真瀏覽器的 DOM 事件），所以把「順序怎麼算、縮放怎麼夾、存檔怎麼讀」抽成純函式 `src/components/panelLayout.ts`，新增 `test/panellayout-test.ts`（**24 項**：拖到誰身上、相鄰互換、邊界、夾取、壞存檔、round-trip）。`test/render-test.ts` 補 4 項 DOM 斷言（拖动把手 / 縮放控件 / `--card-zoom` / 按鈕數）。
  - ⚠️ **教訓（編碼）**：用 PowerShell 的 `Add-Content` 追加 CSS 時，中文註解被 ANSI 碼頁寫成 `?`（`/* ---- ??:???? ...`）。**寫檔案一律走 `tools.write` / `tools.edit`（UTF-8），不要用 PowerShell 的文字管線寫含非 ASCII 的檔案**；已用 node 腳本以 UTF-8 重寫該段。
  - 🔎 **跨專案測試修正**：HKOI 的 preset 已經從 21 個長到 **32 個**（多了 v0.7.0 的「讀到 EOF（while cin）」「getline 與 cin.ignore」「字元算術」「固定小數位數」「sort 降序」等）。`test/hkoi-presets-test.ts` 以前一律用**空輸入**跑 → 那些要讀 cin 的 preset 會撞上「cin 讀不足」的明確錯誤（正確行為，但測試要餵資料）。已加 `PRESET_INPUTS`（照他們註解給：EOF → `1 2 3`；getline 陷阱 → 第一行 `3`、第二行 `hello world`），**84 項全過**。
  - 測試檔 **32 個**（新增 `panellayout-test`），全過、0 跳過。
- 2026-08-17：**v0.8.0 —— HKOI 缺口提案的第二優先（他列為「有替代、不急」的那批，一次補齊）**。
  - **`#define`（物件式巨集）**：本工具沒有前置處理器，所以在 `tokenize` 之前加一趟文字層展開 `expandDefines(src)`。第一趟把所有井號開頭的行拿掉（`#include` 本來就被忽略），遇到 `#define NAME 內容` 就記下來；**用等長空白取代，行號/欄號不變**（錯誤訊息位置才對得上）。第二趟掃識別字換掉（跳過字串/字元常數與註解，最多 5 趟支援巨集套巨集）。`#define f(x) …`（名稱後緊接 `(`）＝函式式巨集，忽略。
  - **`typedef` / `using 別名`**：以前只是 `skipToSemi()` 跳過（所以 `typedef long long ll;` 不會報錯，但 `ll x;` 會壞）。現在 Parser 有 `typeAliases: Map<string, Type>`，`parseProgram` 真的解析 `typedef T NAME;` 與 `using NAME = T;`（`using namespace std;` 仍然跳過），`isTypeStart` / `parseType` 都查別名 → `ll x`、`vector<ll>` 都能用。`size_t` 當 `int`（`parseScalarTypeName` + `isTypeStart`）。
  - **三目運算子 `?:`**：`parseTernary()` 插在 `parseAssignment` 與 `parseBinary` 之間（右結合）；新增 `ternary` 節點，只求值被選中的那一邊。
  - **`sizeof` + `memset`**：新增 `sizeof` 節點（`sizeof(a)` / `sizeof(int)` / `sizeof a`）。`sizeof` 只認「陣列 / struct / pair / 純量」；**動態容器刻意不支援**（C++ 的 `sizeof(vector)` 是物件大小 ≈24 bytes 而不是元素個數，回假數字會教出 `sizeof(v)/sizeof(v[0])` 的經典錯誤，所以直接給教學說明並要你用 `.size()`）。`memset` 照 **逐位元組**語意（`memset(a,0x3f,sizeof(a))` → 每個 int 是 `0x3f3f3f3f` = 1061109567，不是 63）；`double/float` 填非 0 會得到垃圾位元 → 明確報錯。
  - **區間寫法**：新增 `resolveRange()`，把 `v.begin(), v.end()`（整個容器）與 `a, a+n`（前 n 個）化簡成「容器 + 個數」，於是 `sort(v.begin(), v.end())`、`sort(a, a+n)`、`sort(a, a+n, greater<int>())`、`reverse(v.begin(), v.end())`、`lower_bound(v.begin(), v.end(), x)`、`fill(a, a+n, x)` 都能跑（以前全部報「不支持迭代器形式」）。**除了這些固定搭配仍然不做迭代器**，`v.begin()` 單獨出現會給指引（range-for / `.size()` / `s.count(x) > 0`）。
  - **其他**：`fill(v.begin(), v.end(), x)`、`v.assign(n, x)`、`min({a,b,c})` / `max({a,b,c})`、`INT_MAX` / `INT_MIN`（另 `LLONG_MAX` / `UINT_MAX` / `LONG_MAX`）、`cin.get()`（讀字元含空白，與 `cin >> c` 不同）。
  - ⚠️ **踩到的坑（值得記）**：把 `fill` 做成內建之後，`test/arrayparam-test.ts` 裡那個**使用者自己取名 `fill` 的遞迴函式**被內建搶走了（它把 `fill(b,0,4)` 當成 std::fill）。修法：`execCall` 開頭算 `shadowed = rt.functions.has(name)`，我新加的內建（`memset` / `fill` / `getline` / 數學函式）都加 `!shadowed` 守衛 —— **使用者自己定義的函式優先**。
  - 測試：`test/gap-test.ts` 92 → **127 項**（新增第二優先那批，含 `sizeof(a)/sizeof(a[0])`、`memset 0x3f = 1061109567`、`sort(a,a+n)` 只排前 n 個、`#define` 名稱在字串/註解裡不被替換、`sizeof(vector)` 的教學錯誤訊息）；`compat-test` 63 → 68 項（`sort(v.begin(),v.end())` / 三目 / `cin.get()` / `using` 從「不可用」翻到「可用」）。**31 個測試檔全過、0 跳過**。
  - 仍未做（第三優先，提案說少用）：`switch`、lambda、預設參數、函式多載、`for` 標頭的逗號運算式、`__builtin_popcount`（位元運算永久排除）、`cin.get(buf, n)`、`fill` 之外的迭代器用法。
- 2026-08-17：**v0.7.0 —— 實作 HKOI 教材編輯的缺口提案（第一優先 6 項 + 兩個粗糙邊 + 字元算術）**。提案：`_工作檔/工作紀錄/13-給VisualCode的缺口提案.md`（他從 17 份教材反推、57 條實測：可用 28 / 不支援 29）。我把 57 條全部重跑一遍驗證，他的清單基本準確。
  - **1.1 `while (cin >> x)` 讀到 EOF**（他說這是唯一「不補就沒辦法好好上課」的兩項之一）。**根因是輸入模型**：舊版只有 `input: string[]`（用 `split(/\s+/)` 切好的 token），換行資訊早就沒了 → getline 根本不可能實作。改成**游標模型**：留原始字串 `inputText` + `textPos`，`cin >>` 跳過空白讀一個 token（**char 目標只吃一個字元**，照 C++ 的 char 重載），`getline` 讀到下一個 `\n`。新增 AST 節點 `cin_expr`（`cin >> x` 當運算式）：EOF 回 `false`，於是 `while (cin >> x)`、`while (!(cin >> x))`、`if (cin >> x)` 都能用；**語句形式 `cin >> a >> b;` 讀不足仍然是明確錯誤**（保留 v0.5.2 的「要读第 N 个值」訊息，兩種形式共用 `cinReadTargets`）。另加 `cin.ignore()` / `cin.ignore(n, c)`（getline 的搭檔），Windows 的 `\r\n` 會正規化。
  - **1.2 `getline(cin, s)` + `cin >> char`**：教材用量最大（10 次）。C++ 的經典行為**照實呈現**：`cin >> n; getline(cin, s);` 讀到**空字串**（換行還在緩衝區），要接 `cin.ignore()`——這是教學點，不是 bug，測試裡有一條專門鎖它。
  - **1.3 C 風格轉型** `(int)x` / `(char)(c+1)` / `(long long)x` / `(int)v.size()`：新增 `cast` 節點（parser 在 `(` 之後 lookahead 認純量型別名，不是型別就退回普通括號）。函數式寫法 `double(a)` 仍不支援。
  - **1.4 數學函式** `sqrt` / `pow` / `floor` / `ceil` / `round` / `fabs`（都回 double；`sqrt(-1)` 印 `nan`，`cppDefaultDouble` 補了 nan/inf）。
  - **1.5 `sort(v, greater<int>())`**：新增 `comparator` 節點；`sort` 的參數解析改成掃描（比較子/個數可任意順序），所以 `sort(v, greater<int>())`、`sort(v, n, greater<int>())`、`sort(v, cmp)`、`sort(v, n, cmp)` 都通。
  - **1.6 `fixed` + `setprecision(n)`**：他特別請求重新考慮（HKOJ 有對應題目 E1714C／E1715C，學生真的會被要求寫）。**用戶決定放寬「永久排除」，但只做這兩個**，不做完整 `<iomanip>`。實作：runtime 存 `floatFixed` / `floatPrecision`，`cout` 遇到 `fixed` / `setprecision(n)` 只改狀態不輸出，`toStringVal` 加 `FloatFmt`。**順帶把 double 的預設輸出改成 C++ 語意**（6 位有效數字、指數 < -4 或 ≥ 6 用科學記號）：`0.1+0.2` → `0.3`、`1.0/3` → `0.333333`、`1e9` → `1e+09`（舊版是 JS 全精度 `0.30000000000000004`）→ compat-test 一條斷言因此翻面。
  - **4.1 容器比較的誤導訊息 → 真的能比**：新增 `seqOf` / `cellOrder` / `cellEquals`，支援 `vector` / `deque` / `set` / `pair` / `map` 的 `==` `!=` `<` `<=` `>` `>=`（字典序，元素可再是容器），`unordered_map` 只能比相等（無序）。**C 陣列刻意不假裝**：`int a[3] == b[3]` 在 C++ 比的是指標地址，工具給明確說明而不是靜默逐元素比。`sort` / `lower_bound` 一併改用 `cellOrder` → **`sort(vector<pair>)` 也能跑了**（順手解掉提案第 2.4／2.5 兩條：`v.push_back({1,2})` 放 pair、pair 比大小）。
  - **4.2 `const T&` 參數**：新增 `constRef`；語意同 `T&`（不做 const 正確性檢查），但**照 C++ 可以綁常數/臨時值**（`f(5)`、`f(a*3)`、`f("abc")`）。非 const 的 `int&` 綁常數改成明確錯誤（C++ 也編不過）並提示改用 `const int&` 或按值——舊版的訊息是誤導性的「非法的下标访问」。
  - **字元算術（提案沒列，但我們自己探針抓到，而且它擋住 `(char)` 的教學用途）**：`'d' - 'a'`、`c + 1`、`c += 1`、`c++`、`c - 32` 以前全部報「字符串 \"d\" 不能转为数字」。三個修正：(1) `num` 對 char 取**字元碼**；(2) `cmp` / `eq` 改成「任一邊是 string 型別才字串比」，否則照數值 → 同時修掉 `'a' > 100`（舊版字串比給錯答案）與 `c == 97`；(3) **賦值與 `++`/`--` 照目標型別做隱式轉換**（`char c; c = c + 1;` 存 `'b'`、`int x; x = 3.7;` 存 3——舊版會把 3.7 原樣存進 int）。
  - **型別債清理**：`execCall` / `execMethodCall` 的參數從 `Expr` 改成 `Extract<Expr, {kind:'call'}>` / `method_call`（本來就一直在存取 `.args`）→ `tsc --noEmit` 的錯誤從 **149 降到 30**。`npm run build` 仍然只跑 vite（不型別檢查）。
  - 測試：新增 **`test/gap-test.ts`（92 項）**——逐條覆蓋上面每一項（含 `while(cin>>x)` 空輸入 0 圈、getline 的經典陷阱、`(int)(2.7+1.3)=4` 這種浮點細節、科學記號、字元算術、容器比較的支援/不支援兩側）；`cin-test` 14 項（char 從「不支援」翻面）、`compat-test` 63 項（getline / cin>>char / setprecision / fixed / C 風格轉型 五條從「不可用」翻到「可用」）、`container-test` 42 項。**全部 31 個測試檔通過、0 跳過**。
  - 尚未處理（提案的第二／第三優先，他說不急）：`#define` / `typedef` / `using ll` / `INT_MAX` / 三目 `?:` / `memset` / `fill(iter)` / `assign` / `size_t` / `s.find(x) != s.end()`（迭代器，永久排除）/ `cin.get()` / 預設參數 / `switch` / lambda。
- 2026-08-17：**v0.6.1 —— 容器当值时右边不再显示「?」+ 修 `vector<int>()` 崩溃 + 不支援的组合给明确错误**。
  - **使用者回报**：`map` 的值是 `vector` 时，画面上那一格显示 `?`（并猜是「写 set 的时候把 value 绑死成一个值」）。
  - **根因不在 set，而在渲染层**：`VariablesPanel.tsx` 有 **15 处**「不是标量就给 `?`」的退路（map 的键/值、struct 成员、pair 的成员、stack/queue/deque 的元素、数组窗口的格子……），而且 `formatCellShort` 本身也只认 scalar/pair/struct。v0.6.0 让容器能「当值」放进这些位置之后，这些退路就全被踩到了。
  - **修法**：`formatCellShort` 改成**递归摘要** —— 容器 `[1, 2, …]`、set `{…}`、map `{k: v, …}`、pair `(a, b)`、struct `{x:1, …}`、tree 层级序 / BST 中序、ref → `&名字`；带**深度上限 3** 与**长度上限 8**（超出显示 `…`），**永不回传光秃秃的 `?`**。15 处退路全部改呼叫它。
  - **顺带修掉一个真崩溃**：`vector<int>()`（合法的空 vector，常写成 `g.push_back(vector<int>())`、`v = vector<int>()`）以前拿 `undefined` 去求值，崩成 `Cannot read properties of undefined (reading 'kind')`。现在回传空 vector。
  - **顺带**：`g.push_back({1, 2})`（元素是 vector 时，`{…}` 就是内层 vector 的初始化列表，合法 C++）原本报「初始化列表只支持 struct 元素」，现在支援（可嵌套）。
  - **不再外泄内部讯息**：`run()` 的兜底分支把非 RuntimeError 的错误标成「内部错误（这是本工具的 bug，请把这段程序反馈给我们）」；`set<容器>` / `sort(vector<容器>)` / `lower_bound(vector<容器>)` 改为明确的「只支持标量 / 只能放进标量元素」（以前是 `cellScalar: 非标量` 这种看不懂的讯息）。
  - 新增 `test/summary-test.ts`（23 项：每种容器当值的摘要、深度/长度上限、ref、空容器，以及**所有 preset 的每一格容器都不能被画成 `?`** 的地毯式检查）；`test/container-test.ts` 28 → **36 项**；`test/render-test.ts` 增 4 项 DOM 断言（就是以前写死 `': ?'` 的那几个位置）。测试档共 **30 个**。
  - 注：`?` 仍有一个**合法**用途 —— 未初始化的纯量（`int a[10];` 的格子、`vector<int> v(3)` 的元素）本来就显示 `?`（`formatScalar` 的约定）。那与这个 bug 是两回事，测试刻意只抓「非纯量 cell 被画成 `?`」。
  - 工具链注记：`npm run build` 只跑 `vite build`（rolldown 只剥型别、**不做型别检查**），所以 TS 型别错误**不会挡住建置**；`tsc --noEmit` 目前有 **149 个既有错误**（改动前后同一个数）。以后改完可以跑一次确认「没有新增错误」，但不要以为 149 是这次弄坏的。
- 2026-08-16：**v0.6.0 —— 容器可以当值传递**（修掉三个缺口，使用者回报的「回传容器的递归跑不了」就是它們造成的）。
  - **缺口 A（核心）**：`evalExpr` 的 `ident` / `index` 分支以前直接拒绝容器（`变量 "res" 是容器，不能作为标量使用`）→ 现在回传「带 cell 的容器值」。于是 `m[k]=v`、函数回传容器、容器按值传参、`g[u]` 都能用。**这正是使用者 `return memo[expression]=res;` 的报错来源**（`execAssign` 本来就支援容器赋值，是 evalExpr 先挡掉的）。
  - **必要守衛**：新增 `assertScalarRV`，在 `num` / `cmp` / `coerceTo` / `execAssign` / `cout` / `+=` 字串分支都拦下容器——**不放宽就会从「明确报错」退化成「静默 0」**（`int x = v`、`string s = v`、`a[0]=v`、`s+=v` 实测都明确报错）。
  - **缺口 B**：`execDecl` 以前只处理 `array / pair / struct` 的初始化式，其他容器**静默留成空容器**（`vector<int> left = f();` 会得到空的！比报错更危险）→ 现在要求初始化式回传同类容器，否则给「不能用标量初始化 vector」/「初始化类型不匹配」。
  - **缺口 C**：map 的值是容器时不支援（`scalarName(valueType)` 要求纯量）→ 改用 `allocFromType` 建默认值（纯量情况刻意保持 `value: null` 的原样）；`m[不存在的键].push_back(x)` 照 C++ `operator[]` 会先插入（以前会爆 JS 内部错误 `Cannot read properties of undefined`）。纯读取 `m[k]` 仍维持「不插入」。
  - **另修**：临时值下标 `f()[0]`（`indexTempCell`）与临时值成员 `mk().x`（原本只支援 `f().first`）。
  - 新增 `test/container-test.ts`（**28 项**），内含**使用者回报的 LeetCode 241 原题**当回归：`2-1-1` → `2 0`、`2*3-4*5` → `-34 -10 -14 -10 10`。测试档 29 个。
- 2026-08-16：**v0.5.2 —— 修「cin 输入不足」的偶发 bug（根因是快照失效漏了 cin 输入）+ 错误讯息讲清楚差几个值**。
  - **使用者回报**：偶发出现「cin 输入不足」，**刷新一下就没了**。→ 这种「非决定性 + 刷新即好」通常是状态 bug，不是程式的 token 数问题。
  - **根因**：`collect()` 依赖 `code` / `showIf,showWhile,showFor` / `boolAsInt` / **`input`**；但只有前三个变更时才会 `setSnapshots(null)`，cin 输入框的 `onChange` 只做了 `setInput`。于是「**先按运行（输入框还空着）→ 快照里烙着错误 → 才填输入框 → 快照没失效 → 之后按单步/播放/←→ 都只是重播那个旧错误**」；刷新把 snapshots 清掉才会好。完全对应「偶发 + 刷新即好」。
  - **修法**：新增 `onInputChange`，改 cin 输入就跟改代码一样让快照失效（`setPlaying(false)` / `setSnapshots(null)` / `setIndex(-1)` / `setError(null)`）。
  - **讯息改善**：`cin 输入不足（读到输入末尾）` → 「`cin 输入不足：程式要读第 N 个值，但「cin 输入」框只提供了 M 个（用空白分隔）`」。
  - 新增 `test/cin-test.ts`（14 项：链式读入、多行、无空白→整串进 string、用 string 读运算子的变通、输入不足的三种情况、`cin >> char` 与 cin 目标的已知限制）。测试档 28 个。
  - 注：App 这一层的行为**没有自动化测试**（需要 DOM 互动），已用 build + 代码检视确认；手动验证法见下。
- 2026-08-16：**v0.5.1 —— 收紧字元参数 + substr 越界报错**（延续「不要静默、不要教出编译不过的写法」）。
  - `append / insert / replace / compare` 现在**只接受字串参数**：C++ 里这四个方法没有接受单一字元的重载，以前工具会用 char 跑（`s.append('!')`），学生学到的是**真实 C++ 编译不过**的写法。现在明确报错并提示改用 `push_back` / `+=`。
  - 保留宽松（因为 C++ 合法）：`find / rfind`（有 `find(CharT)` 重载）、`push_back`（`push_back(CharT)`）、`+=`（`operator+=(CharT)`）。
  - `substr(pos)` 在 `pos > s.size()` 时以前**静默回空字串**，而 `at` 同情况会报错 → 工具内部不一致；现在 substr 也明确报错（`pos == size()` 仍合法，回空字串）。
  - `test/strfunc-test.ts` 58 → **74 项**；`test/compat-test.ts` 补 2 项。
- 2026-08-16：**v0.5.0 —— string / vector 常用成员 + 字元函数，并修掉 `find` 的静默错误**。
  - ⚠️ **课堂安全修正**：`s.find(str, pos)` 以前**忽略第二参 pos**（`s.find("l",4)` 在 `"hello"` 上回 2，正解是找不到 → -1）。与当年 `sort` 忽略第三参同一类：静默给错答案。已修，并用测试锁住。
  - 补齐 string：`empty / at / front / back / rfind / push_back / pop_back / append / insert(pos,str) / erase(pos[,len]) / replace(pos,len,str) / compare`（`substr` 本来两形式就有）。
  - 补齐 vector：`front / back / at / resize / insert(pos,val) / erase(pos[,len])`。
  - 新增字元函数：`toupper / tolower`（回 char）＋ `isdigit / isalpha / isupper / islower / isalnum / isspace`（回 bool）→ Unit 6 的「大小写转换、判断字元类别」终于能演示。
  - **方法可以串接**：`s.substr(1).size()` 以前报误导性的「非法的下标访问」（interpreter 要求接收者是左值）→ 现在临时值上的唯读方法可用；对临时值呼叫**修改**方法给明确错误。
  - `string::npos` 现在被接受且等於 -1（与 `find` 的回传一致），所以 `if (s.find(x)==string::npos)` 可以直接跑。
  - 新增 `test/strfunc-test.ts`（58 项）；`test/compat-test.ts` 补 5 项 → 58 项。
  - ⚠️ **工具教训（这次的坑值得记）**：我加测试时漏了跳脱，写成 `push_back('1')` 的引号被吃掉 → 测试档语法错误 → 打包失败。而执行器把「打包失败」一律记成 **SKIP**，加上我手动跑的指令**没检查打包 exit code**，于是跑到了**旧的 .mjs**，显示 50 通过（实际是新档没打包成功）。**已修执行器**：打包失败要看错误内容——相依外部档不存在才 SKIP，语法的错要算 **FAIL**。教训：**SKIP 必须当作红旗**，且手动跑测试一定要检查打包是否成功（别只看 node 的输出）。
- 2026-08-16：**v0.4.0 —— 字串 ↔ 数字内建**（`stoi/stol/stoll/stod/stof` + `to_string`）。
  - 照 C++ 语义：跳过前导空白、可选正负号、**读到第一个不合法字符就停**（`stoi("12abc")==12`、`stoi("3.9")==3`）；一个数字都没有 → 明确报错「没有可解析的数字」（对应 std::invalid_argument）。
  - `stoi(s)` 十进制；`stoi(s, 0, base)` 支持 2..36（第 2 个参数 C++ 是 `size_t*` 出参指针，我们没有指针所以忽略它）。进制越界给明确错误。
  - `to_string`：int / long long / double / char / string → string，与 `cout` 的输出保持一致（bool 受 boolAsInt 开关影响）。
  - 新增 `test/stoi-test.ts`（32 项，含进制、前缀语义、错误、与 range-for 组合的数位和）；`test/compat-test.ts` 补 3 项。
- 2026-08-16：**v0.3.0 —— range-based for**（`for (int x : v)` / `for (auto x : v)` / `for (auto& x : v)`）。
  - 实作：`ast.ts` 新增 `range_for` 节点（`declType === null` 表示 auto）；`parser.ts` 在 `parseFor` 开头做**向前扫描 lookahead**（depth 0 先遇 `:` 即范围 for，先遇 `;`/`)` 则维持经典 for）——lexer **不用动**（`:` 本来就在 OPS1）；`interpreter.ts` 新增 `case 'range_for'` + `rangeForSequence()`。
  - 可迭代：array / vector / deque / set / map(元素是 pair) / string(元素是 char) / tree(1 基层级顺序) / bst(中序遍历＝升序)；stack / queue / priority_queue **明确报错**（C++ 没有 begin/end）。容器必须是可定位的变数或其下标/成员（`g[u]` 可以）。
  - 语义：`auto`/显式类型是**值拷贝**（cell 不可变，天然如此）；`auto&` 绑成 ref cell，写入回到原容器 → 正好是 Unit 8 §7「共享 vs 拷贝」的循环版。范围在进入循环时固定（end 只取一次，与 C++ 一致）。每个元素产生一个快照。
  - ⚠️ **耦合**：`auto&` 用 ref cell 实作，而「参数（别名）」徽章原本靠「是 ref cell」判定 → 会给循环变数误标。已给 ref cell 加 `origin: 'param' | 'loop'`，徽章只认 `param`（`test/aliasbadge-test.ts` 第 7 组断言锁住）。
  - 新增 `test/rangefor-test.ts`（30 项）。`test/compat-test.ts` 的 range-for 由「不可用」翻为「可用」（一般 `auto x = 5;` 仍不可用）。
  - 顺带修：**tag `v0.2.2` 原本指向 `127cae6`（＝v0.2.1）**，是「先打 tag、后 commit」造成的；已删除重打在 `6fa7def` 并推送。**教训：tag 要在 commit 之后打。**
  - 另一条教训（对方发现）：`test/hkoi-presets-test.ts` 的跨专案路径原本写成 `HKOI_teaching/presets/`，实际资料夹是 `VisualCode-preset/` → 该测试**从加入起一直被 SKIP**，等于从没验证过。SKIP 机制会让「路径错」看起来像成功，所以跑测试要**看 `通过 N / 跳過 M` 那一行**。
- 2026-08-16：**v0.2.1** —— 徽章文字統一。
  - 純量欄的徽章原本是短版「别名」（當初怕在 116px 窄欄換行），但卡片是「參數（別名）」，造成教材編輯那張四列表（純量/string/vector/array）**出現一致、文字卻不一致**。對方量過 `.alias-badge` 為 8px 字級、「參數（別名）」6 個全形字約 56–64px、純量欄內寬約 104px，確實放得下 → 統一為「參數（別名）」。
  - `test/aliasbadge-test.ts` 補上**文字斷言**：四種別名（int& x / string& s / vector<int>& v / int a[]）的徽章文字必須只有一種「參數（別名）」，且分佈為 rail 1 + card 3。用意是防止以後有人為了省空間又改回短版。
  - `scripts/run-tests.mjs` 改為**忽略底線前綴**的檔案並列出被忽略者；`.gitignore` 加 `tmp/`；診斷腳本約定已寫進 AGENTS.md。起因：我之前把兩個診斷腳本 `badge-check.ts` / `badge-check2.ts` 放進 test/，害測試檔數從 24 變 26、而且探針印出的「NO badge for …」看起來像功能壞掉。
- 2026-08-16：**发布 v0.2.0**（含三项课堂安全修正 + do-while + 数组形参 + 自订比较函数）。
  - **数组形参徽章**：VarView 加 `alias`（dumpAll 在解引用 ref cell 前记下，ref 只可能来自引用/数组形参），卡片与纯量栏渲染「参数（别名）」徽章（index.css 的 .alias-badge）。**刻意不改写入高亮**——决策是「只亮被指向的那个名字」本身即教学证据（test/aliasbadge-test.ts 9 项把它锁住：含「亮的是 g、a 不亮」）。
  - 新增 test/aliasbadge-test.ts（9 项）。测试档共 24 个。
  - 位元运算**确定不做**（教材编辑决定：初赛是笔试、且 << >> 与 cout/cin 共用 token，风险大于收益）；Unit 2 §6 改用 `x % 2` 演示奇偶。
  - 版本交付：package.json 0.2.0 + git tag v0.2.0；`npm test` 一键验证。
- 2026-08-16：**实现 HKOI 建议书（plan/07-VisualCode改進建議.md）的优先 1-3 项**。
  - **优先 2 补完**：数组形参的边界情况——非数组实参（纯量 / vector / 算式）现在给明确错误「数组形参 a 需要传入数组（int a[]）」，不再抛内部的「非法的下标访问」。另确认建议书要求的可视化已满足：全域阵列做实参时，帧内 vars 同时有 `g(global,array)` 与 `a(local,array)`（同一份资料两个名字）。**容器形参（vector<int> v）仍是按值拷贝**，有回归断言。
  - **优先 3 完成**：自定义比较函数 `sort(v, cmp)` / `sort(v, n, cmp)`。实作要点：(1) 手写**自底向上稳定归并排序**（不用 Array.prototype.sort，保证多关键字示范不抖动）；(2) 比较时把两个元素挂到隐藏变量 `__sort_a/__sort_b` 再合成 `cmp(__sort_a, __sort_b)` 调用——复用既有绑定路径，所以**标量 / struct / pair 元素都能比**（C711 那种按关联数据排序可行），且隐藏变量在 dumpAll/collectLocals 被过滤；(3) **比较次数**写进 Snapshot.sortInfo（每帧拷贝，快照隔离），面板顶部显示「排序 · a · 比较 N 次 · n = M」；(4) 排序后检查相邻元素是否逆序 → 违反严格弱序时警告（抓到 cmp 写成 <= 或恒 true）；(5) 保护：步数沿用 20000 上限（实测 n=100 用 cmp 排序不超）。实测 n=8 比较 12 次（上界 24）。
  - **优先 4（位元运算）未做**，仍是加分项，理由见对谈。
  - 新增 test/sortcmp-test.ts（24 项，含稳定排序／比较次数／弱序警告／步数保护／数组形参错误）、test/hkoi-presets-test.ts（直接引用 HKOI 那边的 presets.ts 21 个 preset，执行+渲染+视觉断言 60 项全过）；test/render-test.ts 增测排序横幅。
  - 已知限制：**位元运算、switch、三目、强制转换**仍不支持；cmp 排序会比较慢（每次比较都进调用树、产生步数），课堂建议 n ≤ 8。
- 2026-08-16：**新增 do-while 与数组形参（共享语义）**，均为课程/题库需要的能力。
  - **do-while**：ast 加 do 节点（含 condLine）、parser 加 parseDo、interpreter 加 case 'do'。★关键规格：在 body 执行完、**求值条件之前**产出一个快照（`yield* mark(rt, s.condLine)`，高亮 while 行、右侧已是 body 之后的状态、尚无判断横幅），随后才 markCondition 出判断横幅。实测 fib 风格序列为：line6 i=1（body 完）→ line7 无横幅 i=1（检查前）→ line7 条件=真。continue 会落到条件判断（正确），break 直接跳出；死循环由 MAX_STEPS 兜住（注意 run 不 throw，错误放在最后一个快照的 error 字段）。
  - **数组形参 int a[] / int a[10] / int a[][3]**：parser 参数循环消费 `[]`/`[N]` 后缀并置 isArray；interpreter 把 isArray 与 byRef 同等对待（resolveTarget 取调用方 lvalue + newMem.declare 为 ref cell）。**共享/别名语义**（等同 C++ 数组退化为指针），函数内 a[i]=x 调用方立刻可见。dumpAll 会解引用 ref（interpreter.ts:555/561），所以面板直接显示真实数组。**容器形参 vector<int> v 仍是按值拷贝**（未改动，有回归断言）。
  - 新增 test/do-while-test.ts（14 项，含「检查条件之前必须有快照」的 6 条断言与快照序列打印）、test/arrayparam-test.ts（11 项，含 3 条容器/int&/标量按值的回归）。
- 2026-08-16：**新增 test/render-test.ts —— 渲染层验证**。用 react-dom/server 的 renderToStaticMarkup 把 VariablesPanel 真渲染成 HTML（不用 JSX，用 createElement，避免 rolldown 的 JSX 配置问题），对每个 preset 采样渲染所有快照，断言「不崩」「有变量时不是空壳」「关键结构齐全」（call-label/graph-svg/tree-node-wrap/map-key/graph-weight 等）。能抓到「输出对但画面爆掉」的 bug（如历史上 struct 进容器的黑屏）。10 个 preset / 30 项断言全过。注意：参数被 collectLocals 排除（interpreter.ts:590），所以 fib(int n) 无 call-locals，参数值靠节点内联标签 fib(6) 呈现。
- 2026-08-16：**为「语言子集相容性」提问做逐条核查，并修掉 2 个真 bug**。核查结论固化为 test/compat-test.ts（44 项断言，可用/不可用两侧都断言）。确认**不支持**：do-while、switch、三目 ?:、位运算（^ & | << >>）、auto、range-based for、迭代器形式、强制类型转换（(double)a 与 double(a)）、数组作函数参数、getline、cin>>char、setprecision/fixed、printf。确认**支持**：局部数组（含 2D、递归逐帧独立、声明后默认全 0——与 C++ 的未定义值不同）、sort(v)/sort(v,n)/lower_bound(v,x)/lower_bound(v,n,x)/reverse(v[,n])/swap（仅标量，含 a[i] 形式）、引用参数、容器按值参数、cin 链式读入。修的 bug：(1) lower_bound(v, x) 二参形式把 x 当成 n，抛 JS 内部 TypeError（Cannot read properties of undefined）——改为正确区分二参/三参；(2) sort(a, n, cmp) 静默忽略第三个参数并按升序排序（给出错误结果且无提示）——改为明确报错；(3) sort(v.begin(), v.end()) 报误导性的「非法的下标访问」——改为明确提示不支持迭代器形式。另新增 test/presets-test.ts：逐个执行 src/presets.ts 全部 preset 并断言不报错（新增 preset 后跑它即可验证）。README「已知限制」「测试」两节按实测重写。
- 2026-08-16：**数据结构的树也套用同一套缩放/放大/跟随**（tree<T> / BST / 堆共用 TreeGraph）。做法：把「缩放 + 自动适应 + 放大整屏 + 跟随」抽成共享的 useTreeViewport hook 与 TreeViewport 视口组件，调用树与数据树共用一套实现；顺带把调用树原先的 .calltree-section.magnified + .viz-body.no-contain 方案换成 createPortal 到 document.body（既不受 .viz-body 的 overflow 裁切，也不受其 container-type 产生的 layout containment 影响），并移除了 magnified/onToggleMagnify 两个透传 props。数据树额外获得「跟随本步读写的节点（写优先）」。节点尺寸与字号随缩放：.tree-graph .tree-node 改回 em 可继承（.cell 里写死的 13px/内边距会覆盖继承）。
- 2026-08-16：**调用树窗口太小 → 放大 + 缩放 + 调用栈视图**。根因：树宽 = 叶子数 × SLOT(130) + 180，fib(5) 就 1220px、fib(10) 有 89 个叶子约 11750px；而卡片是 shape-square（>1440px 屏只有半宽）且高度被 max-height:min(420px,42vh) 卡死。做法：(1) 卡片改整行 shape-horizontal，高度上限提到 min(62vh,560px)；(2) 工具栏 完整树/调用栈、−/＋、适应（自动适应）、1:1、放大（fixed 整屏 + Esc 退出）；(3) 缩放直接作用于 SLOT/NH/DH 与字号本身（不用 CSS transform，文字清晰且滚动几何精确），z<0.7 触发 LOD 隐藏局部变量/返回值；(4) 新增「调用栈」模式只画 根→活动节点 路径，宽度由 O(叶子数) 降为 O(深度)，深递归才真正能一屏放下。另修一个自己引入的坑：.viz-body 的 container-type 会施加 layout containment 从而成为 fixed 后代的包含块，会裁切整屏浮层，放大时加 .no-contain 关掉。
- 2026-08-16：**修复递归树不自动跟随**——CallTreeGraph 现在把当前活动调用节点自动滚进视野（含横向；树的宽度由叶子数决定，fib(5) 就有 8 个叶子约 1200px，远超卡片宽度，所以以前横向也会滚出视野）。顺带让编辑器把当前执行行滚进视野（此前只加高亮、从不滚动）。另修 vite.config.ts 的 watcher 忽略规则：原先只忽略小写 *.tmp，Windows 下原子写入产生的 CodeEditor.tsx~RFxxxx.TMP 会让 dev server 以 EBUSY 直接崩溃。
- 2026-08-16：**笔记本适配（数据结构大小不合理 / 工具栏被挤出屏幕）**——右侧固定两列网格在窄屏把数组挤成多行、卡片又高又窄；改为按可视宽度自动退化为单列（≤1440px 单列 + @container 拖窄自适应），格子尺寸分档收紧（≤1440/1180/980）。工具栏 topbar 允许换行并在窄屏压缩（Windows 125%/150% 缩放会把 CSS 视口压到约 1093/1280px，原先单行工具栏会被挤出视口）。调用树节点间距改为按真实标签宽度/局部变量行数自适应（原先固定 SLOT=130/DH=76，标签带真实参数值后相邻节点重叠）。默认分割比按窗口宽度选择（<1500px 用 50%）。
- 2026-08-16：**修复递归树显示变量名而非实际值**——调用节点标签原先用 expr.args.map(formatExpr)（源码文本，显示 fib(n - 1)）；改为标量实参取实际值（fib(5)/fib(4)…），容器/引用实参保留变量名。test/calllabel-test.ts 2 项通过，回归 15 个测试全过。
- 2026-08-16：支持容器存 struct——array/tree/vector 存 struct（元素分配 + 成员访问 + 初始化列表）；test/struct-container-test.ts 4 项通过。
- 2026-08-16：完成「struct + 引用」——struct 定义/成员读写/初始化/参数/返回值、int& 引用传递（ref cell 解引用）、容器按值参数（结构共享）；test/struct-test.ts 5 项 + struct-return-test.ts 2 项通过，回归 19/19。
- 2026-08-16：完成「STL」——deque 容器（push_back/push_front/pop_back/pop_front/front/back/size/empty/clear）+ sort/reverse/lower_bound/swap 函数；test/stl-test.ts 6 项通过。
- 2026-08-16：完成「多维 vector 完善」——vector<vector<int>> g(n, vector<int>(m)) 矩阵填充（模板结构共享）、int a[] = {...} 数组大小推断；test/multivec-test.ts 4 项通过 + 回归 19/19。
- 2026-08-16：编辑器布局 bug 已解决（根因：.cm-theme 包裹层缺高度；修复：.editor-body > .cm-theme{height:100%}）。
- 2026-08-16：完成「快照增量存储」——memory/interpreter 改写时复制（cell 不可变、路径式 setAtPath/updateAt、堆/BST/调用树函数式），dumpAll/cloneCallTree 改引用共享；test/cw-test.ts 19 项全过（含快照隔离验证）。
- 2026-08-16：完成「set/map/unordered_map」——类型/解析/memory/interpreter/渲染全链路；map 支持 operator[] 键索引（读缺键不插入、写缺键插入）；set 排序去重；test/setmap-test.ts 7 项通过 + map 隔离验证。
- 2026-08-16：完成「图可视化」——邻接表识别为图（SVG 节点+连线、节点/边读写高亮、图/表切换）；新增「图的 DFS」预设；test/graph-test.ts DFS 输出验证通过。
- 2026-08-16：图可视化增强 + pair——带权图 pair<int,int> 边权重显示、有向图自动箭头、右侧容器两列并排；pair<A,B>/make_pair/.first/.second 全链路；test/pair-test.ts + dijkstra-test.ts（Dijkstra 0 2 3 9 6）通过。

## 项目目标与成功标准
OI/算法教学用的 C++ 逐步可视化工具。左半 = 代码编辑器 + cin 输入 + 输出（三段垂直堆叠，拖拽横条调整百分比、此消彼长）；右半 = 变量/数据结构。成功标准：常见 OI 代码（数组/vector/栈/队列/堆/树/递归）可逐步演示，变量实时可读，教师/学生能直观看到执行过程。

## 当前状态（完成度估算：约 90%）
- 已完成：解释器语言子集（struct/引用/STL/set/map/图/pair/deque/multivec/string）、变量/容器/调用树可视化、步进与断点、cin、预设、快捷键、bool 开关、条件开关、可拖拽垂直分割、窄屏与笔记本自适应。
- 进行中：（无）
- 未开始：右侧卡片自由拖拽 + 缩放（画布化）、导出 SVG、明暗主题、.in 文件导入。

## 文件清单与职责
| 文件 | 职责 | 状态 |
|---|---|---|
| src/App.tsx | 主壳：布局/拖拽/步进/快捷键/预设/localStorage；含 ResizeObserver 像素高度 | 编辑器方案已改 |
| src/components/CodeEditor.tsx | CodeMirror 封装：当前行高亮 + 断点 gutter；height="100%" | 稳定 |
| src/components/VariablesPanel.tsx | 变量/容器/调用树/树图渲染 | 稳定 |
| src/index.css | 样式；编辑器高度链 + 窄屏媒体查询（≤1440/1180/980px）+ @container 自适应 | 稳定 |
| src/interpreter/*.ts | lexer/parser/ast/interpreter/memory | 稳定 |
| src/presets.ts | 示例预设 | 稳定 |
| test/ | 回归测试 15 个（数组/快照隔离/set·map/pair/图/多 vector/STL/struct/initlist/string/调用树标签） | 全通过 |

## 进行中 / 卡住的问题
- （无卡住问题）编辑器布局 bug 已解决，详见 DEBUG.md。

## 下一步执行计划（精确到文件）
1. 从待办里挑一项开始（建议：src/interpreter 快照增量存储，或 set/map 容器）。
2. 每完成一项，更新本文件与 AGENTS.md。

## 已知坑 / 环境事项
- Windows 沙箱 EPERM → npm run dev/build 必须 sandbox_permissions="danger-full-access"（Vite spawn 原生二进制）。
- 改代码后必须 npm run build + 重启 dev，再探 http://localhost:5173/ 期待 200。
- 编辑器布局 bug 详见 DEBUG.md。
- npm run typecheck 当前有约 90 个既存类型错误（interpreter.ts 71 / VariablesPanel.tsx 17 / parser.ts 1 / CodeEditor.tsx 1），全是联合类型未收窄，不影响 vite build 与运行；详见 DEBUG.md。
- 工作区已迁移到笔记本：C:\Users\wangy\Desktop\VisualCode（旧 C:\Users\hy\... 路径作废）。
- **Git 紀律（兩次 tag 指錯的教訓，必看）**：
  - 症狀：`git checkout <tag>` 拿到的不是那個版本的程式碼。
  - 第一次（v0.2.2）：**先打 tag、後 commit** → tag 指向前一個 commit。規則：**永遠先 commit，再打 tag**。
  - 第二次（v0.5.1）：commit 訊息裡的 `s.append('!')` 含有**單引號**，打斷了 PowerShell 的單引號字串 → `git commit` 根本沒執行，但後面的 `git tag` 照樣跑（還推上去了）→ tag 又指向舊 commit。規則：**PowerShell 傳訊息用雙引號、訊息裡不要有單引號**；而且**每個 git 步驟都要檢查 `$LASTEXITCODE`**（`if ($LASTEXITCODE -ne 0) { exit 1 }`），不要讓後面的步驟在失敗後繼續跑。
  - ★ **打完 tag 一定要驗**：`git rev-list -n 1 <tag>` 必須等於 `git rev-list -n 1 main`；（若要發佈）再 `git ls-remote --tags origin <tag>` 比對遠端。
  - 修法（若已指錯且已推送）：`git tag -d <tag>` → 重新 `git tag -a <tag> <commit>` → `git push origin :refs/tags/<tag>`（刪遠端）→ `git push origin <tag>`。
- **除錯教訓（徽章探針事件，值得記住）**：自己寫的診斷腳本若回報「功能不見了」，**先懷疑探針的抽取邏輯，再懷疑功能**。當時 badge-check.ts 用 `class="caret">([A-Za-z_]\w*)` 抽卡片名，但實際 HTML 是 `class="caret">▾</span>a`（caret 的內容是 ▾、不是空的），所以四種別名只抓到 1 個，印出「NO badge for …」看起來像功能壞掉；換成不依賴取名的寫法（只看 alias-badge 的文字與所在容器）後立刻全數通過——**功能一直是好的**。兩個探針檔中間隔的 32 秒，就是換寫法所花的時間。
- 另一條同類教訓：`run` 不是 throw，而是把執行期錯誤放進**最後一個快照的 `error` 欄位**，寫斷言要讀 `snapshot.error`。
- 自动压缩 checkpoint：CHECKPOINT-2026-08-16.md
