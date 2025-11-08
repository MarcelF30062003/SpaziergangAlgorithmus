// core/costs.js
import { clamp01 } from "./geo.js";

export function edgeQuality(e, w) {
  const W = (w.green||0)+(w.water||0)+(w.cafes||0)+(w.quiet||0)+(w.surface||0)+(w.slope||0);
  const s =
    (w.green||0)*e.feat.green +
    (w.water||0)*e.feat.water +
    (w.cafes||0)*e.feat.poi +
    (w.quiet||0)*e.feat.quiet +
    (w.surface||0)*e.feat.surface +
    (w.slope||0)*e.feat.slope;
  return W === 0 ? 0 : clamp01(s / W);
}

export function edgeCost(e, weights, alpha = 0.35) {
  const q = edgeQuality(e, weights);
  const k = 1 - alpha * q; // 0 < k <= 1
  return Math.max(1e-3, e.length * k);
}
