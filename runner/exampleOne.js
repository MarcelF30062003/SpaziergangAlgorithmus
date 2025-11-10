// runner/example_one.js
import { buildSpaziergangQuery } from "../data/spaziergangQuery.js";
import { planOneRouteFromOverpassData } from "../planner/planOneRoute.js";

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

    const osm = await fetchOverpass(buildSpaziergangQuery({ lat, lon, radius }));

    // Schnellste Variante: out_and_back (2x A*)
    // Für Loop (3x A*) setze routeType: "loop"
    const { route, debug } = await planOneRouteFromOverpassData(osm, {
        lat, lon,
        targetDistanceKm: 5,
        routeType: "out_and_back", // oder "loop"
        prefs: { green:0.45, water:0.25, cafes:0.10, slope:0.20, quiet:0.30, surface:0.15 },
        alpha: 0.35
    });

    console.log("DEBUG:", debug);
    if (!route) {
        console.error("Keine Route gefunden.");
        return;
    }
    console.log("Metriken:", route.metrics);
}
main().catch(console.error);
