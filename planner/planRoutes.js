// planner/planRoutes.js
import { buildGraph } from "../core/graph.js";
import { pickAnchors } from "../core/anchors.js";
import { buildLoopCandidate } from "../core/route.js";
import { evaluateRoute } from "../core/metrics.js";
import { diversify } from "../core/diversify.js";

export async function planRoutesFromOverpassData(overpassJson, inputs) {
  const {
    lat, lon,
    targetDistanceKm = 5,
    routeType = "loop",
    prefs = { green:0.45, water:0.25, cafes:0.10, slope:0.20, quiet:0.30, surface:0.15 },
    tolerances = { distPct:0.10, loopClosureM:30, overlapPct:0.15, turnsPerKmMax:6 },
    alpha = 0.35,
  } = inputs;

  const targetMeters = targetDistanceKm * 1000;
  const constraints = {
    minDist: targetMeters * (1 - (tolerances.distPct ?? 0.10)),
    maxDist: targetMeters * (1 + (tolerances.distPct ?? 0.10)),
    loopClosureM: tolerances.loopClosureM ?? 30,
    maxOverlap: tolerances.overlapPct ?? 0.15,
    turnsPerKmMax: tolerances.turnsPerKmMax ?? 6,
  };

  const graph = buildGraph(overpassJson);
  if (!graph.nodes.length || !graph.edges.length) {
    return { routes: [], debug: { reason: "empty-graph" } };
  }

  // Snap: nächster Knoten zum Start
  const start = nearestNode(graph.nodes, { lat, lon });
  if (!start) return { routes: [], debug: { reason: "no-start" } };

  // Anker wählen
    const anchors = pickAnchors(graph, start, targetMeters, { sectors: 12, annulus: [0.40, 0.60] });
  if (!anchors.length) return { routes: [], debug: { reason: "no-anchors" } };

  // Kandidaten aufbauen (nur Loop hier)
  const candidates = [];
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i+1; j < anchors.length; j++) {
        // frühe Limitierung, maximal ~40 Paare
        if ((j - i) > 6) break;
      const A = anchors[i], B = anchors[j];
      const edges = buildLoopCandidate(graph, start.id, A.id, B.id, prefs, alpha, 0.5);
      if (!edges) continue;

      // Grober Loop-Schluss-Check (Start≈Ende)
      const endNodeId = edges[edges.length-1].v;
      const endNode = graph.nodes.find(n => n.id === endNodeId);
      const close = haversineApprox({lat,lon}, endNode);
      if (close > constraints.loopClosureM) continue;

      // (Feinschliff light könnte hier eingefügt werden)

      const evald = evaluateRoute(edges, prefs, constraints);
      if (evald.ok) candidates.push(evald);
    }
  }

  const top = diversify(candidates, 3, 0.6);
  return {
    routes: top,
    debug: {
      startNodeId: start.id,
      candidateCount: candidates.length,
      anchorCount: anchors.length,
    }
  };
}

function haversineApprox(a, b) {
  const dx = (b.lon - a.lon) * Math.cos((a.lat+b.lat)*Math.PI/360);
  const dy = (b.lat - a.lat);
  return 111320 * Math.sqrt(dx*dx + dy*dy);
}

function nearestNode(nodes, p) {
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    const d = haversineApprox(p, n);
    if (d < bestD) { best = n; bestD = d; }
  }
  return best;
}
