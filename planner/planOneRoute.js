// planner/planOneRoute.js
import { buildGraph } from "../core/graph.js";
import { astar, reconstruct as reconstructPath } from "../core/astar.js";
import { evaluateRoute } from "../core/metrics.js";
import { edgeCost } from "../core/costs.js";

// schnelle Haversine-Näherung (Meter)
function dApprox(a, b) {
    const dx = (b.lon - a.lon) * Math.cos((a.lat + b.lat) * Math.PI / 360);
    const dy = (b.lat - a.lat);
    return 111320 * Math.sqrt(dx*dx + dy*dy);
}
function nearestNode(nodes, p) {
    let best = null, bestD = Infinity;
    for (const n of nodes) {
        const d = dApprox(p, n);
        if (d < bestD) { best = n; bestD = d; }
    }
    return best;
}
function bearingDeg(a, b) {
    const φ1 = a.lat * Math.PI/180, φ2 = b.lat * Math.PI/180;
    const λ1 = a.lon * Math.PI/180, λ2 = b.lon * Math.PI/180;
    const y = Math.sin(λ2-λ1)*Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
    let θ = Math.atan2(y, x) * 180/Math.PI;
    if (θ < 0) θ += 360;
    return θ;
}
function angleDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

/**
 * Wählt EIN Ankerpaar (A,B) in einem Annulus um den Start:
 * - A: „best quality per meter“ Richtung
 * - B: maximaler Winkelabstand (~180°) zu A, ähnliche Entfernung
 */
function pickOneAnchorPair(graph, start, targetMeters, { sectors = 12, annulus = [0.40, 0.60], samplePerSector = 32, alpha = 0.35, weights }) {
    const nodes = graph.nodes;
    const minR = annulus[0] * targetMeters/2;
    const maxR = annulus[1] * targetMeters/2;

    // Sektoren vorbereiten
    const buckets = Array.from({ length: sectors }, () => []);
    for (const n of nodes) {
        const d = dApprox(start, n);
        if (d < minR || d > maxR) continue;
        const ang = bearingDeg(start, n);
        const s = Math.floor(ang / (360/sectors));
        buckets[s].push({ node: n, d, ang });
    }
    // pro Sektor auf samplePerSector begrenzen (zufällig)
    for (let i=0;i<sectors;i++) {
        if (buckets[i].length > samplePerSector) {
            buckets[i] = buckets[i].sort(() => Math.random()-0.5).slice(0, samplePerSector);
        }
    }

    // A-Kandidaten scorieren: ein A*-Lauf pro Kandidat lohnt sich nicht → cheap proxy
    // Proxy: mittlere Kantenqualität im Startraum (aus outgoing Edges) + Luftlinie
    // Noch schneller: nimm den weitesten im Sektor (max d) – robust genug.
    const aCandidates = [];
    for (let i=0;i<sectors;i++) {
        if (!buckets[i].length) continue;
        // nimm für Speed den EINEN weitesten im Sektor
        const best = buckets[i].reduce((acc, x) => x.d > acc.d ? x : acc, buckets[i][0]);
        aCandidates.push(best);
    }
    if (!aCandidates.length) return null;

    // Wähle A = Kandidat, dessen Richtung am besten "räumlich verteilt" ist: nimm einfach den mit größter Distanz
    const A = aCandidates.reduce((acc, x) => x.d > acc.d ? x : acc, aCandidates[0]);

    // B = Gegenrichtung (~180°), ähnliche Distanz
    const targetAngle = (A.ang + 180) % 360;
    let B = null, bestScore = Infinity;
    for (const cand of aCandidates) {
        const da = angleDiff(cand.ang, targetAngle);
        const dd = Math.abs(cand.d - A.d);
        const score = da * 2 + dd * 0.01; // Winkel wichtiger als Distanz
        if (score < bestScore && cand.node.id !== A.node.id) {
            bestScore = score; B = cand;
        }
    }
    if (!B) return null;
    return { A: A.node, B: B.node };
}

/**
 * Rechnet genau EINE Route.
 * - routeType "loop": 3x A*
 * - routeType "out_and_back": 2x A*
 */
export async function planOneRouteFromOverpassData(overpassJson, inputs) {
    const {
        lat, lon,
        targetDistanceKm = 5,
        routeType = "loop", // "loop" oder "out_and_back"
        prefs = { green:0.45, water:0.25, cafes:0.10, slope:0.20, quiet:0.30, surface:0.15 },
        tolerances = { distPct:0.10, loopClosureM:30, overlapPct:0.15, turnsPerKmMax:6 },
        alpha = 0.35,
    } = inputs;

    const graph = buildGraph(overpassJson);
    if (!graph.nodes.length || !graph.edges.length) {
        return { route: null, debug: { reason: "empty-graph" } };
    }

    const start = nearestNode(graph.nodes, { lat, lon });
    if (!start) return { route: null, debug: { reason: "no-start" } };

    const targetMeters = targetDistanceKm * 1000;
    const constraints = {
        minDist: targetMeters * (1 - (tolerances.distPct ?? 0.10)),
        maxDist: targetMeters * (1 + (tolerances.distPct ?? 0.10)),
        loopClosureM: tolerances.loopClosureM ?? 30,
        maxOverlap: tolerances.overlapPct ?? 0.15,
        turnsPerKmMax: tolerances.turnsPerKmMax ?? 6,
    };

    // --- EIN Ankerpaar wählen ---
    let A=null, B=null;
    if (routeType === "loop") {
        const picked = pickOneAnchorPair(graph, start, targetMeters, { weights: prefs, alpha });
        if (!picked) return { route: null, debug: { reason: "no-anchors" } };
        A = picked.A; B = picked.B;
    }

    // Wiederverwendungs-Penalty: Kanten, die schon genutzt wurden, verteuern
    const used = new Set();
    const penalty = (e) => used.has(e.id) ? 0.5 * edgeCost(e, prefs, alpha) : 0;

    // ---- Routing ----
    if (routeType === "loop") {
        // Start -> A
        const p1 = astar(graph, start.id, A.id, prefs, alpha, () => 0);
        const e1 = reconstructPath(p1.came, start.id, A.id);
        if (!e1) return { route: null, debug: { reason: "no-path-start-A" } };
        e1.forEach(e => used.add(e.id));

        // A -> B
        const p2 = astar(graph, A.id, B.id, prefs, alpha, penalty);
        const e2 = reconstructPath(p2.came, A.id, B.id);
        if (!e2) return { route: null, debug: { reason: "no-path-A-B" } };
        e2.forEach(e => used.add(e.id));

        // B -> Start
        const p3 = astar(graph, B.id, start.id, prefs, alpha, penalty);
        const e3 = reconstructPath(p3.came, B.id, start.id);
        if (!e3) return { route: null, debug: { reason: "no-path-B-start" } };

        const edges = [...e1, ...e2, ...e3];
        const evald = evaluateRoute(edges, prefs, constraints);
        if (!evald.ok) return { route: null, debug: { reason: "fails-constraints", metrics: evald.metrics } };
        return { route: evald, debug: { start: start.id, A: A.id, B: B.id } };
    }

    // ---- Out-and-Back (schnellste Option: nur 2 Läufe) ----
    // wähle EINEN Anker in Annulus Richtung „best guess“
    const picked = pickOneAnchorPair(graph, start, targetMeters, { sectors: 12, annulus: [0.45, 0.65], alpha, weights: prefs });
    const anchor = picked ? picked.A : null;
    if (!anchor) return { route: null, debug: { reason: "no-anchor-outback" } };

    const out1 = astar(graph, start.id, anchor.id, prefs, alpha, () => 0);
    const eOut = reconstructPath(out1.came, start.id, anchor.id);
    if (!eOut) return { route: null, debug: { reason: "no-path-out" } };
    eOut.forEach(e => used.add(e.id));

    const back1 = astar(graph, anchor.id, start.id, prefs, alpha, (e)=> used.has(e.id) ? 0.8 * edgeCost(e, prefs, alpha) : 0);
    const eBack = reconstructPath(back1.came, anchor.id, start.id);
    if (!eBack) return { route: null, debug: { reason: "no-path-back" } };

    const edges = [...eOut, ...eBack];
    const evald = evaluateRoute(edges, prefs, constraints);
    if (!evald.ok) return { route: null, debug: { reason: "fails-constraints", metrics: evald.metrics } };
    return { route: evald, debug: { start: start.id, anchor: anchor.id } };
}
