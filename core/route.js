// core/route.js
import { astar, reconstruct as reconstructPath } from "./astar.js";
import { edgeCost } from "./costs.js";

export function buildLoopCandidate(graph, startId, AId, BId, weights, alpha = 0.35, beta = 0.5) {
  const usedEdgeIds = new Set();
  const penalty = (e) => usedEdgeIds.has(e.id) ? beta * edgeCost(e, weights, alpha) : 0;

  const isA = (id) => id === AId;
  const p1 = astar(graph, startId, AId, weights, alpha, () => 0);
  const path1 = reconstructPath(p1.came, startId, AId);
  if (!path1) return null;
  path1.forEach(e => usedEdgeIds.add(e.id));

  const isB = (id) => id === BId;
  const p2 = astar(graph, AId, BId, weights, alpha, penalty);
  const path2 = reconstructPath(p2.came, AId, BId);
  if (!path2) return null;
  path2.forEach(e => usedEdgeIds.add(e.id));

  const isStart = (id) => id === startId;
  const p3 = astar(graph, BId, startId, weights, alpha, penalty);
  const path3 = reconstructPath(p3.came, BId, startId);
  if (!path3) return null;

  const edges = [...path1, ...path2, ...path3];
  return edges;
}
