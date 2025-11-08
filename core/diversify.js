// core/diversify.js
export function jaccardEdges(a, b) {
  const A = new Set(a.edges.map(e => e.id));
  const B = new Set(b.edges.map(e => e.id));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter || 1;
  return inter / uni;
}

export function diversify(candidates, maxOut = 3, maxSim = 0.6) {
  candidates.sort((x, y) => y.metrics.final_score - x.metrics.final_score);
  const pick = [];
  for (const c of candidates) {
    if (pick.length === 0) { pick.push(c); continue; }
    const similar = pick.some(p => jaccardEdges(p, c) > maxSim);
    if (!similar) pick.push(c);
    if (pick.length >= maxOut) break;
  }
  return pick;
}
