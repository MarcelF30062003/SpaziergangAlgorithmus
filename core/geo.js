// core/geo.js
export const R = 6371000;

export function toRad(d) { return d * Math.PI / 180; }
export function clamp01(x){ return Math.max(0, Math.min(1, x)); }

export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const λ1 = toRad(a.lon), λ2 = toRad(b.lon);
  const y = Math.sin(λ2-λ1)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  let θ = Math.atan2(y, x) * 180/Math.PI;
  if (θ < 0) θ += 360;
  return θ;
}

// punkt -> Segment Distanz (Meter), grob ausreichend
export function pointToSegmentDistance(p, a, b) {
  // Koordinaten in pseudo-Meter umrechnen (lokal)
  const k = Math.cos(toRad(p.lat)) * 111320;
  const ax = a.lon * k, ay = a.lat * 111320;
  const bx = b.lon * k, by = b.lat * 111320;
  const px = p.lon * k, py = p.lat * 111320;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx*dx + dy*dy || 1e-9;
  let t = ((px-ax)*dx + (py-ay)*dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const sx = ax + t*dx, sy = ay + t*dy;
  const dxp = px - sx, dyp = py - sy;
  return Math.sqrt(dxp*dxp + dyp*dyp);
}
