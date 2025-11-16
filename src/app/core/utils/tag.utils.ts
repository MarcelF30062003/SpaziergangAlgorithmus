
// core/utils/tags.util.ts

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
 * Sehr einfache Heuristik für "Schatten". Später gerne verfeinern.
 */
export function estimateShade(tags: OsmTagMap | undefined): number {
  if (!tags) return 0;

  // Beispiele: park, forest, tree-lined street, etc.
  if (hasTag(tags, 'landuse', ['forest'])) return 1;
  if (hasTag(tags, 'natural', ['wood'])) return 0.9;
  if (hasTag(tags, 'highway') && hasTag(tags, 'tree_lined', ['yes'])) return 0.7;

  return 0.2; // default geringe Beschattung
}

/**
 * Sehr grobe Sicherheitsheuristik.
 */
export function estimateSafety(tags: OsmTagMap | undefined): number {
  if (!tags) return 0.5;

  // Fußgängerwege sind eher sicher
  if (hasTag(tags, 'highway', ['footway', 'pedestrian', 'path'])) return 0.9;

  // Crossing mit Ampel
  if (hasTag(tags, 'highway', ['crossing']) && hasTag(tags, 'crossing', ['traffic_signals'])) {
    return 0.9;
  }

  // Hauptstraße eher unsicher
  if (hasTag(tags, 'highway', ['primary', 'secondary'])) return 0.3;

  return 0.5;
}
