# OI 代码可视化（cpp-viz）

面向 OI / 算法教学的 **C++ 代码逐步可视化**工具。在浏览器里写 C++，点「运行 / 单步」，右侧实时显示变量、数组、容器、图、递归树等数据结构，并高亮当前行与正在读写的格子，把程序执行过程「演」给学生看。

形态 = 浏览器内迷你 C++ 解释器（lexer → parser → 生成器式逐步执行），非编译器 / 调试器方案，因此轻量、可控、可逐行演示。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 ，顶部「预设」下拉选一个示例，点「运行」即可。支持输入用顶部「cin 输入」文本框预填。

## 语言支持（C++ 子集）

**标量类型**：`int` / `long long` / `char` / `bool` / `string` / `double` / `float`

**容器**：
- 数组：一维 `int a[N]`、二维 `int a[N][M]`、大小推断 `int a[] = {1,2,3}`
- vector：一维 / 二维 / 邻接表 `vector<int> g[N]` / 多维 `vector<vector<int>> g(n, vector<int>(m))`
- `stack` / `queue` / `deque`
- `priority_queue`（大根堆 + `greater<T>` 小根堆）
- `tree`（数组式完全二叉树，1 基下标）、`bst`（二叉搜索树）
- `set`（排序去重）、`map` / `unordered_map`（键值对，支持 `m[k]` 读写）
- `pair`（`make_pair`、`.first` / `.second`）
- `struct`（定义、成员读写、初始化、作参数、作返回值）
- 容器存结构体：`array` / `tree` / `vector` 里放 struct

**语句**：声明、赋值（`= += -= *= /= %=`）、`++` / `--`、`for` / `while` / `if-else` / `break` / `continue` / `return` / `cout` / `cin`

**函数**：自定义函数、递归、全局变量、引用参数 `int&`、容器按值参数、结构体参数 / 返回值

**内建**：`min` / `max` / `abs` / `make_pair` / `sort` / `reverse` / `lower_bound` / `swap`

**表达式**：花括号初始化列表（如 `v.push_back({1,2,3})`）

## 可视化（右侧面板）

- **当前行高亮** + 读写/判断着色（读=蓝、写=绿、判断=橙）
- **作用域标签**：global / local
- **容器视图**：数组窗口（1D/2D，固定窗口 + 滑动条 + 访问自动跳转）、栈竖排、队列/deque 横排、堆/树/BST 树形图、set 列表、map 键值对、struct 成员列表、struct 矩阵（行=元素下标、列=成员名）
- **递归树 / 调用树**：节点高亮，返回后变暗 + 显示返回值
- **图**：邻接表识别为图（节点+连线）、带权边显示权重、有向图自动画箭头、节点值覆盖（圆圈里显示 dist 值、上方显示下标）
- **布局**：右侧按「形状」分格（方形大块并排在上、横长条在下），每张卡片可用 ↑/↓ 调顺序

## 交互

- 运行 / 暂停 / 单步 / 后退 / 跳转指定步 / 速度滑条
- 断点（点行号左侧设置，运行到断点自动停）
- cin 输入预填
- 预设示例一键载入
- localStorage 自动保存草稿
- 键盘快捷键（空格=播放/暂停，←/→=单步，R=重置）
- bool 显示 1/0 开关
- if / while / for 条件判断显示开关
- 可拖拽垂直分割（代码区 ↔ 数据区）

## 预设示例

fib 递归、阶乘递归、二分查找、二叉搜索树、全排列 dfs、归并排序、set/map 容器、图的 DFS、带权图（有向）、Dijkstra 最短路。

## 目录结构

- `src/interpreter/` — 迷你 C++ 解释器：lexer → parser → ast → interpreter（生成器式逐步执行）+ memory（递归 Cell 模型 + 写时复制结构共享）
- `src/components/` — CodeEditor（CodeMirror + 当前行高亮 + 断点 gutter）、VariablesPanel（各类数据结构可视化）
- `src/App.tsx` — 主壳（布局、步进控制、快捷键、预设、localStorage）
- `src/index.css` — 样式
- `src/presets.ts` — 预设示例
- `test/` — 解释器冒烟测试

## 架构要点

- **快照模型**：每执行一步 yield 一份「变量快照 + 读写/判断格子 + 调用树 + 输出」。
- **写时复制（结构共享）**：cell 不可变，只复制改动路径、共享未改子树，`dumpAll` / `cloneCallTree` 引用共享——大数组 × 多步时内存不再爆炸。

## 已知限制

- 仅 C++ 子集：无指针、类成员函数 / 构造 / 析构、运算符重载、函数重载、模板、迭代器遍历（`for (auto x : v)`）等
- `long long` 用 JS number 存储，精度约 2^53
- 步数上限 20000（防死循环 / 递归过深）
- 递归树根节点（main）若无显式 `return` 不标记 returned
- 函数参数默认按值传；引用需显式 `&`

## 测试

```bash
# 解释器冒烟测试（用 rolldown 打包后 node 运行）
node_modules\.bin\rolldown.cmd test/cw-test.ts -o test/cw-test.mjs -f esm -p node
node test/cw-test.mjs
```
