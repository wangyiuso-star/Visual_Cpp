# 项目一页纸（简历 / 面试用）

> 这份文件是给「怎么把这个项目讲出去」用的：简历条目、面试故事、追问准备。
> 技术细节以 [AI-HANDOFF.md](./AI-HANDOFF.md) 和 [ARCHITECTURE.md](./ARCHITECTURE.md) 为准。

---

## 一句话

**中文**：用 TypeScript 从零写了一个浏览器内的 C++ 解释器与逐步可视化器——每条语句产出一份不可变快照，界面只是回放器，因此支持任意前进/后退/跳步与断点，无需编译器、调试器或后端。

**English**: A browser-based C++ interpreter and stepping visualiser built from scratch in TypeScript — one immutable snapshot per statement, with the UI as a pure player, which makes step-back, jump-to-step and breakpoints free. No compiler, no debugger, no backend.

---

## 简历条目（可直接改数字后用）

**中文（3 条，适合 2–3 行）**

- **cpp-viz**｜个人项目｜TypeScript / React 19 / Vite 8｜2026
  从零实现 C++ 子集解释器（lexer → parser → AST → 生成器式执行器），以「每语句一份不可变快照 + 界面回放」实现单步、**后退**、跳步与断点，纯前端部署（866 KB，gzip 271 KB）。
  设计递归不可变内存模型（写时复制），支撑大数组数千步回放；建立 golden 特性化测试（31 个程序逐帧摘要）作为重构安全网，把解释器核心从 2,930 行拆分到 113 行而语义零回归，`tsc` 类型错误 31 → 0。
  交付 37 个测试文件 / 2,573 行测试、26 个内置示例、界面简繁双语（香港慣用語，跟随浏览器语言），以及一份可离线双击运行的单文件版本。

**English (3 bullets)**

- **cpp-viz** — Personal project · TypeScript, React 19, Vite 8 · 2026
  Built a C++ subset interpreter from scratch (lexer → parser → AST → generator-based evaluator) and a replay-based visualiser: one immutable snapshot per statement makes step-back, jump-to-step and breakpoints free — no compiler, debugger or backend (866 KB bundle, 271 KB gzipped).
  Designed a persistent, copy-on-write memory model so thousands of steps over large arrays stay cheap; introduced golden characterisation tests (per-frame digests for 31 programs) as a refactoring safety net, splitting a 2,930-line interpreter core into 113 lines with zero behavioural change and clearing 31 → 0 type errors.
  Shipped 37 test files, 26 built-in examples, a Simplified/Traditional Chinese UI (HK terminology, auto-detected from the browser), and a single-file offline build.

---

## 面试可以讲的三个故事

### 1. 为什么不用 GDB / 编译器插桩

- **冲突**：教学要「可回放」——能后退、能停在任意一步反复讲、能指着某一格说这里被写了。真实进程的单步做不到（也不能前后翻）。
- **决策**：自己写解释器，把执行变成「快照序列」。
- **结果**：后退/跳步零成本；递归天然有调用树；完全离线。
- **可以反问面试官**：你会怎么在「真实语义」和「可回放性」之间取舍？（我的取舍是——宁可支持一个子集，但对不支持的写法一律明确报错，绝不静默给错答案。）

### 2. 怎么在大重构里保证不回归

- **手段**：先把「现在的行为」录成 golden——31 个代表性程序，每帧状态摘要成 hash。
- **用法**：纯重构 digest 必须一模一样；只有**刻意**改行为才允许重录，并在 commit 里写原因。
- **结果**：把 2,930 行的解释器拆成 10 个模块（核心只剩 113 行的 `run()`），同时把 31 个类型错误清到 0，测试全程绿。
- **加分点**：这套机制还抓到一个真实 bug——Windows 上 golden 被 checkout 成 CRLF，导致 31 个用例「看起来一样却判不等」，CI（Linux）一直绿。修的是测试的读取方式，不是改 golden。

### 3. 不可变内存模型与性能

- **问题**：每步一份完整快照，直接深拷贝会让内存与时间爆炸。
- **方案**：Cell 递归不可变，写入只复制从根到叶的那条路径，其余共享（写时复制）。
- **验证**：golden 测试里包含 501×501 的记忆化 DP（上万步），帧数与时间都可接受。
- **可延伸**：如果继续做，会在「容器层」加批量写合并，并把快照做成结构共享的持久化树。

---

## 数字速查（面试时别记错）

| 项 | 值 |
|---|---|
| 源码 | 31 个文件 / 约 8,000 行 TS |
| 测试 | 37 个文件 / 2,573 行（golden + SSR 渲染 + 布局 + 兼容矩阵） |
| 产物 | 866 KB JS（gzip 271 KB）+ 19 KB CSS |
| 单文件版 | 一个 HTML，865 KB，双击即用、可离线 |
| 内置示例 | 26 个 |
| 重构成果 | 解释器核心 2,930 → 113 行；类型错误 31 → 0；语义零回归 |

---

## 边界要说清楚（避免面试翻车）

- 不是编译器、不是调试器、不是判题系统；只实现 C++ 的教学子集（无指针/类/模板/位运算/`printf`）。
- 语义按「易解释」做了少量简化：局部数组默认全 0、`long long` 用 JS number 存（±2^53）。
- UI 目前只有简体中文；没有深浅色主题与分享链接。
- 设计原则：**宁可明确报错，也绝不静默给出错误答案**——这条在 [LANGUAGE-SUBSET.md](./LANGUAGE-SUBSET.md) 里有逐条清单。
