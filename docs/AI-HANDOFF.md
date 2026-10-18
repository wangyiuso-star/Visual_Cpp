# AI 接手文档（maintainer handoff）

> **这份文件是写给「接手这个项目的下一个 AI 助手 / 下一个维护者」的。**
> 它会随仓库一起提交（`docs/AI-HANDOFF.md`），所以内容按**公开可读**的标准写：不写会话内幕，只写现状、约定、怎么验证、哪里还不行。
>
> - 最后更新：2026-10-19（对应版本 **v0.12.0**）
> - 先读这一份；结构与设计细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)，变更日志见 [HANDOFF.md](./HANDOFF.md)，已解决的疑难见 [DEBUG.md](./DEBUG.md)，语言子集细节见 [LANGUAGE-SUBSET.md](./LANGUAGE-SUBSET.md)

---

## 0. 30 秒速览

| 项目 | 内容 |
|---|---|
| 是什么 | 浏览器内的 **C++ 代码逐步可视化**工具（OI / 算法教学用）：左边写 C++、右边实时画出变量/数组/容器/图/递归树，逐步高亮当前行与读写的格子 |
| 形态 | **不是编译器、不是 GDB**：自己写的迷你解释器（lexer → parser → 生成器式 stepper）跑在浏览器里 |
| 技术栈 | React 19 + Vite 8 + TypeScript + CodeMirror 6；无后端、无数据库 |
| 规模 | `src/` 31 个文件 / 约 8000 行；`test/` 36 个测试文件 |
| 跑起来 | `npm install` → `npm run dev` → http://localhost:5173 |
| 三条命令 | `npm run dev`（开发）/ `npm test`（全部测试）/ `npm run verify`（typecheck + test + build，**提交前必跑**） |
| 第一原则 | **宁可给出明确的错误，也绝不能静默给出错误答案**（详见 §5.1） |
| 最脆弱的三处 | ①解释器的语言子集边界（由 `compat-test` 锁定）②面板布局（node 测不到，要开浏览器量）③golden 快照（刻意改行为要重录） |

---

## 1. 它是什么，不是什么

**是**：给老师/助教上课用的「程序执行过程放映机」。学生写的是一段 C++，工具把它**逐句执行**，把每一步的内存状态画出来——数组里哪一格被读了、写了，递归到第几层，堆里现在有什么。

**不是**：
- 不是编译器，不会生成机器码，也不保证和真实 C++ 100% 一致（见 §9.1 的子集边界）；
- 不是调试器，不 attach 进程、不读 core dump；
- 不是判题系统，没有测试数据/评测；
- 不追求跑得动所有 C++。**它的价值在于「教得对」：每一处不支持的语法都要明确说出来，让学生知道这是工具的限制、不是自己的错。**

设计取向（被反复确认过的）：
1. **教学优先**：读写着色、作用域标签、比较次数、返回值变暗……都是为讲台服务的；
2. **不做静默近似**：算不出来/不支持就报错，不猜；
3. **轻量**：整个工具是一个静态站点，`npm run build` 后可以放任何静态托管。

---

## 2. 三条命令跑起来

```bash
npm install
npm run dev        # http://localhost:5173（Windows 也可以双击 start.bat）
npm test           # 36 个测试文件：解释器语义 + 渲染层 + 面板布局 + golden
npm run verify     # typecheck + test + build，提交前必跑（目前全绿）
```

- TypeScript 检查：`npm run typecheck`（`tsc --noEmit`）。**目前是 0 错误**，任何新增的型别错误都应该当场修掉，不要再累积。
- `npm run build` **只做转译、不做型别检查**（vite/rolldown），所以「build 过了」不代表类型是对的。
- 测试执行器是 `scripts/run-tests.mjs`：把每个 `test/*.ts` 用 rolldown 打成 esm 再逐个 `node` 执行。**打包失败只有在「相依的外部档案不存在」时才算 SKIP，语法错误一律 FAIL**（这是被一个假通过坑过之后加的规则）。

---

## 3. 代码地图（31 个源文件 / 约 8750 行）

### 解释器（`src/interpreter/`）

| 文件 | 行数 | 职责 |
|---|---|---|
| `builtins.ts` | 1044 | **全部内建**：sort/reverse/lower_bound/swap、数学函数、stoi/to_string、memset/fill、sizeof、以及 string/vector/stack/queue/map/set 的所有方法 |
| `parser.ts` | 1020 | 语法分析（含 `#define`/`typedef`/cast/comparator/三目/sizeof/区间写法等） |
| `core.ts` | 828 | **执行引擎**：求值 `evalExpr`/取左值 `resolveTarget`、语句 `execStmt`/`execDecl`/`execBlock`、调用 `execCall` |
| `values.ts` | 634 | 值转换与比较的**纯函数**：`num`/`coerceTo`/`cmp`/`applyBinary`/`toStringVal`/`formatDouble`/容器比较/sizeof 字节数 |
| `lexer.ts` | 348 | 词法 + 前置处理（`#include` 跳过、`#define` 文字展开并保留行号） |
| `memory.ts` | 193 | **Cell 内存模型**（递归不可变）+ `Memory`（按路径写时复制）+ `asIndexable`/`elemTypeOf` 窄化工具 |
| `snapshot.ts` | 159 | 快照与调用树工具：`dumpAll`/`mark`/`collectLocals`/`cloneCallTree` |
| `ast.ts` | 121 | AST 型别（`Type`/`Expr`/`Stmt` + `Extract` 出来的 `CallExpr`/`AssignExpr` 等子型别） |
| `runtime.ts` | 118 | `Runtime` 状态、`Snapshot`/`RunOptions`、`RuntimeError`、控制流 signal、`MAX_STEPS = 20000` |
| `interpreter.ts` | 113 | **只放 `run()`**（公开入口）+ 公开型别转出 |
| `cells.ts` | 77 | Cell 配置：`allocFromType`/`allocStruct`/`allocVector`/`allocTree` |
| `input.ts` | 53 | cin 游标：`readCinToken`/`readCinLine`/`inadequateInputMsg` |

依赖方向**单向无循环**：

```
interpreter.ts (run + 型别转出)
      ↓
   core.ts (求值 / 语句 / 调用 —— 三者互相递回，必须同档)
      ↓
snapshot.ts   builtins.ts   cells.ts   values.ts   input.ts   runtime.ts
      ↓ (更下层)
   memory.ts   ast.ts   lexer.ts
```

> ⚠️ `evalExpr` → `execCall` → `execBlock` → `evalExpr` 是**互相递回**的，所以它们在**同一个文件**（`core.ts`）。想再拆，得先把它们的共享状态收成一个 context 对象，别硬拆成三个档（会循环 import）。

### UI（`src/components/`、`src/App.tsx`）

| 文件 | 行数 | 职责 |
|---|---|---|
| `viz/tree.tsx` | 534 | 树 / BST / 堆 / 调用树 + 共用缩放视口（`useTreeViewport`） |
| `VariablesPanel.tsx` | 521 | 面板外壳：卡片网格、拖动排序、缩放、整行宽、auto-pack、面板宽度测量 |
| `viz/window.tsx` | 338 | 1D / 2D / struct 矩阵视窗 + 共用 `useWindowOffset` |
| `viz/containers.tsx` | 310 | string / stack / queue / deque / set / map / struct / pair 检视 |
| `viz/graph.tsx` | 199 | 邻接表 → 图（SVG）+ 表格切换 + 距离伴随数组 |
| `usePlayer.ts` | 187 | **播放器状态机**：collect/播放/单步/后退/跳步/断点/速度 + `invalidate()` |
| `viz/format.ts` | 155 | 纯显示函数：格式化、命中判断、型别标签（**无 React 依赖**） |
| `Topbar.tsx` | 153 | 顶部工具栏（执行控制、速度、设置菜单、步数、跳步） |
| `CodeEditor.tsx` | 155 | CodeMirror 封装：当前行高亮、断点 gutter、缩排 compartment |
| `panelLayout.ts` | 136 | **纯函数**：顺序/缩放/全宽、`isWide`/`treeAutoWideOf`/`twoColumnMinWidth`、localStorage 序列化 |
| `Splitter.tsx` | 100 | 分割线元件 + 左右/上下拖拽 hook |
| `ErrorBoundary.tsx` | 78 | 渲染期错误 → 「内部错误」卡片（防白屏）+ `CrashCard` |
| `editorSetup.ts` | 38 | 缩排设定（默认 4 格、Tab/Shift-Tab/Ctrl+] 快捷键） |
| `OutputPane.tsx` | 32 | 输出面板 + 纯函数 `outputView()` |
| `graphLimit.ts` | 19 | 图规模闸门（节点 ≤ 80、边 ≤ 800） |
| `App.tsx` | 257 | 主壳：版面、接缐、全局快捷键、**「⇔ 自动并排」** |
| `index.css` | 718 | 全部样式（含窄屏/窄面板的 `@media`、`@container` 与卡片网格） |
| `presets.ts` | 112 | 25 个课堂示例（cin 类自带 input） |

---

## 4. 执行模型（点一次「运行」发生了什么）

```
code (string)
  → lexer/parser            → Program（globals / body / functions / structs）
  → run(program, opts)      → Generator<Snapshot>
       每个语句、每个表达式求值前 yield 一份快照
  → usePlayer.collect()     → Snapshot[]（一次跑完，存成数组）
  → App / VariablesPanel    → 只负责画 snapshots[index]
```

**为什么一次跑完再回放**：这样「后退 / 跳步 / 断点」都只是改 index，不用重跑，也不会有副作用差异。代价是内存（已用写时复制压低）。

**Snapshot 里有什么**（`runtime.ts`）：

```ts
{ step, line, reads[], writes[], judges[], condition?, vars[], output,
  callTree, activeCallId?, error?, sortInfo?, done? }
```

**内存模型**（`memory.ts`）：`Cell` 是**递归不可变**的联合类型（scalar/array/vector/stack/queue/pqueue/tree/bst/set/map/umap/pair/deque/struct/ref）。写入 = 只复制改动路径、其余子树共享（写时复制），所以「大数组 × 200 步」不会把内存撑爆。`ref` 只用于参数别名/range-for 循环变量；`dumpAll` 会把它们解引用后再交给面板。

**错误处理约定**：`run()` **不抛运行时错误**，而是 yield 最后一份带 `error` 的快照（面板把它画红）；只有**解析期**错误才 `throw`（`usePlayer.collect()` 接住并显示行号）。

---

## 5. 必须遵守的约定（每条都附带「为什么」）

### 5.1 宁可报错，也不要静默给错答案 —— **第一原则**

这个工具是教学用的：**一个静默的错误答案比一句「不支持」伤害大得多**（学生会把错的当成对的）。历史上真的出现过三次，都被当成 bug 修掉了、并加了回归测试：

| 曾经的静默错误 | 现在 |
|---|---|
| 同名函数定义两次 → 后定义的默默覆盖（`f(3)` 印 1 而 C++ 是 30） | 解析期明确报错「不支援函数多载」 |
| `find(x, pos)` 忽略第二个参数（照旧从 0 找） | 支持第二参；越界/找不到回 -1 |
| 对 `set`/`stack`/`queue` 取下标 `s[0]` → `undefined.length` 崩溃（使用者看到 `Cannot read properties of undefined`） | 明确报错「不能对 set 取下标」 |

**动手前的自检**：这个改动会不会让某个程序「算出一个看起来合理、其实错」的结果？会 → 改成明确报错 + 测试。

### 5.2 语言子集的边界由 `test/compat-test.ts` 锁定

「支持 / 不支持」不是靠记忆，而是**可执行的清单**（约 70 条断言）。改解释器后先跑它。加新语法时：
1. 在 `compat-test.ts` 加 `yes(...)`（可用 + 期望输出）或 `no(...)`（必须报错）；
2. 再改实现。
`no(...)` 的存在同样重要：它保证「不支持的写法不会悄悄变成别的意思」。

### 5.3 新增一个语法功能，通常要动四个地方

1. `lexer.ts` / `parser.ts`：认得出语法 → AST 节点（`ast.ts` 加型别）；
2. `core.ts`（或 `builtins.ts`）：执行语义 + **读写标记**（`rt.mem.logRead/logWrite`）——面板要靠它着色；
3. `snapshot.ts`（必要时）：把新状态放进快照；
4. `test/`：语义测试 +（若是可见的视觉变化）`render-test` 断言。

> 顺手检查：错误讯息要是**中文、讲清楚怎么改**（例：`s.append('!')` 会提示改用 `push_back` 或 `+=`），不要只丢「未定义的函数」。

### 5.4 快照必须不可变

不要就地修改 `Cell`、不要改已在 `snapshots` 数组里的对象。所有写入都走 `Memory.updateAt / setScalar / setStringChar`（内部写时复制）。
原因：快照数组是「时间轴」，任何共享引用被就地改掉，所有历史步骤都会跟着变——这类 bug 极难发现。

### 5.5 布局：node 测不到的东西，要用「契约测试 + 真浏览器量」

- **纯函数优先**：能抽成纯函数的（`panelLayout`、`viz/format`、`editorSetup`、`graphLimit`、`OutputPane.outputView`）一律抽出来，用 node 断言；
- **契约测试**：对「接缐」类问题（元件有没有挂 ref、App 有没有把 props 傳下去、某个 class 有没有出现在两个分支）用**读原始码断言**（`test/*-test.ts` 里 `readFileSync('src/...')` 的写法）。这类测试很土，但抓过真实的 bug（v0.11.1 就是靠它锁住「两个 `.viz-body` 分支都要挂 `panelRef`」）；
- **要真的看版面**：用 headless Chrome + CDP 量 DOM（配方见 §6.4）。**不要只凭 build 通过就说「版面没问题」**。

### 5.6 测试文件规则

- `test/` 底下**每个 `.ts` 都会被 `npm test` 当成测试档**（`scripts/run-tests.mjs`）；
- 临时/诊断脚本请放 **`tmp/`（已 gitignore）** 或加 `_开头`（runner 会忽略并列出）；
- `test/_helpers.ts` 是共用样版（`check/eq/run1/out/err/report`）——**新测试优先用它**；
- 每个测试档结尾要能反映失败（`report(name)` 或 `process.exit(1)`），否则失败会被 runner 当成 PASS。

### 5.7 golden 测试：重构的安全网

`test/interp-golden-test.ts` 把 **31 个代表性程序的「每一帧 digest」整体杂凑**录进 `test/_golden/interp-golden.txt`。

- 它锁住的是**行为**，不是实现：拆档/改名/搬函数都不该让 digest 变；
- **刻意**改行为（新增语法、修 bug）时：`UPDATE_GOLDEN=1` 重录，并在 commit message 写清楚「为什么 digest 变了」；
- 单跑它：`node_modules\.bin\rolldown.cmd test/interp-golden-test.ts -o test/interp-golden-test.mjs -f esm -p node` 然后 `node test/interp-golden-test.mjs`（**一定要先重新打包**，见 §6.2）。

### 5.8 git / 发版纪律

1. 先 `git add -A` + `git commit`，**测试绿了才 commit**；
2. **先 commit、后 tag**；tag 之后必验 `git rev-list -n 1 <tag>` == `git rev-list -n 1 main`（这个坑踩过两次）；
3. PowerShell 傳 commit message **用双引号**（单引号会被 message 里的 `'` 打断，害 commit 没执行）；每一步检查 `$LASTEXITCODE`；
4. 发版流程：改 `package.json` 版本 → `npm run verify` 全绿 → commit（`chore(release): vX.Y.Z`）→ tag → push（**tag 也要 push**）→ 验证；
5. 一个 PR/提交尽量只做一件事；重构与行为变更分开（行为变更要能单独 revert）。

### 5.9 Windows 环境坑（这个项目长在 Windows 上）

| 坑 | 处理 |
|---|---|
| 档案是 **CRLF**（`core.autocrlf=true`） | 用脚本处理档案时 `split(/\r?\n/)`，写回用 `\n` |
| PowerShell 的 `Get-Content` / `>` 会造成**中文乱码**（UTF-16 或 ANSI 误解） | 生成/改写档案一律用 node（`readFileSync/writeFileSync`，UTF-8），不要用 `Add-Content` |
| Vite watcher 撞到被锁的档案 → **EBUSY 崩掉 dev server** | `vite.config.ts` 已忽略 `*.TMP`/`*~*`/`tmp/**`；**headless Chrome 的 `--user-data-dir` 一定要放 `%TEMP%`，不要放仓库里**（Cookies 会被锁） |
| 背景 job 的 shell 结束 ≠ Chrome 结束 | 用完主动杀：`Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*remote-debugging-port=9333*' } | Stop-Process -Force` |
| 单测直接 `node test/x.mjs` 看到旧结果 | 必须先重新打包（§6.2） |

### 5.10 文档纪律

- 每完成一个里程碑：更新 `docs/HANDOFF.md`（「最近更新」置顶）与 `docs/ARCHITECTURE.md`（若结构变了）；
- 卡住超过 3 次尝试的问题：写进 `docs/DEBUG.md`（现象/根因/试过什么/下一步），然后停下来汇报，**不要无限重试**；
- 这份 `AI-HANDOFF.md` 是「交接总纲」：**大改结构、加/删约定、清掉一批技术债之后，回来更新它**。

---

## 6. 验证手册（照着做就不会出错）

### 6.1 提交前的三道闸门

```bash
npm run verify     # typecheck（0 错误）+ 36 个测试 + build
```

想分开看：

```bash
npm run typecheck  # tsc --noEmit，必须是 0
npm test           # 每個 test/*.ts 逐档跑；结尾会印「通過 N / 跳過 M / 失敗 K」
npm run build      # vite build（只转译）
```

### 6.2 单跑一个测试（**必须重新打包**）

```bash
node_modules\.bin\rolldown.cmd test/panellayout-test.ts -o test/panellayout-test.mjs -f esm -p node
node test/panellayout-test.mjs
```

不重新打包就会执行旧的 `.mjs`——「明明改了却是旧结果」的经典原因。

### 6.3 golden 的两种用法

- **验证重构没改行为**：什么都不用做，`npm test` 会比对；
- **刻意改行为**：`UPDATE_GOLDEN=1` 跑一次 golden 测试重录，`git diff` 看 digest 变了哪些，确认符合预期再 commit。

> 但 golden 只覆盖 31 个程序。**新增语法/修 bug 一定要另外加针对性的语义测试**（`compat-test` / `gap-test` / 对应功能的 test）。

### 6.4 真浏览器验证：headless Chrome + CDP（不需要装 playwright）

用途：版面、拖拽、缩放、自动并排、快捷键……这些 node 测不到的东西。

```powershell
# 1) 起 dev server（背景 job）
npm run dev

# 2) 起 headless Chrome（profile 一定要放 %TEMP%，不要放仓库里）
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new `
  --remote-debugging-port=9333 --remote-allow-origins=* `
  --user-data-dir="$env:TEMP\cppviz-chrome" --no-first-run --window-size=1600,900 http://localhost:5173/
```

然后用 node（内建 `fetch` + `WebSocket`，**不用装任何依赖**）连上去：

```js
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)          // node 22+ 内建
// send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
// send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false })
// send('Page.captureScreenshot', { format: 'png' })          // 截圖
```

好用的技巧：
- 点按钮：`document.querySelector('.btn.primary').click()`；
- 选 preset：`.preset-select` 设 `value` + `dispatchEvent(new Event('change',{bubbles:true}))`；
- 设 React 受控 input：用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` 再 `dispatchEvent(new Event('input',{bubbles:true}))`（直接赋值可能被 React 忽略）；
- 量版面：`getBoundingClientRect()`、`getComputedStyle(main).gridTemplateColumns.split(/\s+/).length`（目前几栏）、`el.className`（有没有 `card-wide`）；
- **读 React state 是读不到的**——只能从 DOM 反推（class、座标、文字）。

> 本仓库的 `tmp/` 里可能还留着历史探针脚本（`tmp/cdp-probe*.mjs`、`tmp/capture-shots.mjs`），可以参考或重写（tmp/ 不提交）。

### 6.5 课堂场景手动验收清单（发布前建议过一遍）

1. 载入「归并排序」→ 运行 → 调用树出现、节点高亮跟着走、返回后变暗并显示返回值；
2. 右侧同时有调用树 + 数组 + 纯量：**宽屏幕卡片能并排**、窄了自动变单栏；
3. 按「⇔ 自动并排」：树类卡片不再占整行（若屏幕太窄会显示原因）；
4. 「Dijkstra 最短路」：图 + 带权边 + 节点上显示 dist；跳到后面看 priority_queue 树；
5. 断点：点行号左边，运行时会在该行停；
6. 改 cin 输入框 → 旧快照应失效（不会重播旧错误）；
7. 设置菜单：Tab 缩排 2/4、bool 1/0、if/while/for 条件开关；
8. 拖三条分割线（左右、代码/cin、cin/输出）都正常，不出现横向卷轴；
9. 故意写错（`s.append('!')`、`set<int> s; s[0]`、同名函数两次）→ 都要给**明确中文错误**；
10. 硬刷新（Ctrl+Shift+R）后一切正常（排除 HMR 残留）。

---

## 7. 版本历史（24 个 tag，全部已推送）

| tag | 主题 |
|---|---|
| v0.2.0 | 三项课堂安全修正 + do-while + 数组形参 + 自订比较函数 |
| v0.2.1 | 徽章文字统一为「参数（别名）」 |
| v0.2.2 | 课程 preset 补齐至 22 个 + 修正 preset 测试的跨项目路径 |
| v0.3.0 | range-based for（`for (auto x : c)` / `for (auto& x : c)`） |
| v0.4.0 | 字串 ↔ 数字内建（stoi/stol/stoll/stod/stof/to_string） |
| v0.5.0 | string/vector 常用方法 + 字元函数，并修 `find` 忽略第二参的静默错误 |
| v0.5.1 | 收紧字元参数（append/insert/replace/compare）+ substr 越界报错 |
| v0.5.2 | 修「cin 输入不足」的偶发 bug（改输入没让快照失效）+ 说清楚差几个值 |
| v0.6.0 | 容器可以当值传递（回传 / 赋值 / 按值传参），修掉三个缺口 |
| v0.6.1 | 容器当值不再显示「?」（递归摘要）+ 修 `vector<int>()` 崩溃 |
| v0.7.0 | 教学缺口清单**第一优先**（输入游标/转型/数学函数/greater/fixed/const&/字符算术/容器比较） |
| v0.8.0 | 教学缺口清单**第二优先**（#define / typedef / using / 三目 / sizeof+memset / fill / 区间写法） |
| v0.9.0 | 右侧卡片拖动排序 + 单卡缩放 + 整行宽（+ 持久化） |
| v0.9.1 | 黑屏防护（ErrorBoundary）+ localStorage 读取守卫 + 初始化列表尾逗号 |
| v0.9.2 | 修「卡片放大到 160% 不够宽」（图被裁掉 + 横向卷轴） |
| v0.9.3 | 复查提案第二/三优先 + 修「函式多载」的静默错答案 |
| v0.9.4 | 修「501×501 的 DP 表让画面卡死」（面板把二维表当图 → 40MB HTML） |
| v0.9.5 | 编辑器 Tab 缩排改 4 格（可切回 2）+ 整行加减缩排快捷键 |
| v0.9.6 | 让多个变量卡片并排（右侧不再一张卡片占一行） |
| v0.9.7 | 2D 视窗改回固定 5×5（靠写入自动跳转） |
| v0.9.8 | 递归树与 2D array 卡片也能并排（面板 ≥ 800px 时自动） |
| v0.10.0 | **解耦重构第一批**：VariablesPanel 1983 → 487 行，拆成 `viz/` 五模块 |
| v0.11.0 | **解耦重构第二批（S0–S9）**：interpreter 2930 → 113 行；`tsc` 31 → 0；新增 `npm run verify` |
| v0.11.1 | 修「数据结构树/递归树不能并排」（两个叠起来的 bug） |
| v0.11.2 | 右侧面板新增「⇔ 自动并排」按钮 |
| v0.12.0 | preset 自带 cin 输入（选中即填）；`long long` > 2^53 显示精度警告；与外部教学项目脱钩 |

---

## 8. 解耦重构（S0–S9）：为什么这样拆、踩过什么坑

背景：`interpreter.ts` 一度 2930 行、97 个函数，**每次加语言功能都要动它**。v0.10.0 先拆了 UI（VariablesPanel），v0.11.0 拆了解释器。

| 步骤 | 产物 | 关键点 |
|---|---|---|
| S0 `71bd588` | `interp-golden-test` + `_golden/interp-golden.txt` | **先有安全网再动手**：31 个程序 × 每帧 digest |
| S1 `bbe7817` | `runtime.ts`（118） | 型别/常量/控制流 signal |
| S2 `4149dd0` | `values.ts`（634） | 纯函数（值转换/比较/运算/格式化/容器比较/sizeof） |
| S3 `d4cccd7` | `input.ts`（53） | cin 游标模型 |
| S4 `44548bf` | `builtins.ts`（1044）+ `cells.ts`（77） | 最大一块；用 **`EvalCtx` 依赖注入** 破循环 |
| S5 `d9cb389` | `snapshot.ts`（159） | 快照/调用树工具（不求值，所以能独立） |
| S6 `c652c25` | `core.ts`（828） | 求值/语句/调用**同档**（三者互相递回）；interpreter → 113 行 |
| S7 `31e24eb` | `usePlayer` / `Topbar` / `Splitter` / `OutputPane` | App 493 → 206 行；新增 `appshell-test`（含整个 `<App/>` 的 SSR 渲染） |
| S8 `0cbbf8e` | 型别债清零 | `asIndexable`/`elemTypeOf` + `AssignExpr`/`UpdateExpr`；顺带修两个 undefined 崩溃 |
| S9 `c2a0c62` | `test/_helpers.ts` | 迁移 9 个样版完全一致的测试档 |

**踩过的坑（值得记住）**
- 这个仓库的档案是 **CRLF**：脚本切档要 `split(/\r?\n/)` 再以 LF 写回；
- 切档脚本把**注释**算进前一个函数 → 边界要用「往下找第一个 `}`」而不是「下一个 top-level 项目」；
- 注入参数（S4 的 `ctx`）要放在 `rt` **后面**，否则 tsc 一次喷 6 个 `Type 'Runtime' is missing`；
- 重建档头时漏了 `export type { Snapshot, CallNode, RunOptions }` → 下游 8 个隐式 any、tsc 多 12 个错；
- **验证要看 golden，不要只看 build**：build 通过不代表行为没变。

> 还没做完的：其余 28 个测试档各自的自订 harness 尚未统一（`eq` 至少三种语义、`err` 两种、`run1` 三种回传形状）。见 §9.4。

---

## 9. 已知不足（诚实清单）

### 9.1 语言子集：**永久排除**与**待做**

**永久排除**（教学取舍，不要「顺手补上」——会让工具变成半吊子 C++）：
位运算（`^ & | << >>` 与 `__builtin_*`）、指针、类/构造/析构/成员函数、运算符重载、模板、迭代器遍历（只识别 `sort(v.begin(),v.end())` 这几种固定搭配）、`printf`、完整 `<iomanip>`（只做 `fixed` + `setprecision`）。

**还没做、但教材可能用到（建议按需再加）**：
`switch`、lambda、默认参数、`for` 标头里的逗号表达式、函数式转型 `double(x)`、`string` 的比较子以外的迭代器用法。
（`switch` 与 lambda 在常见的算法教学材料里出现频率不高，但 `switch` 的缺失最容易在学生抄范例时卡住——如果要加，优先 `switch`。）

### 9.2 数值与规模

- `long long` 用 JS number 存，**精度约 2^53**，超过会静默失准（目前没有警告——这是已知的潜在「静默错误」缺口，值得加一个 >2^53 的警告）；
- 步数上限 `MAX_STEPS = 20000`，超过会给错误快照（不是静默截断）；
- 图 > 80 节点或 > 800 边不画（改表格 + 说明）；`stack/queue/deque/set/map` 只列前 300 项；
- 局部数组宣告后默认全 0（C++ 是未定义值）——**讲「未初始化」时要提醒学生**。

### 9.3 布局与 UI（这是 bug 最多的一类）

- 卡片的 `wide`/`zoom` 存在 localStorage，**会盖过自动并排**；现在有「⇔ 自动并排」按钮可以清掉，但用户仍可能困惑（文案已尽量讲清楚）；
- 树类卡片并排的阈值 `TREE_PACK_MIN = 800`（量的是 `.viz-body` 宽）；而网格两栏实际需要 `.viz-main` ≥ 732（宽螢幕）/ 610（≤1440px）。窄螢幕（例如 1280）即使把面板拉大，纯量栏也会吃掉宽度 → 需要「自动并排」按钮帮忙；
- 1920 宽的屏幕上，预设 55% 编辑器 → 面板 858、卡片区只剩 692 → **只能一栏**（不是 bug，是空间不够；拖动中缐或按自动并排）；
- 没有深色/浅色主题切换；没有导出图片/SVG；
- `index.css` 718 行未拆（有若干处刻意依赖「后面的规则覆盖前面的」，拆了容易踩顺序坑）。

### 9.4 工程质量

- **28 个测试档各自有自订 harness**（`eq` 三种语义、`err` 两种、`run1` 三种回传形状）→ S9 只迁移了 9 个样版一致的；
- **没有真正的 e2e 测试**：所有「浏览器行为」都是靠临时 CDP 探针人工验证（没有进 CI）；
- **CI 尚未在 GitHub 上实测**（`/.github/workflows/ci.yml` 已加，第一次 push 后请看 Actions 结果；本机 `npm run verify` 是全绿的）；
- `App.tsx` 仍有 257 行、没有元件级测试（只有 SSR 烟雾测试 `appshell-test`）；
- 仓库自 2026-10-19 起**自包含**：原先引用仓库外教学专案 preset 的跨项目测试已移除，`npm install && npm test` 在任何 clone 上结果一致。

### 9.5 教学 / 产品

- **preset 没有内建输入**：`cin` 的范例要手动填输入框（早期跨项目测试里有一份 `PRESET_INPUTS` 可参考，见 git 历史）——把 `input` 放进 preset 数据是很划算的下一步；
- 没有「.in 文件导入」、没有「导出执行过程」、没有分享链接；
- 解释器每次改代码都要**重跑全部帧**（毫秒级，但大程序 × 大数组会感觉到）；没有增量编译/缓存；
- 没有英文界面/英文文档（UI 是简体中文；文档以简体为主）。

---

## 10. 下一步建议（按优先级）

**P0（最划算、风险低）**
1. **preset 自带范例输入**：给 `PRESETS` 的每项加可选 `input`，载入 preset 时自动填 cin 框（记得让快照失效）。测试：`presets-test` + 新增断言。
2. **把 `long long` > 2^53 的静默失准改成警告**（或至少在教学文档里标注）。测试：`compat-test` 加一条。
3. **CI 实测一次**：push 后看 Actions；若失败，多半是 Windows/Linux 的路径或换行差异（golden 现在按 `\r?\n` 读取，跨平台一致）。

**P1（教材驱动，做之前先问清楚需求）**
4. `switch` 语句（最容易卡住学生抄范例）；
5. `for` 标头逗号表达式（`for (int i=0, j=n; i<j; i++, j--)`）；
6. 默认参数 / lambda（按需）。

**P2（体验）**
7. 深色/浅色主题切换（CSS 变量已经集中在 `:root`，工程量小）；
8. 导出当前画面 PNG/SVG（CDP 截图脚本可以直接改成浏览器内 `canvas` 导出）；
9. 统一测试 harness（把剩下 28 个档换成 `test/_helpers.ts`，风险低但要逐档对呼叫端）。

**P3（架构，非必要）**
10. 把「浏览器行为」的验收从临时 CDP 探针升级成进 CI 的 e2e（Playwright）；
11. `core.ts` 再拆（`execCall` / `sizeof` / 初始化列表）——**除非它又长到 1200+ 行，否则不建议**；
12. `index.css` 拆档（先建立视觉回归再拆，否则容易改坏覆盖顺序）。

---

## 11. 接手第一天 checklist

1. `npm install && npm run verify` —— 全绿再动任何代码（Windows 下也应该是全绿）。
2. 打开 `.trae`/`.cursor`/任何编辑器，按下 `npm run dev`，过一遍 §6.5 的 10 条手动验收。
3. 读 `docs/ARCHITECTURE.md` §4（重构计划）与这份文件的 §5、§9。
4. **动代码前先想清楚**：这是「行为变更」还是「纯重构」？
   - 纯重构 → golden 不该变；一个 commit 一步；
   - 行为变更 → 先加/改测试，再改实现，考虑要不要重录 golden。
5. **不要删 `docs/DEBUG.md` 里已解决的记录**：那些是「试过什么、为什么失败」的证据，能防止重复踩坑。
6. 每完成一件事就更新 `docs/HANDOFF.md`（状态永远在文件里，不在对话里）。
7. 卡住超过 3 次尝试 → 停手，写 `docs/DEBUG.md`，向使用者汇报（不要无限重试）。

---

## 12. 测试档索引（36 个，`npm test` 全跑）

| 类别 | 档案 | 覆盖 |
|---|---|---|
| 安全网 | `interp-golden-test` | 31 个程序的每帧 digest（重构必跑） |
| 语言兼容性 | `compat-test` | 可用/不可用矩阵（约 70 条） |
| 缺口/新功能 | `gap-test` | 教学缺口清单第一/二优先的每一项 |
| 渲染 | `render-test`, `render-limit-test`, `summary-test`, `aliasbadge-test`, `calllabel-test` | HTML 结构/规模上限/摘要文字/别名徽章/调用树标签 |
| 面板 | `panellayout-test`, `editor-setup-test`, `appshell-test`, `crash-test` | 布局纯函数/缩排/整个 App 的 SSR/ErrorBoundary |
| 解释器语义 | `cw-test`, `container-test`, `struct-test`, `struct-return-test`, `struct-container-test`, `arrayparam-test`, `rangefor-test`, `do-while-test`, `initlist-test`, `multivec-test`, `pair-test`, `setmap-test`, `stl-test`, `string-test`, `strfunc-test`, `stoi-test`, `sortcmp-test`, `cin-test`, `pushvar-test` | 各语言特性 |
| 端到端 | `presets-test`, `graph-test`, `dijkstra-test`, `dijkstra-pq-test` | 每个 preset 执行 + 渲染；图与最短路范例 |

---

## 13. 快速定位技巧（FAQ）

| 症状 | 先看哪里 |
|---|---|
| 某个写法「结果不对」 | `core.ts` 的 `evalExpr`；若是内建/方法 → `builtins.ts` |
| 「不支持」的讯息不好懂 | 搜 `RuntimeError(` 的对应文字；改文字后跑 `compat-test` |
| 面板画错/画空 | `VariablesPanel` 的 `CellNode` 分支 → 对应 `viz/*`；先用 `render-test` 复现 |
| 卡片不并排 | `panelLayout.isWide/treeAutoWideOf` + `VariablesPanel` 的 `cardView` 呼叫端 + localStorage `cpp-viz.panel-layout` |
| 执行很卡 | `render-limit-test` 的规模断言；图/长容器是否超限；快照是否意外丢掉结构共享 |
| 白屏 | `ErrorBoundary` 卡片会印出错误与堆栈；再看 `crash-test` |
| 改完测试还是旧的 | 没重新打包（§6.2） |

---

*这份文件由 v0.12.0 收尾时整理。若你（下一个 AI）做了结构性改动，请把它更新到最新，并保留「已知不足」的诚实度——那是它最有价值的部分。*
