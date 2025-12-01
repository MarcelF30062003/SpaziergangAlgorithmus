// core/utils/cost.util.ts

import { GraphEdge } from '../models/graph.model';
import {getTag, hasTag} from './tag.utils';
import {WeightConfig} from '../models/weight.model';
import { RouteMetrics } from '../models/route.model';

/**
 * Basis-Kostenfunktion, die eure Bewertungsmatrix verwendet.
 * Höherer Rückgabewert = schlechterer Edge.
 */
export function edgeBaseCost(edge: GraphEdge, weights: WeightConfig): number {
  const d = edge.distance || 0;
  let cost = 0;

  // Distanz immer leicht mit drin
  cost += d;

  // Kosten = (1 - Score) * Gewicht * Distanz
  // Je höher der Score (Qualität), desto geringer die Kosten
  cost += (1 - pedestrianFriendlyScore(edge)) * weights.pedestrianFriendly * d;
  cost += (1 - pathWidthScore(edge)) * weights.pathWidth * d;
  cost += (1 - curvatureScorePlaceholder(edge)) * weights.pathCurvature * d;
  cost += (1 - overtakeScoreFromTags(edge)) * weights.overtakeOptions * d;

  cost += (1 - shadeScoreFromTags(edge)) * weights.treeShade * d;
  cost += (1 - vegetationNoiseScoreFromTags(edge)) * weights.vegetationNoiseDampening * d;
  cost += (1 - lightShadowScoreFromTags(edge)) * weights.lightShadow * d;
  cost += (1 - seatingScoreFromTags(edge)) * weights.seating * d;
  cost += (1 - shelterScoreFromTags(edge)) * weights.shelter * d;

  cost += (1 - safeCrossingScoreFromTags(edge)) * weights.safeCrossings * d;
  cost += (1 - slopeScoreFromTags(edge)) * weights.maxSlope * d;
  cost += (1 - seasonalVegetationScoreFromTags(edge)) * weights.seasonalVegetation * d;
  cost += (1 - viewWindowScoreFromTags(edge)) * weights.viewWindows * d;

  cost += (1 - difficultyScoreFromTags(edge)) * weights.difficulty * d;
  cost += (1 - slipRiskScoreFromTags(edge)) * weights.slipRisk * d;

  return cost;
}

/**
 * Berechnet einen Score (0..1) für eine einzelne Kante basierend auf den Gewichten.
 */
export function edgeQualityScore(edge: GraphEdge, weights: WeightConfig): number {
  let sum = 0;
  let wSum = 0;

  const add = (val: number, w: number) => {
    sum += val * w;
    wSum += w;
  };

  add(pedestrianFriendlyScore(edge), weights.pedestrianFriendly);
  add(pathWidthScore(edge), weights.pathWidth);
  add(curvatureScorePlaceholder(edge), weights.pathCurvature);
  add(overtakeScoreFromTags(edge), weights.overtakeOptions);

  add(shadeScoreFromTags(edge), weights.treeShade);
  add(vegetationNoiseScoreFromTags(edge), weights.vegetationNoiseDampening);
  add(lightShadowScoreFromTags(edge), weights.lightShadow);
  add(seatingScoreFromTags(edge), weights.seating);
  add(shelterScoreFromTags(edge), weights.shelter);

  add(safeCrossingScoreFromTags(edge), weights.safeCrossings);
  add(slopeScoreFromTags(edge), weights.maxSlope);
  add(seasonalVegetationScoreFromTags(edge), weights.seasonalVegetation);
  add(viewWindowScoreFromTags(edge), weights.viewWindows);

  add(difficultyScoreFromTags(edge), weights.difficulty);
  add(slipRiskScoreFromTags(edge), weights.slipRisk);

  if (wSum === 0) return 0.5;

  return sum / wSum;
}

/**
 * Berechnet die durchschnittliche Qualität einer gesamten Route (0.0 bis 1.0).
 */
export function calculateRouteQuality(edges: GraphEdge[], weights: WeightConfig): number {
  if (!edges || edges.length === 0) return 0;
  let sum = 0;
  // Hier könnte man auch längengewichtet vorgehen, aber einfache Mittelung der Scores reicht oft
  for (const edge of edges) {
    sum += edgeQualityScore(edge, weights);
  }
  return sum / edges.length;
}

/**
 * Berechnet detaillierte Metriken für alle Felder der WeightMatrix + Zusatzinfos.
 */
export function calculateRouteMetrics(edges: GraphEdge[]): RouteMetrics {
  let totalDist = 0;

  // Summen für die gewichteten Durchschnitte
  let sumPedestrian = 0;
  let sumWidth = 0;
  let sumCurvature = 0;
  let sumOvertake = 0;

  let sumShade = 0;
  let sumNoise = 0;
  let sumLightShadow = 0;
  let sumSeating = 0;
  let sumShelter = 0;

  let sumCrossing = 0;
  let sumSlope = 0;
  let sumSeasonal = 0;
  let sumView = 0;

  let sumDifficulty = 0;
  let sumSlip = 0;

  // Absolute Zähler / Strecken
  let benchCount = 0;
  let crossingCount = 0;
  let litDist = 0;
  let greeneryDist = 0;

  if (!edges || edges.length === 0) {
    return createEmptyMetrics();
  }

  for (const edge of edges) {
    const d = edge.distance;
    totalDist += d;

    // Gewichtet nach Distanz aufaddieren
    sumPedestrian += pedestrianFriendlyScore(edge) * d;
    sumWidth += pathWidthScore(edge) * d;
    sumCurvature += curvatureScorePlaceholder(edge) * d;
    sumOvertake += overtakeScoreFromTags(edge) * d;

    sumShade += shadeScoreFromTags(edge) * d;
    sumNoise += vegetationNoiseScoreFromTags(edge) * d;
    sumLightShadow += lightShadowScoreFromTags(edge) * d;
    sumSeating += seatingScoreFromTags(edge) * d;
    sumShelter += shelterScoreFromTags(edge) * d;

    sumCrossing += safeCrossingScoreFromTags(edge) * d;
    sumSlope += slopeScoreFromTags(edge) * d;
    sumSeasonal += seasonalVegetationScoreFromTags(edge) * d;
    sumView += viewWindowScoreFromTags(edge) * d;

    sumDifficulty += difficultyScoreFromTags(edge) * d;
    sumSlip += slipRiskScoreFromTags(edge) * d;

    // Absolute Zähler
    if (hasTag(edge.tags, 'amenity', ['bench'])) benchCount++;
    if (hasTag(edge.tags, 'highway', ['crossing'])) crossingCount++;

    // Beleuchtung
    const lit = getTag(edge.tags, 'lit');
    if (lit && ['yes', '24/7', 'sunset-sunrise', 'automatic'].includes(lit)) {
      litDist += d;
    } else if (hasTag(edge.tags, 'highway', ['primary', 'secondary', 'residential', 'living_street'])) {
      litDist += d;
    }

    // Grünanteil
    const isGreen =
      hasTag(edge.tags, 'leisure', ['park', 'garden']) ||
      hasTag(edge.tags, 'landuse', ['forest', 'grass', 'meadow']) ||
      hasTag(edge.tags, 'natural', ['wood', 'tree_row']);
    if (isGreen) {
      greeneryDist += d;
    }
  }

  if (totalDist === 0) return createEmptyMetrics();

  return {
    totalDistance: Math.round(totalDist),

    avgPedestrianFriendly: sumPedestrian / totalDist,
    avgPathWidth: sumWidth / totalDist,
    avgPathCurvature: sumCurvature / totalDist,
    avgOvertakeOptions: sumOvertake / totalDist,

    avgTreeShade: sumShade / totalDist,
    avgVegetationNoiseDampening: sumNoise / totalDist,
    avgLightShadow: sumLightShadow / totalDist,
    avgSeating: sumSeating / totalDist,
    avgShelter: sumShelter / totalDist,

    avgSafeCrossings: sumCrossing / totalDist,
    avgMaxSlope: sumSlope / totalDist,
    avgSeasonalVegetation: sumSeasonal / totalDist,
    avgViewWindows: sumView / totalDist,

    avgDifficulty: sumDifficulty / totalDist,
    avgSlipRisk: sumSlip / totalDist,

    litDistance: Math.round(litDist),
    litPercentage: Math.round((litDist / totalDist) * 100),
    greeneryDistance: Math.round(greeneryDist)
  };
}

function createEmptyMetrics(): RouteMetrics {
  return {
    totalDistance: 0,
    avgPedestrianFriendly: 0, avgPathWidth: 0, avgPathCurvature: 0, avgOvertakeOptions: 0,
    avgTreeShade: 0, avgVegetationNoiseDampening: 0, avgLightShadow: 0, avgSeating: 0, avgShelter: 0,
    avgSafeCrossings: 0, avgMaxSlope: 0, avgSeasonalVegetation: 0, avgViewWindows: 0,
    avgDifficulty: 0, avgSlipRisk: 0,
    litDistance: 0, litPercentage: 0, greeneryDistance: 0
  };
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
  if (width >= 3) return 1.0;
  if (width >= 2) return 0.8;
  if (width >= 1.5) return 0.6;
  return 0.3;
}

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
  if (hasTag(tags, 'landuse', ['forest']) || hasTag(tags, 'natural', ['wood'])) return 0.9;
  if (hasTag(tags, 'natural', ['tree'])) return 0.6;
  return 0.3;
}

export function lightShadowScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;
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
  if (hasTag(tags, 'natural', ['tree', 'wood']) || hasTag(tags, 'landuse', ['forest'])) return 0.7;
  return 0.4;
}

export function viewWindowScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.4;
  if (hasTag(tags, 'tourism', ['viewpoint']) || hasTag(tags, 'viewpoint')) return 1.0;
  if (hasTag(tags, 'natural', ['peak', 'cliff'])) return 0.8;
  return 0.4;
}

export function difficultyScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.7;
  const sac = getTag(tags, 'sac_scale');
  if (sac) {
    if (['hiking', 'mountain_hiking'].includes(sac)) return 0.8;
    if (['demanding_mountain_hiking'].includes(sac)) return 0.6;
    if (['alpine_hiking'].includes(sac)) return 0.3;
    if (['demanding_alpine_hiking', 'difficult_alpine_hiking'].includes(sac)) return 0.1;
  }
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
  const smooth = getTag(tags, 'smoothness');
  if (smooth) {
    if (['excellent', 'good'].includes(smooth)) return 1.0;
    if (['intermediate'].includes(smooth)) return 0.8;
    if (['bad'].includes(smooth)) return 0.5;
    if (['very_bad', 'horrible', 'very_horrible', 'impassable'].includes(smooth)) return 0.2;
  }
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
  let penaltySum = 0;

  penaltySum += (1 - pedestrianFriendlyScore(edge)) * weights.pedestrianFriendly;
  penaltySum += (1 - pathWidthScore(edge)) * weights.pathWidth;
  penaltySum += (1 - curvatureScorePlaceholder(edge)) * weights.pathCurvature;
  penaltySum += (1 - overtakeScoreFromTags(edge)) * weights.overtakeOptions;
  penaltySum += (1 - shadeScoreFromTags(edge)) * weights.treeShade;
  penaltySum += (1 - vegetationNoiseScoreFromTags(edge)) * weights.vegetationNoiseDampening;
  penaltySum += (1 - lightShadowScoreFromTags(edge)) * weights.lightShadow;
  penaltySum += (1 - seatingScoreFromTags(edge)) * weights.seating;
  penaltySum += (1 - shelterScoreFromTags(edge)) * weights.shelter;
  penaltySum += (1 - safeCrossingScoreFromTags(edge)) * weights.safeCrossings;
  penaltySum += (1 - slopeScoreFromTags(edge)) * weights.maxSlope;
  penaltySum += (1 - seasonalVegetationScoreFromTags(edge)) * weights.seasonalVegetation;
  penaltySum += (1 - viewWindowScoreFromTags(edge)) * weights.viewWindows;
  penaltySum += (1 - difficultyScoreFromTags(edge)) * weights.difficulty;
  penaltySum += (1 - slipRiskScoreFromTags(edge)) * weights.slipRisk;

  const IMPACT_FACTOR = 0.1;
  const totalCost = d * (1 + (penaltySum * IMPACT_FACTOR));
  return totalCost;
}
