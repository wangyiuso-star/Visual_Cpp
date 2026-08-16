# 项目回顾与规划

> OI 代码可视化（cpp-viz）—— 面向 OI / 算法教学的 C++ 逐步可视化工具
> 形态：浏览器内迷你 C++ 解释器（非编译器/调试器方案）

## 一、当前已实现

### 语言支持（C++ 子集）
- 类型：int / long long / char / bool / string / double / float
- 容器：数组（一维/二维/大小推断）、vector（一维/二维/邻接表/多维填充）、stack、queue、deque、priority_queue（大根堆 + greater 小根堆）、tree、bst、set、map、unordered_map、pair、struct、容器存 struct
- 语句：变量声明、赋值（= += -= *= /= %=）、++/--、for、while、if/else、break/continue、return、cout、cin
- 函数：自定义函数、递归、全局变量、引用参数 int&、容器按值参数、struct 参数/返回值
- 内建：min / max / abs / make_pair / sort / reverse / lower_bound / swap
- 表达式：花括号初始化列表（v.push_back({1,2,3})）
- 尚未：指针 / 类成员函数 / 构造 / 运算符重载 / 函数重载 / 模板 / 迭代器遍历

### 可视化能力
- 左：代码编辑器（CodeMirror，当前行黄底高亮）
- 右：变量/容器可视化 —— 数组/二维（5×5 滑动窗口 + 自动跳转）、栈竖排、队列横排、堆/树/BST 树形图
- 递归树/调用树：节点高亮、返回后变暗 + return 值、节点内显示非参数局部变量、固定高度滚动
- 循环/if「判断」：条件原文 + 真假回馈，可分别开关 if/while/for（运行前生效，减少快照）
- global / local 作用域标签
- 步进：运行/暂停、单步、后退、跳转指定步、速度档
- 布局：编辑器↔数据窗可拖拽分隔条、递归树/容器可折叠展开

## 二、架构

- src/interpreter/ — lexer → parser → interpreter（生成器式逐步执行）+ memory（递归 Cell 模型）
- src/components/ — CodeEditor、VariablesPanel（各类视图组件）
- src/App.tsx — 主壳
- 快照模型：每一步 yield 一份「变量快照 + 读写/判断 + 调用树 + 输出」

## 三、已知限制

1. 仅 C++ 子集：无指针、类成员函数 / 构造 / 析构、运算符重载、函数重载、模板、迭代器遍历（for (auto x : v)）等
2. long long 用 JS number 存储，精度约 2^53
3. 步数上限 20000（防死循环 / 递归过深）
4. 递归树根节点（main）若无显式 return 不标记 returned
5. 函数参数默认按值传；引用需显式 &

## 四、建议 / 修改（均已实现 ✅）

快照增量存储、断点、预设示例、localStorage 草稿、cin 输入、bool 1/0 开关、键盘快捷键、速度滑条、错误信息（行号+中文）。深色/浅色主题切换未做。

## 五、未来方向（可选，已非核心）

1. 右侧卡片自由拖拽 + 缩放（画布化）
2. 导出 SVG / 图片
3. 深色 / 浅色主题切换
4. 冒烟测试接入 CI
5. 文件输入（.in 文件导入）

## 六、关键技术决策备忘

- 选「浏览器内迷你解释器」而非 GDB/调试器（Python Tutor 式）：个人项目轻量、可逐步、可控，代价是只支持子集
- 技术栈：React + Vite + TypeScript + CodeMirror
- 生成器式逐步执行：每个语句 yield 快照，支持任意前进/后退/跳转
- 调用树节点返回值存「字符串」（显示层），与运行时类型解耦 → 为 struct 返回值预留
- 函数返回类型在 AST 存通用 Type（非写死标量）→ 为 struct 预留
- 内存模型用递归 Cell（scalar/array/vector/stack/queue/pqueue/tree/bst），联合类型天然可扩展

## 七、如何运行 / 验证

- npm install && npm run dev → http://localhost:5173
- npm run build → 生产构建
- test/run.ts 为解释器冒烟测试（用 rolldown 打包后 node 运行）
