// 画图前的规模上限。
// 图是「节点 + 边」的 SVG：使用者把 `vector<vector<int>> memo(501, vector<int>(501, -1))`
// （DP 表）交进来时，它会走「邻接表 → 图」这条路 —— 501 个节点、每行 501 个邻居 = 251k 条边，
// 于是卡片要渲染 251k 个 <line>：实测 40MB 的 HTML、node 端渲染一次就要 3~4 秒，浏览器直接卡死。
// 所以规模超过上限就不画图，改显示表格视窗并说明原因。
export const GRAPH_MAX_NODES = 80
export const GRAPH_MAX_EDGES = 800

// 回传 null 代表可以画；否则回传「为什么不画」的一句话。
export function graphTooBigReason(nodes: number, edges: number): string | null {
  if (nodes > GRAPH_MAX_NODES) {
    return nodes + ' 个节点（上限 ' + GRAPH_MAX_NODES + '）—— 这比较像二维表格，画成图也看不清楚'
  }
  if (edges > GRAPH_MAX_EDGES) {
    return edges + ' 条边（上限 ' + GRAPH_MAX_EDGES + '）—— 画出来会让浏览器卡死'
  }
  return null
}
