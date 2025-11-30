// core/utils/cost.util.ts

import { GraphEdge } from '../models/graph.model';
import {getTag, hasTag} from './tag.utils';
import {WeightConfig} from '../models/weight.model';


/**
 * Basis-Kostenfunktion, die eure Bewertungsmatrix verwendet.
 * Höherer Rückgabewert = schlechterer Edge.
 */
export function edgeBaseCost(edge: GraphEdge, weights: WeightConfig): number {
  const d = edge.distance || 0;

  let cost = 0;

  // Distanz immer leicht mit drin, damit "Umwege" nicht komplett ignoriert werden.
  cost += d;

  // Fußgängerfreundliche Wege (highway=*)
  const pedScore = pedestrianFriendlyScore(edge);
  cost += (1 - pedScore) * weights.pedestrianFriendly * d;

  // Wegbreite (width, highway)
  const widthScore = pathWidthScore(edge);
  cost += (1 - widthScore) * weights.pathWidth * d;

  // Linienführung (Placeholder – müsste eigentlich über Geometrie des gesamten Wegs gehen)
  const curvatureScore = curvatureScorePlaceholder(edge);
  cost += (1 - curvatureScore) * weights.pathCurvature * d;

  // Überholmöglichkeiten (width, footway)
  const overtakeScore = overtakeScoreFromTags(edge);
  cost += (1 - overtakeScore) * weights.overtakeOptions * d;

  // Baumdichte / Schatten (natural=tree, wood, landuse=forest)
  const shadeScore = shadeScoreFromTags(edge);
  cost += (1 - shadeScore) * weights.treeShade * d;

  // Vegetationsbasierte Schalldämpfung (natural=tree, landuse=forest)
  const vegNoiseScore = vegetationNoiseScoreFromTags(edge);
  cost += (1 - vegNoiseScore) * weights.vegetationNoiseDampening * d;

  // Licht- und Schattenwirkung (tree, building, landuse)
  const lightShadowScore = lightShadowScoreFromTags(edge);
  cost += (1 - lightShadowScore) * weights.lightShadow * d;

  // Sitzgelegenheiten (amenity=bench)
  const seatingScore = seatingScoreFromTags(edge);
  cost += (1 - seatingScore) * weights.seating * d;

  // Wetterschutz (amenity=shelter)
  const shelterScore = shelterScoreFromTags(edge);
  cost += (1 - shelterScore) * weights.shelter * d;

  // Sichere Querungen (crossing, highway=crossing)
  const crossingScore = safeCrossingScoreFromTags(edge);
  cost += (1 - crossingScore) * weights.safeCrossings * d;

  // Maximale Steigung (incline)
  const slopeScore = slopeScoreFromTags(edge);
  cost += (1 - slopeScore) * weights.maxSlope * d;

  // Jahreszeitliche Wirkung der Vegetation (natural, landuse)
  const seasonalScore = seasonalVegetationScoreFromTags(edge);
  cost += (1 - seasonalScore) * weights.seasonalVegetation * d;

  // Blickfenster (viewpoint, natural, building)
  const viewScore = viewWindowScoreFromTags(edge);
  cost += (1 - viewScore) * weights.viewWindows * d;

  // Schwierigkeit (sac_scale, incline)
  const difficultyScore = difficultyScoreFromTags(edge);
  cost += (1 - difficultyScore) * weights.difficulty * d;

  // Rutschrisiko (smoothness, surface)
  const slipScore = slipRiskScoreFromTags(edge);
  cost += (1 - slipScore) * weights.slipRisk * d;

  console.log(cost);
  return cost;
}

// ----------------------
// Heuristiken pro Kriterium
// ----------------------

export function pedestrianFriendlyScore(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;

  if (hasTag(tags, 'highway', ['footway', 'pedestrian', 'path'])) return 1.0;
  if (hasTag(tags, 'highway', ['living_street', 'residential'])) return 0.8;
  if (hasTag(tags, 'highway', ['primary', 'secondary', 'trunk'])) return 0.3;

  return 0.5;
}

export function pathWidthScore(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;

  const widthTag = getTag(tags, 'width');
  if (!widthTag) return 0.5;

  const width = parseFloat(widthTag);
  if (isNaN(width)) return 0.5;

  if (width >= 3) return 1.0;   // sehr breit
  if (width >= 2) return 0.8;   // ok
  if (width >= 1.5) return 0.6; // knapp
  return 0.3;                   // sehr schmal
}

// Platzhalter, da echte Linienführung Segmentketten benötigt.
// Ihr könnt das später ersetzen durch z.B. Kurvenanalyse des Ways.
export function curvatureScorePlaceholder(_edge: GraphEdge): number {
  return 0.5;
}

export function overtakeScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.4;

  const widthTag = getTag(tags, 'width');
  if (widthTag) {
    const width = parseFloat(widthTag);
    if (!isNaN(width)) {
      if (width >= 3) return 1.0;
      if (width >= 2) return 0.8;
      if (width >= 1.5) return 0.6;
      return 0.3;
    }
  }

  // If there is a dedicated footway=separate or lane, assume better overtake options
  if (hasTag(tags, 'footway', ['sidewalk', 'separate'])) return 0.7;

  return 0.4;
}

export function shadeScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.2;

  if (hasTag(tags, 'natural', ['wood'])) return 1.0;
  if (hasTag(tags, 'landuse', ['forest'])) return 0.9;
  if (hasTag(tags, 'natural', ['tree'])) return 0.7;
  return 0.2;
}

export function vegetationNoiseScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.3;

  if (hasTag(tags, 'landuse', ['forest']) || hasTag(tags, 'natural', ['wood']))
    return 0.9;
  if (hasTag(tags, 'natural', ['tree'])) return 0.6;

  return 0.3;
}

export function lightShadowScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;

  // Einfach: „viel Vegetation + ein paar Gebäude“ ⇒ interessante Licht-/Schattenwirkung
  const hasTrees = hasTag(tags, 'natural', ['tree', 'wood']);
  const hasBuildings = hasTag(tags, 'building');
  const hasLanduse = hasTag(tags, 'landuse');

  if (hasTrees && hasBuildings) return 1.0;
  if (hasTrees && hasLanduse) return 0.8;
  if (hasTrees) return 0.7;
  return 0.5;
}

export function seatingScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.2;

  if (hasTag(tags, 'amenity', ['bench'])) return 1.0;
  return 0.2;
}

export function shelterScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.2;

  if (hasTag(tags, 'amenity', ['shelter'])) return 1.0;
  return 0.2;
}

export function safeCrossingScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;

  if (hasTag(tags, 'highway', ['crossing'])) {
    if (hasTag(tags, 'crossing', ['traffic_signals'])) return 1.0;
    if (hasTag(tags, 'crossing', ['island'])) return 0.8;
    return 0.7;
  }

  return 0.5;
}

export function slopeScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.7;

  const incline = getTag(tags, 'incline');
  if (!incline) return 0.7;

  // incline kann % oder up/down sein – hier nur simple %-Variante:
  const match = incline.match(/(-?\d+(\.\d+)?)\s*%/);
  if (!match) return 0.7;

  const slope = Math.abs(parseFloat(match[1]));
  if (slope <= 5) return 1.0;
  if (slope <= 10) return 0.8;
  if (slope <= 15) return 0.5;
  return 0.3;
}

export function seasonalVegetationScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.4;

  if (hasTag(tags, 'leaf_cycle', ['deciduous'])) return 1.0;
  if (hasTag(tags, 'natural', ['tree', 'wood']) || hasTag(tags, 'landuse', ['forest']))
    return 0.7;

  return 0.4;
}

export function viewWindowScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.4;

  if (hasTag(tags, 'tourism', ['viewpoint']) || hasTag(tags, 'viewpoint')) return 1.0;
  if (hasTag(tags, 'natural', ['peak', 'cliff'])) return 0.8;

  // In Kombination mit höherer Lage/Offenheit könnte man das verfeinern.
  return 0.4;
}

export function difficultyScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.7;

  // sac_scale=* – T1 (leicht) ... T6 (alpin)
  const sac = getTag(tags, 'sac_scale');
  if (sac) {
    if (['hiking', 'mountain_hiking'].includes(sac)) return 0.8;
    if (['demanding_mountain_hiking'].includes(sac)) return 0.6;
    if (['alpine_hiking'].includes(sac)) return 0.3;
    if (['demanding_alpine_hiking', 'difficult_alpine_hiking'].includes(sac)) return 0.1;
    // T1 (kein sac_scale) = normal
  }

  // starke Steigung wirkt auch als Schwierigkeit (wenn incline vorhanden)
  const incline = getTag(tags, 'incline');
  if (incline) {
    const match = incline.match(/(-?\d+(\.\d+)?)\s*%/);
    if (match) {
      const slope = Math.abs(parseFloat(match[1]));
      if (slope > 20) return 0.3;
      if (slope > 10) return 0.6;
    }
  }

  return 0.7;
}

export function slipRiskScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.6;

  // smoothness=* – good, excellent, bad, horrible...
  const smooth = getTag(tags, 'smoothness');
  if (smooth) {
    if (['excellent', 'good'].includes(smooth)) return 1.0;
    if (['intermediate'].includes(smooth)) return 0.8;
    if (['bad'].includes(smooth)) return 0.5;
    if (['very_bad', 'horrible', 'very_horrible', 'impassable'].includes(smooth)) return 0.2;
  }

  // surface=* – asphalt vs. grass/mud
  const surface = getTag(tags, 'surface');
  if (surface) {
    if (['asphalt', 'paved', 'concrete'].includes(surface)) return 1.0;
    if (['compacted', 'fine_gravel', 'gravel'].includes(surface)) return 0.8;
    if (['ground', 'dirt', 'grass'].includes(surface)) return 0.6;
    if (['mud', 'ice', 'snow', 'wetland'].includes(surface)) return 0.3;
  }

  return 0.6;
}

export function edgeBaseCostForSA(edge: GraphEdge, weights: WeightConfig): number {
  const d = edge.distance || 0;

  // Wir sammeln alle "Straf-Faktoren" (0 = gut, hoch = schlecht)
  // Anstatt sie direkt auf die Distanz zu addieren, summieren wir sie erst.
  let penaltySum = 0;

  // Fußgängerfreundliche Wege
  const pedScore = pedestrianFriendlyScore(edge);
  penaltySum += (1 - pedScore) * weights.pedestrianFriendly;

  // Wegbreite
  const widthScore = pathWidthScore(edge);
  penaltySum += (1 - widthScore) * weights.pathWidth;

  // Linienführung
  const curvatureScore = curvatureScorePlaceholder(edge);
  penaltySum += (1 - curvatureScore) * weights.pathCurvature;

  // Überholmöglichkeiten
  const overtakeScore = overtakeScoreFromTags(edge);
  penaltySum += (1 - overtakeScore) * weights.overtakeOptions;

  // Baumdichte / Schatten
  const shadeScore = shadeScoreFromTags(edge);
  penaltySum += (1 - shadeScore) * weights.treeShade;

  // Vegetationsbasierte Schalldämpfung
  const vegNoiseScore = vegetationNoiseScoreFromTags(edge);
  penaltySum += (1 - vegNoiseScore) * weights.vegetationNoiseDampening;

  // Licht- und Schattenwirkung
  const lightShadowScore = lightShadowScoreFromTags(edge);
  penaltySum += (1 - lightShadowScore) * weights.lightShadow;

  // Sitzgelegenheiten
  const seatingScore = seatingScoreFromTags(edge);
  penaltySum += (1 - seatingScore) * weights.seating;

  // Wetterschutz
  const shelterScore = shelterScoreFromTags(edge);
  penaltySum += (1 - shelterScore) * weights.shelter;

  // Sichere Querungen
  const crossingScore = safeCrossingScoreFromTags(edge);
  penaltySum += (1 - crossingScore) * weights.safeCrossings;

  // Maximale Steigung
  const slopeScore = slopeScoreFromTags(edge);
  penaltySum += (1 - slopeScore) * weights.maxSlope;

  // Jahreszeitliche Wirkung
  const seasonalScore = seasonalVegetationScoreFromTags(edge);
  penaltySum += (1 - seasonalScore) * weights.seasonalVegetation;

  // Blickfenster
  const viewScore = viewWindowScoreFromTags(edge);
  penaltySum += (1 - viewScore) * weights.viewWindows;

  // Schwierigkeit
  const difficultyScore = difficultyScoreFromTags(edge);
  penaltySum += (1 - difficultyScore) * weights.difficulty;

  // Rutschrisiko
  const slipScore = slipRiskScoreFromTags(edge);
  penaltySum += (1 - slipScore) * weights.slipRisk;


  // --- FIX ---
  // Wir dämpfen den Einfluss der Kriterien massiv.
  // Impact Factor 0.1 bedeutet: Selbst wenn ALLE Kriterien schlecht sind
  // (angenommen penaltySum ist ~10), erhöhen sich die Kosten nur um
  // Faktor (1 + 10 * 0.1) = 2.
  // Der Weg wirkt also maximal doppelt so lang, aber nicht 11-mal so lang.

  const IMPACT_FACTOR = 0.1;

  // Kosten = Distanz * (1 + etwas Aufschlag für schlechte Qualität)
  const totalCost = d * (1 + (penaltySum * IMPACT_FACTOR));

  return totalCost;
}
