// data/spaziergangQuery.js

/**
 * Erzeugt eine Overpass Query für Spaziergangsdaten basierend auf Benutzerparametern.
 * Wenn keine Parameter angegeben werden, wird Paderborn als Standard verwendet.
 *
 * @param {Object} options - Optionen für die Abfrage
 * @param {number} [options.lat=51.7189] - Breitengrad (Default: Paderborn)
 * @param {number} [options.lon=8.7575] - Längengrad (Default: Paderborn)
 * @param {number} [options.radius=2000] - Suchradius in Metern
 * @returns {string} Overpass Query als Text
 */

export function buildSpaziergangQuery(options = {}) {
  const {
    lat = 51.7189,
    lon = 8.7575,
    radius = 2000,
  } = options;

  // Query wird als String gebaut
  const query = `
  [out:json][timeout:25];
  (
    // --- Wege, die begehbar sind ---
    way["highway"~"footway|path|residential|living_street|pedestrian"]["foot"!="no"](around:${radius},${lat},${lon});

    // --- Grünflächen, Parks, Natur ---
    way["leisure"~"park|garden|recreation_ground"](around:${radius},${lat},${lon});
    way["landuse"~"forest|grass|meadow"](around:${radius},${lat},${lon});
    way["natural"~"water|wood"](around:${radius},${lat},${lon});
    way["waterway"~"river|stream|canal"](around:${radius},${lat},${lon});

    // --- POIs: Cafés, Bänke, Toiletten, Aussichtspunkte ---
    node["amenity"~"cafe|restaurant|toilets|bench"](around:${radius},${lat},${lon});
    node["tourism"~"viewpoint|information"](around:${radius},${lat},${lon});
  );
  out geom;
  `;

  return query.trim();
}
