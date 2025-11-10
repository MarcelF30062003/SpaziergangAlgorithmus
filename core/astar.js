// core/astar.js
import { edgeCost } from "./costs.js";
import { MinHeap } from "./pq.js";

// Koordinaten-Lookup für Heuristik:
function makeNodeLookup(nodes) {
    const m = new Map(); for (const n of nodes) m.set(n.id, n); return m;
}
function haversineApprox(a, b) {
    const dx = (b.lon - a.lon) * Math.cos((a.lat + b.lat) * Math.PI / 360);
    const dy = (b.lat - a.lat);
    return 111320 * Math.sqrt(dx*dx + dy*dy);
}

export function astar(graph, startId, goalId, weights, alpha = 0.35, reusePenalty = () => 0) {
    const { nodes, adj } = graph;
    const N = makeNodeLookup(nodes);

    const g = new Map(); // cost so far
    const came = new Map();
    const open = new MinHeap();

    for (const n of nodes) g.set(n.id, Infinity);
    g.set(startId, 0);

    const start = N.get(startId), goal = N.get(goalId);

    open.push(0, startId);

    const closed = new Set();

    while (open.size) {
        const { val: u } = open.pop();
        if (u === goalId) break;
        if (closed.has(u)) continue;
        closed.add(u);

        const outs = adj.get(u) || [];
        for (const e of outs) {
            const step = edgeCost(e, weights, alpha) + reusePenalty(e);
            const tentative = g.get(u) + step;
            if (tentative < g.get(e.v)) {
                g.set(e.v, tentative);
                came.set(e.v, { via: u, edge: e });
                const hu = haversineApprox(N.get(e.v), goal); // admissible heuristic
                open.push(tentative + hu, e.v);
            }
        }
    }
    return { came, target: goalId };
}

export function reconstruct(came, startId, endId) {
    const edges = [];
    let cur = endId;
    while (cur !== startId) {
        const step = came.get(cur);
        if (!step) return null;
        edges.push(step.edge);
        cur = step.via;
    }
    edges.reverse();
    return edges;
}
