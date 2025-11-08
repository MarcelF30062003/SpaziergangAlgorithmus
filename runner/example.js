// runner/example.js
import { buildSpaziergangQuery } from "../data/spaziergangQuery.js";
import { planRoutesFromOverpassData } from "../planner/planRoutes.js";

async function fetchOverpass(query) {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: query
  });
  if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
  return res.json();
}

async function main() {
  const lat = 51.7189, lon = 8.7575; // Paderborn
  const radius = 2000;

  const query = buildSpaziergangQuery({ lat, lon, radius });
  const osm = await fetchOverpass(query);

  const result = await planRoutesFromOverpassData(osm, {
    lat, lon,
    targetDistanceKm: 5,
    routeType: "loop",
    // Gewichte können hier angepasst werden:
    prefs: { green:0.45, water:0.25, cafes:0.10, slope:0.20, quiet:0.30, surface:0.15 },
  });

  console.log("DEBUG:", result.debug);
  for (const [i, r] of result.routes.entries()) {
    console.log(`Route #${i+1}`, r.metrics);
  }
}
main().catch(console.error);