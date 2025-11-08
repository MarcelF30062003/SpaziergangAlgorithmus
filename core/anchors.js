// core/anchors.js
import { bearing } from "./geo.js";

export function sectorOfAngle(angleDeg, sectors = 24) {
  const sz = 360 / sectors;
  return Math.floor(((angleDeg % 360) + 360) % 360 / sz);
}

export function pickAnchors(graph, startNode, targetDistMeters, { sectors = 24, annulus = [0.35, 0.65] } = {}) {
  // Kandidatenknoten im Distanzfenster (Luftlinie) und je Sektor den „weitesten“ nehmen
  const minR = annulus[0] * targetDistMeters/2;
  const maxR = annulus[1] * targetDistMeters/2;

  const best = new Map(); // sector -> {node, dist, angle}
  for (const n of graph.nodes) {
    const d = haversineFast(startNode, n);
    if (d < minR || d > maxR) continue;
    const ang = bearing(startNode, n);
    const s = sectorOfAngle(ang, sectors);
    const cur = best.get(s);
    if (!cur || d > cur.dist) best.set(s, { node: n, dist: d, angle: ang });
  }
  return Array.from(best.values()).map(v => v.node);
}

// schnelle Haversine-Näherung (ausreichend für Filter)
function haversineFast(a, b) {
  const dx = (b.lon - a.lon) * Math.cos((a.lat+b.lat)*Math.PI/360);
  const dy = (b.lat - a.lat);
  return 111320 * Math.sqrt(dx*dx + dy*dy);
}
