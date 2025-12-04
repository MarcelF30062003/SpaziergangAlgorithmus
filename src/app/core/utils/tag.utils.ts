// src/app/core/utils/tag.utils.ts

import { OsmTagMap } from '../models/graph.model';

export function getTag(tags: OsmTagMap | undefined, key: string): string | undefined {
  if (!tags) return undefined;
  return tags[key];
}

export function hasTag(tags: OsmTagMap | undefined, key: string, values?: string[]): boolean {
  if (!tags) return false;
  const v = tags[key];
  if (v == null) return false;
  if (!values || values.length === 0) return true;
  return values.includes(v);
}

/**
 * Verbesserte Heuristik für Schatten.
 * Berücksichtigt jetzt auch Kontext-Informationen (z.B. Weg durch Park).
 */
export function estimateShade(tags: OsmTagMap | undefined): number {
  if (!tags) return 0.2; // Default: Geringe Beschattung

  // 1. Direkte Tags am Weg (Priorität)
  if (hasTag(tags, 'landuse', ['forest'])) return 1.0;
  if (hasTag(tags, 'natural', ['wood'])) return 0.9;
  // "tree_row" oder "avenue" sind oft gute Indikatoren
  if (hasTag(tags, 'natural', ['tree_row'])) return 0.8;

  if (hasTag(tags, 'highway')) {
    if (hasTag(tags, 'tree_lined', ['yes'])) return 0.7;
  }

  // 2. Kontext-Tags (wenn der Weg durch eine Fläche führt)
  // Diese werden vom GraphService hinzugefügt ('is_inside_green')
  if (tags['is_inside_green'] === 'yes') {

    // Waldgebiete
    if (hasTag(tags, 'context_landuse', ['forest'])) return 0.95;
    if (hasTag(tags, 'context_natural', ['wood'])) return 0.95;

    // Parks & Gärten (Schatten oft vorhanden, aber nicht garantiert)
    if (hasTag(tags, 'context_leisure', ['park', 'garden'])) return 0.6;
    if (hasTag(tags, 'context_landuse', ['grass', 'meadow', 'recreation_ground'])) return 0.3; // Eher offen
  }

  return 0.2;
}

/**
 * Sicherheitsheuristik.
 * Parks und Fußgängerzonen erhalten Bonus.
 */
export function estimateSafety(tags: OsmTagMap | undefined): number {
  if (!tags) return 0.5;

  let score = 0.5;

  // 1. Wegtyp Basis-Score
  if (hasTag(tags, 'highway', ['footway', 'pedestrian', 'path', 'steps'])) {
    score = 0.9;
  } else if (hasTag(tags, 'highway', ['living_street', 'residential', 'service'])) {
    score = 0.7;
  } else if (hasTag(tags, 'highway', ['cycleway'])) {
    score = 0.6; // Mischverkehr mit Radfahrern
  } else if (hasTag(tags, 'highway', ['primary', 'secondary', 'tertiary'])) {
    score = 0.3; // Viel Verkehr
  }

  // 2. Kontext-Bonus (Weg im Grünen ist meist verkehrsfrei -> sicher)
  if (tags['is_inside_green'] === 'yes') {
    // Ein Weg im Park ist sehr sicher (keine Autos)
    score = Math.max(score, 0.95);
  }

  // 3. Spezifische Merkmale
  // Ampeln
  if (hasTag(tags, 'highway', ['crossing']) && hasTag(tags, 'crossing', ['traffic_signals'])) {
    score = Math.max(score, 0.9);
  }

  // Beleuchtung (subjektive Sicherheit bei Nacht, hier pauschal Bonus)
  if (hasTag(tags, 'lit', ['yes', '24/7', 'automatic'])) {
    score += 0.05;
  }

  return Math.min(1.0, score); // Cap bei 1.0
}

/**
 * Zusatz: Hilfsfunktion, um Lärmschutz (Vegetation) besser zu schätzen.
 * Wird in cost.util.ts für 'vegetationNoiseDampening' verwendet.
 */
export function estimateVegetationNoiseDampening(tags: OsmTagMap | undefined): number {
  if (!tags) return 0.1;

  // Wald schluckt Schall extrem gut
  if (hasTag(tags, 'landuse', ['forest']) || hasTag(tags, 'natural', ['wood'])) return 1.0;

  // Kontext Wald
  if (tags['is_inside_green'] === 'yes') {
    if (hasTag(tags, 'context_landuse', ['forest']) || hasTag(tags, 'context_natural', ['wood'])) {
      return 0.9;
    }
    // Parkanlagen dämpfen auch etwas (Büsche, weicher Boden)
    if (hasTag(tags, 'context_leisure', ['park', 'garden'])) {
      return 0.5;
    }
  }

  return 0.1;
}
