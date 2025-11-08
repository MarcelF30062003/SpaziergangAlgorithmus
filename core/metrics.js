// core/metrics.js
import { haversine, clamp01 } from "./geo.js";
import { edgeQuality } from "./costs.js";

export function routeLength(edges) {
  return edges.reduce((s, e) => s + e.length, 0);
}

export function turnsPerKm(edges) {
  if (edges.length < 2) return 0;
  let turns = 0;
  for (let i=1;i<edges.length;i++) {
    const d = Math.abs(edges[i].bearing - edges[i-1].bearing);
    const ang = Math.min(d, 360 - d);
    if (ang >= 45) turns++;
  }
  const km = Math.max(1e-9, routeLength(edges) / 1000);
  return turns / km;
}

export function overlapPct(edges) {
  // einfache Heuristik: gleiche Edge-IDs mehrfach?
  const seen = new Map();
  for (const e of edges) seen.set(e.id, (seen.get(e.id)||0) + 1);
  let overl = 0, total = 0;
  for (const e of edges) {
    total += e.length;
    if ((seen.get(e.id)||0) > 1) overl += e.length;
  }
  return total ? overl / total : 0;
}

export function routeQualityMean(edges, weights) {
  if (!edges.length) return 0;
  const sum = edges.reduce((s, e) => s + edgeQuality(e, weights), 0);
  return sum / edges.length;
}

export function greenShare(edges) {
  const len = routeLength(edges);
  if (!len) return 0;
  let good = 0;
  for (const e of edges) if (e.feat.green > 0.5) good += e.length;
  return good / len;
}

export function poiPerKm(edges) {
  const km = Math.max(1e-9, routeLength(edges) / 1000);
  const sumPoi = edges.reduce((s, e) => s + e.feat.poi, 0);
  // e.feat.poi ist 0..1 skaliert ~ dichte; grob als „Anzahl“ interpretieren
  return sumPoi / km;
}

export function evaluateRoute(edges, weights, constraints) {
  const dist = routeLength(edges);
  const distOk =
    dist >= constraints.minDist &&
    dist <= constraints.maxDist;

  const tpk = turnsPerKm(edges);
  const ov = overlapPct(edges);
  const q = routeQualityMean(edges, weights);
  const gshare = greenShare(edges);
  const poi = poiPerKm(edges);

  const simplicityPenalty = (constraints.turnsPerKmMax && tpk > constraints.turnsPerKmMax) ? (tpk - constraints.turnsPerKmMax) * 0.1 : 0;
  const overlapPenalty = Math.max(0, ov - (constraints.maxOverlap || 0.15)) * 0.5;

  const finalScore = q - simplicityPenalty - overlapPenalty;

  return {
    ok: !!distOk,
    metrics: {
      distance_m: dist,
      turns_per_km: tpk,
      overlap_pct: ov,
      quality_mean: q,
      green_share: gshare,
      poi_per_km: poi,
      final_score: finalScore,
    },
    edges,
  };
}
