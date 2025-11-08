// core/graph.js
import { haversine, bearing, clamp01, pointToSegmentDistance } from "./geo.js";

/**
 * Erwartet Overpass-JSON { elements: [...] } mit "geom" auf Ways.
 * Erzeugt Graph + Feature-Index (green/water geometries, POIs).
 */
export function buildGraph(overpassJson) {
  const elements = overpassJson.elements || [];
  const nodeIndex = new Map(); // osm nodeId -> {id, lat, lon}
  const wayGeoms = [];
  const pois = [];

  for (const el of elements) {
    if (el.type === "node") {
      pois.push({ lat: el.lat, lon: el.lon, tags: el.tags || {} });
    } else if (el.type === "way" && el.geometry) {
      wayGeoms.push({ id: el.id, nodes: el.geometry.map(g => ({ lat: g.lat, lon: g.lon })), tags: el.tags || {} });
    }
  }

  // Sammle begehbare Wege
  const walkable = wayGeoms.filter(w => {
    const h = w.tags.highway;
    const foot = w.tags.foot;
    const walkCls = h && /^(footway|path|residential|living_street|pedestrian)$/.test(h);
    const notForbidden = foot !== "no";
    return walkCls && notForbidden && w.nodes.length >= 2;
  });

  // Grün/Wasser-Flächen/Wege (als Nähe-Referenz)
  const greens = wayGeoms.filter(w =>
    (w.tags.leisure && /^(park|garden|recreation_ground)$/.test(w.tags.leisure)) ||
    (w.tags.landuse && /^(forest|grass|meadow)$/.test(w.tags.landuse)) ||
    (w.tags.natural && /^(wood)$/.test(w.tags.natural))
  );
  const waters = wayGeoms.filter(w =>
    (w.tags.natural && /^(water)$/.test(w.tags.natural)) ||
    (w.tags.waterway && /^(river|stream|canal)$/.test(w.tags.waterway))
  );

  // Erzeuge deduplizierte Knoten
  let nextNodeId = 1;
  function getOrCreateNode(lat, lon) {
    // Hash über 1e-7 ~ 1 cm reicht
    const key = lat.toFixed(7) + "," + lon.toFixed(7);
    if (nodeIndex.has(key)) return nodeIndex.get(key);
    const n = { id: nextNodeId++, lat, lon, deg: 0 };
    nodeIndex.set(key, n);
    return n;
  }

  const edges = [];
  const adj = new Map();

  function addEdge(u, v, tags) {
    const length = haversine(u, v);
    const brg = bearing(u, v);
    const e = { id: edges.length + 1, u: u.id, v: v.id, length, bearing: brg, tags, feat: null };
    edges.push(e);
    if (!adj.has(u.id)) adj.set(u.id, []);
    if (!adj.has(v.id)) adj.set(v.id, []);
    adj.get(u.id).push(e);
    adj.get(v.id).push({ ...e, u: v.id, v: u.id, bearing: (brg + 180) % 360 }); // bidirektional
    u.deg++; v.deg++;
  }

  // Kanten aus begehbaren Ways
  for (const w of walkable) {
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const a = getOrCreateNode(w.nodes[i].lat, w.nodes[i].lon);
      const b = getOrCreateNode(w.nodes[i+1].lat, w.nodes[i+1].lon);
      addEdge(a, b, w.tags);
    }
  }

  const nodes = Array.from(nodeIndex.values());

  // Feature-Berechnung pro Kante (einfach, aber effektiv)
  function surfaceScore(tags) {
    const s = tags.surface;
    if (!s) return 0.6;
    if (/^(asphalt|concrete|paved)$/.test(s)) return 1.0;
    if (/^(compacted|fine_gravel|paving_stones|cobblestone)$/i.test(s)) return 0.8;
    if (/^(gravel|pebbl|unpaved)$/i.test(s)) return 0.6;
    if (/^(dirt|ground|sand|grass)$/i.test(s)) return 0.4;
    return 0.6;
  }
  function quietScore(tags) {
    const h = tags.highway || "";
    if (/^(footway|path|pedestrian)$/.test(h)) return 1.0;
    if (/^(living_street)$/.test(h)) return 0.8;
    if (/^(residential)$/.test(h)) return tags.sidewalk ? 0.7 : 0.55;
    return 0.5;
  }

  function nearestLineDistanceMeters(segPointA, segPointB, p) {
    return pointToSegmentDistance(p, segPointA, segPointB);
  }

  function proximityScore(edge, collections, maxDist = 50) {
    // Minimaler Abstand zu irgendeinem Segment aus den collections
    let best = Infinity;
    for (const w of collections) {
      const ns = w.nodes;
      for (let i = 0; i < ns.length - 1; i++) {
        const d1 = nearestLineDistanceMeters(ns[i], ns[i+1], nodeOf(edge.u));
        const d2 = nearestLineDistanceMeters(ns[i], ns[i+1], nodeOf(edge.v));
        best = Math.min(best, d1, d2);
        if (best <= 1) break;
      }
      if (best <= 1) break;
    }
    return clamp01((maxDist - Math.min(best, maxDist)) / maxDist);
  }

  function poiDensityScore(edge, poisArr, radius = 80) {
    // zähle POIs nahe der Kante über die beiden Endpunkte (heuristik)
    let cnt = 0;
    const u = nodeOf(edge.u), v = nodeOf(edge.v);
    for (const p of poisArr) {
      const du = haversine(u, p), dv = haversine(v, p);
      if (du < radius || dv < radius) cnt++;
    }
    // Skaliere grob pro 100 m
    const per100m = cnt / Math.max(1, edge.length / 100);
    return Math.max(0, Math.min(1, per100m / 0.6)); // 0.6 ~ heuristischer Sättigungspunkt
  }

  function nodeOf(id) { return nodes.find(n => n.id === id); }

  for (const e of edges) {
    const surf = surfaceScore(e.tags);
    const quiet = quietScore(e.tags);
    const green = proximityScore(e, greens, 60);
    const water = proximityScore(e, waters, 60);
    const poi = poiDensityScore(e, pois.filter(p =>
      (p.tags.amenity && /^(cafe|restaurant|toilets|bench)$/.test(p.tags.amenity)) ||
      (p.tags.tourism && /^(viewpoint|information)$/.test(p.tags.tourism))
    ), 90);
    // Steigung unbekannt -> neutral 0.7 (kann später aus DEM berechnet werden)
    const slope = 0.7;
    e.feat = { surface: surf, quiet, green, water, poi, slope };
  }

  return { nodes, edges, adj };
}
