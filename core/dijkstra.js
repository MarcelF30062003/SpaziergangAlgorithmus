// core/dijkstra.js
import { edgeCost } from "./costs.js";

export function dijkstra({ nodes, adj }, startId, isTarget, weights, alpha = 0.35, reusePenalty = () => 0) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();

  for (const n of nodes) dist.set(n.id, Infinity);
  dist.set(startId, 0);

  // simple binary-heap-less priority queue (ok für kleine Graphen)
  function pullMin() {
    let best = null, bestVal = Infinity;
    for (const [id, d] of dist) if (!visited.has(id) && d < bestVal) { best = id; bestVal = d; }
    return best;
  }

  while (true) {
    const u = pullMin();
    if (u == null) break;
    visited.add(u);

    if (isTarget(u)) {
      return { dist, prev, target: u };
    }

    const outs = adj.get(u) || [];
    for (const e of outs) {
      const cost = edgeCost(e, weights, alpha) + reusePenalty(e);
      const alt = dist.get(u) + cost;
      if (alt < dist.get(e.v)) {
        dist.set(e.v, alt);
        prev.set(e.v, { via: u, edge: e });
      }
    }
  }
  return { dist, prev, target: null };
}

export function reconstructPath(prev, startId, endId) {
  const edges = [];
  let cur = endId;
  while (cur !== startId) {
    const step = prev.get(cur);
    if (!step) return null;
    edges.push(step.edge);
    cur = step.via;
  }
  edges.reverse();
  return edges;
}
