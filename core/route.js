// core/route.js
import { dijkstra, reconstructPath } from "./dijkstra.js";
import { edgeCost } from "./costs.js";

export function buildLoopCandidate(graph, startId, AId, BId, weights, alpha = 0.35, beta = 0.5) {
  const usedEdgeIds = new Set();
  const penalty = (e) => usedEdgeIds.has(e.id) ? beta * edgeCost(e, weights, alpha) : 0;

  const isA = (id) => id === AId;
  const p1 = dijkstra(graph, startId, isA, weights, alpha, () => 0);
  const path1 = reconstructPath(p1.prev, startId, p1.target);
  if (!path1) return null;
  path1.forEach(e => usedEdgeIds.add(e.id));

  const isB = (id) => id === BId;
  const p2 = dijkstra(graph, AId, isB, weights, alpha, penalty);
  const path2 = reconstructPath(p2.prev, AId, p2.target);
  if (!path2) return null;
  path2.forEach(e => usedEdgeIds.add(e.id));

  const isStart = (id) => id === startId;
  const p3 = dijkstra(graph, BId, isStart, weights, alpha, penalty);
  const path3 = reconstructPath(p3.prev, BId, p3.target);
  if (!path3) return null;

  const edges = [...path1, ...path2, ...path3];
  return edges;
}
