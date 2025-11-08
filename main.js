// main.js
import { buildSpaziergangQuery } from "./data/spaziergangQuery.js";

async function fetchOSMData(options) {
  const query = buildSpaziergangQuery(options);
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: query,
  });
  if (!response.ok) throw new Error("Overpass request failed");
  return await response.json();
}

// Beispiel: Paderborn (Default)
fetchOSMData().then(data => console.log("Paderborn:", data));