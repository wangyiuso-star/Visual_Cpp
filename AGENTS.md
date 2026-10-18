# AGENTS.md — cpp-viz（C++ 逐步可视化执行器）

> 每个新会话自动读入的项目上下文。**详细状态见 [docs/AI-HANDOFF.md](docs/AI-HANDOFF.md)（交接总纲）**；逐版本变更见 [docs/HANDOFF.md](docs/HANDOFF.md)；卡住的 bug 见 [docs/DEBUG.md](docs/DEBUG.md)；语言子集规格见 [docs/LANGUAGE-SUBSET.md](docs/LANGUAGE-SUBSET.md)。

## 项目
面向 C++ 教学与自学的 **代码逐步可视化**工具：左边写代码 + cin 输入 + 输出，右边实时显示变量 / 数组 / vector / 栈 / 队列 / 堆 / 树 / BST / 图，逐步高亮当前行与读写格子，函数/递归以调用树显示。
形态 = **浏览器内迷你 C++ 解释器**（lexer → parser → 生成器式 stepper），不是编译器/调试器。

## 第一原则
**宁可给明确错误，也绝不静默给出错误答案。** 算不出来/不支持就报错并说清楚怎么改；新功能一律配「支持 + 不支持」两侧测试（`test/compat-test.ts`）。

## 技术栈
React 19 + Vite 8 + TypeScript + CodeMirror 6（@uiw/react-codemirror + @codemirror/lang-cpp + theme-one-dark）。无后端。

## 目录结构
- `src/interpreter/` — `lexer` → `parser` → `ast`；`core`（求值/语句/调用，三者互相递回必须同档）；`builtins`（全部内建与方法）；`memory`（递归不可变 Cell + 写时复制）；`values`/`cells`/`input`/`snapshot`/`runtime`；`interpreter.ts` **只有 `run()` + 公开型别转出**
- `src/components/` — `CodeEditor`、`VariablesPanel`（面板壳）、`viz/{window,containers,graph,tree,format}`、`usePlayer`（播放器状态机）、`Topbar`、`Splitter`、`OutputPane`、`ErrorBoundary`、`panelLayout`/`editorSetup`/`graphLimit`
- `src/App.tsx` — 主壳：版面 + 接线 + 全局快捷键 +「⇔ 自动并排」
- `src/index.css` — 全部样式（含窄屏/窄面板 `@media`、`@container`、卡片网格）
- `src/presets.ts` — 25 个课堂示例
- `test/` — 36 个测试档（`npm test`）；`test/_helpers.ts` 是共用样版（`_` 开头不会被当测试档）
- `docs/` — 文档（见上面链接）
- `scripts/run-tests.mjs` — 测试执行器（rolldown 打包 → node 逐档执行）

## 关键约定
- **构建/运行/验证**：
  - `npm run dev`（后台 job；改完 kill 旧 job 再重启，然后探 http://localhost:5173/ 期待 200）
  - `npm test`、`npm run typecheck`（必须 0 错误）、`npm run verify`（= typecheck + test + build，**提交前必跑**）
  - `npm run build` **只转译、不检查类型**——build 过 ≠ 类型对
  - **需要真的看版面/互动时**：headless Chrome + CDP 量 DOM（做法见 `docs/AI-HANDOFF.md` §6.4）。**`--user-data-dir` 一定放 `%TEMP%`，放 repo 里会让 Vite watcher EBUSY 崩掉 dev server**（`watch.ignored` 已加 `**/tmp/**`，但仍以放外面为准）；用完要主动杀 Chrome 进程。
- **沙箱政策会变**：2026-10 起本会话是 `danger-full-access` 且核准提示已停用 → **不要传 `sandbox_permissions`**（会被自动拒绝）。若哪天回到 workspace-write，Vite/rolldown/node/git 这类要 spawn 子程序的指令才需要加 `sandbox_permissions="danger-full-access"`。
- **编辑约定**：edit/write 前必须先 read（fs-observation 策略）。生成/改写档案一律用 node（`readFileSync/writeFileSync`，UTF-8），**不要用 PowerShell 的 `Add-Content`/`>`**（中文会变成乱码）；这个仓库的档案在磁盘上是 **CRLF**，脚本处理要 `split(/\r?\n/)` 再以 LF 写回。
- **诊断/临时脚本**：`test/` 底下**每个 .ts 都会被 `npm test` 当成测试档** → 放 `tmp/`（已 gitignore）或加 `_` 前缀（runner 会忽略并列出）。
- **单跑一个测试前必须重新打包**：`node_modules\.bin\rolldown.cmd test/x-test.ts -o test/x-test.mjs -f esm -p node` 再 `node test/x-test.mjs`，否则看的是旧 bundle。
- **golden 安全网**：`test/interp-golden-test.ts` 锁住 31 个程序的每帧 digest。纯重构 digest 不该变；**刻意**改行为时 `UPDATE_GOLDEN=1` 重录并在 commit 说明原因。
- **响应语言**：中文。
- **Git 发版纪律**：**先 commit、后 tag**；PowerShell 传 commit 讯息用**双引号**（单引号会被讯息里的 `'` 打断）；每个 git 步骤检查 `$LASTEXITCODE`；打完 tag 必验 `git rev-list -n 1 <tag>` == `git rev-list -n 1 main`；tag 也要 push。

## 已完成（简述）
- **语言**：int/long long/char/bool/string/double/float；数组(1D/2D)、vector(1D/2D/多维/邻接表)、stack、queue、deque、priority_queue、tree、bst、set、map、umap、pair、struct；声明/赋值/++--/for/range-for/while/do-while/if-else/break/continue/return/cout/cin；自订函数+递归+全局变量+引用/const&/数组形参；内建 sort/reverse/lower_bound/swap/数学/字符函数/stoi/to_string/memset/fill/区间写法/#define/typedef/sizeof/三目/fixed+setprecision
- **可视化**：当前行高亮、读写/判断着色、global/local 标签、递归树（返回变暗+返回值+缩放+调用栈模式+跟随）、数组窗口（1D 自适应 / 2D 固定 5×5 + 写入跳转）、图（带权/箭头/节点值）、堆/树/BST 树形图、struct 矩阵、别名徽章、排序比较次数
- **交互**：运行/暂停/单步/后退/跳步/速度、断点、cin 预填、卡片拖动排序+单卡缩放+整行宽+持久化、多卡自动并排 +「⇔ 自动并排」按钮、Tab 缩排 2/4、快捷键、ErrorBoundary 防白屏
- **工程**：解耦重构 S0–S9（interpreter 2930 → 113 行、App 493 → 257 行）、`tsc` 0 错误、36 个测试档 + `npm run verify`、CI workflow
- 逐版本历史见 `docs/HANDOFF.md`；架构与重构记录见 `docs/ARCHITECTURE.md`

## 下一步（优先级）
1. **P0（v0.12.0 已完成）**：~~preset 自带范例输入~~、~~`long long` > 2^53 改成警告~~；只剩「push 后确认 GitHub Actions 结果」
2. **P1（教材驱动，先问需求）**：`switch`（最容易卡学生）、`for` 逗号表达式、默认参数/lambda
3. **P2**：深色/浅色主题、导出画面 PNG、统一剩下 28 个测试档的 harness
4. **P3**：`core.ts` 再拆（非必要）、`index.css` 拆档（要先有视觉回归）

## 工作纪律（强制）
- 每完成一个里程碑：更新 `docs/HANDOFF.md`（状态永远在文件里，不在对话里）+ 必要时更新 `docs/ARCHITECTURE.md` 与 `docs/AI-HANDOFF.md`
- 同一问题最多尝试 3 次；第 3 次失败必须停止、写进 `docs/DEBUG.md` 后向使用者汇报，**绝不无限重试**
- 行为变更与纯重构分开提交；行为变更要能单独 revert
