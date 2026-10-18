# OI 代码可视化（cpp-viz）

> 面向 OI / 算法教学的 **C++ 代码逐步可视化**工具：左边写 C++，右边实时画出变量、数组、容器、图、递归树，逐步高亮当前行与正在读写的格子，把「程序怎么跑」演给学生看。

浏览器内跑的**迷你 C++ 解释器**（lexer → parser → 生成器式 stepper），无后端、无编译、打开即用。

![归并排序：左侧代码与当前行高亮，右侧递归树、局部变量与数组](docs/screenshot-recursion.png)

![Dijkstra：邻接表画成图、节点上显示 dist、priority_queue 画成堆树](docs/screenshot-graph.png)

---

## 为什么是「解释器」而不是 GDB

教学要的是**可回放**：每一步的内存状态都要能前后翻、能停在断点、能指着某一格说「这里被写入了」。
GDB/编译器的单步做不到这一点（也没有 GUI 内存图），而自己写一个迷你解释器可以：

- 任意**前进/后退/跳步**，不会重跑程序；
- 每一步都知道**哪一格被读、被写、哪一行在判断**，可以直接着色；
- 递归天然有**调用树**可画；
- 完全离线、轻量，一个静态站点就能跑。

代价是只支持 C++ 的一个教学子集——**不支持的写法会明确报错**，不会静默给你一个错答案（见 [语言子集参考](docs/LANGUAGE-SUBSET.md)）。

---

## 功能一览

**执行与交互**
- 运行 / 暂停 / 单步 / 后退 / 跳到第 N 步 / 速度滑条
- 断点（点行号左侧）、键盘快捷键（空格 = 播放/暂停，←/→ = 单步，R = 重置）
- cin 输入预填（改输入会让旧快照失效）、22 个课堂示例、草稿自动保存

**右侧数据面板**
- 当前行高亮；读 = 蓝、写 = 绿、判断 = 橙
- 数组（1D 滑动窗口 / 2D 固定 5×5 + 写入自动跳转）、vector、stack、queue、deque、priority_queue（堆树）、tree、bst、set、map、struct、pair
- 邻接表自动识别成**图**（带权边、箭头、节点值覆盖）
- **递归树**：节点高亮、返回变暗并显示返回值、「调用栈」模式适合深递归、可缩放/全屏
- 卡片**拖动排序 / 单卡缩放 70%~160% / 整行宽**，选择记在 localStorage
- **多卡自动并排**；树类卡片在窄面板时占整行——按标题列右侧的 **⇔ 自动并排** 一键整理（清掉手动整行/放大，并把面板调宽到刚好两栏）
- 不会画爆：图 > 80 节点或 > 800 边改表格；长容器一次最多列 300 项

**教学细节**
- global / local 作用域标签；引用参数与数组形参标「参数（别名）」
- 排序时显示**比较次数**（可直接讲复杂度），自订比较函数违反严格弱序会警告
- 判读横幅：「判断 i ≤ mid ✓ 为真 · 继续」

---

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

Windows 也可以直接双击 `start.bat`（会自动检查 Node、首次自动安装依赖）。

上线：`npm run build`，把 `dist/` 丢到任意静态托管（Netlify / Vercel / GitHub Pages 都行）。
> GitHub Pages **项目子路径**（`https://<user>.github.io/Visual_Cpp/`）需要在 `vite.config.ts` 设 `base: '/Visual_Cpp/'`，否则资源会 404；用自定义域名或根路径则不用改。

---

## 怎么用（课堂流程）

1. 顶部「示例…」选一个范例（或直接粘代码）；
2. 需要输入的话，在左下「cin 输入」框预填（空格/换行分隔）；
3. 点 **▶ 运行**，用 **⏭ 单步 / ⏮ 后退 / 跳到** 讲解每一步；
4. 想看「为什么停在这里」→ 点行号左侧设断点；
5. 右侧卡片可以拖到顺手的顺序、放大某一棵树、按 ⤢ 让它占整行。

---

## 语言支持（摘要）

**型别**：`int` `long long` `char` `bool` `string` `double` `float` `size_t`
**容器**：数组(1D/2D/大小推断)、vector(1D/2D/多维/邻接表)、stack、queue、deque、priority_queue、tree、bst、set、map、unordered_map、pair、struct、容器存 struct
**语句**：声明、赋值、`++/--`、`for`、range-for、`while`、`do-while`、`if-else`、`break/continue`、`return`、`cout`、`cin`
**函数**：递归、全局变量、`int&`、`const T&`、数组形参（别名语义）、容器按值/返回
**内建**：`sort`(含自订 cmp/`greater<T>`)、`reverse`、`lower_bound`、`swap`、`min/max/abs`、`memset`/`fill`、`stoi`…`to_string`、数学函数、字元函数、`#define`/`typedef`/`using`、`sizeof`、三目 `?:`
**输入**：`cin >> x`、`while (cin >> x)` 读到 EOF、`getline`、`cin.ignore()`、`cin.get()`
**输出**：`fixed` + `setprecision(n)`、`double` 照 C++ 格式

**不做**：位运算、指针、类、运算符重载、模板、迭代器遍历、`printf`、函数重载、`switch`、lambda、默认参数。
完整清单（含「会明确报错」的每一种情况与教学陷阱）见 **[docs/LANGUAGE-SUBSET.md](docs/LANGUAGE-SUBSET.md)**。

---

## 技术栈与结构

React 19 + Vite 8 + TypeScript + CodeMirror 6。

```
src/interpreter/   lexer → parser → ast → core（生成器式执行引擎）
                   + memory（递归不可变 Cell + 写时复制）+ values/cells/input/builtins/snapshot
src/components/    CodeEditor、VariablesPanel（面板壳）+ viz/（window/containers/graph/tree/format）
                   usePlayer（播放器状态机）、Topbar、Splitter、OutputPane、ErrorBoundary
src/App.tsx        主壳：版面 + 接线 + 全局快捷键 +「⇔ 自动并排」
src/presets.ts     22 个课堂示例
test/              37 个测试文件（语义、渲染、布局、golden）
```

**执行模型**：`run(program)` 是生成器，每个语句/判断前 yield 一份 `Snapshot`（变量快照 + 读写标记 + 调用树 + 输出）；UI 只是回放 `snapshots[index]`。
**内存模型**：`Cell` 递归不可变，写入只复制改动路径（写时复制），大数组 × 多步不会爆内存。

细节见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**（模块地图、依赖方向、重构计划）。

---

## 测试与验证

```bash
npm test           # 37 个测试文件：解释器语义 + 渲染层 + 面板布局 + golden 特性化
npm run typecheck  # tsc --noEmit（应为 0 错误）
npm run verify     # typecheck + test + build（提交前必跑）
```

- `interp-golden-test`：31 个代表性程序的「每帧 digest 整体杂凑」——重构的安全网，行为一变就红；
- `compat-test` / `gap-test`：语言子集「可用 / 不可用」矩阵；
- `render-test` / `render-limit-test`：用 `react-dom/server` 把面板渲染成 HTML，逐个 preset 断言不崩、结构齐全、规模超限不卡死；
- `panellayout-test` / `appshell-test`：布局纯函数 + 整个 `<App/>` 的 SSR 烟雾测试。

---

## 已知限制（摘要）

1. **只支持教学子集**：位运算、指针、类、模板、迭代器、`printf`、`switch`、lambda、函数重载、默认参数都不做；不支持的写法会**明确报错**。
2. `long long` 用 JS number 存，**安全范围约 ±2^53**，超出会失真（目前没有警告）。
3. 步数上限 20000；图 > 80 节点不画（改表格）；长容器只列前 300 项。
4. 局部数组宣告后预设全 0（真实 C++ 是未定义值）。
5. 版面：树类卡片是否并排取决于面板宽度（≥ 800px）；窄屏幕请用「⇔ 自动并排」或拖宽右侧；卡片的「整行 / 放大」会记在浏览器里，可能盖过自动判断。
6. 没有深色/浅色主题切换、没有导出图片/分享链接、UI 只有简体中文。

其余（含工程债与下一步建议）见 **[docs/AI-HANDOFF.md](docs/AI-HANDOFF.md)** §9–§10。

---

## 文档

| 文件 | 内容 |
|---|---|
| [docs/LANGUAGE-SUBSET.md](docs/LANGUAGE-SUBSET.md) | 语言子集完整参考：支持 / 不支持 / 会明确报错的每一种情况 / 教学陷阱 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 模块地图、依赖方向、重构记录与计划 |
| [docs/AI-HANDOFF.md](docs/AI-HANDOFF.md) | **交接总纲**：现状、开发约定、验证手册、已知不足、下一步（给下一个维护者 / AI 助手） |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 开发日志（逐版本做了什么） |
| [docs/DEBUG.md](docs/DEBUG.md) | 疑难档案（已解决的问题：现象 / 根因 / 试过什么） |
| [AGENTS.md](AGENTS.md) | 给 AI 助手的项目上下文（自动读入）；也是「怎么参与这个项目」的速查 |

> 本项目在 AI 助手协作下开发：约定、验证流程、踩过的坑都写在上面这些文件里，方便任何人（或下一个 AI）接手。

---

## 授权

MIT License，见 [LICENSE](LICENSE)。教学示例代码可自由用于课堂。
