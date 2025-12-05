// src/app/core/utils/cost.util.ts

import { GraphEdge } from '../models/graph.model';
import { WeightConfig } from '../models/weight.model';
import { RouteMetrics } from '../models/route.model';
import { getTag, hasTag } from './tag.utils';

/**
 * Berechnet die Kosten für eine Kante.
 * Formel: Distanz * (1 + Summe(Penalty * Gewicht))
 */
export function edgeBaseCost(edge: GraphEdge, weights: WeightConfig): number {
  const d = edge.distance || 0;
  let penaltySum = 0;

  // Wir invertieren die Scores: 1.0 (super) -> 0 Penalty. 0.0 (schlecht) -> 1 Penalty.
  penaltySum += (1 - pedestrianFriendlyScore(edge)) * weights.pedestrianFriendly;
  penaltySum += (1 - pathWidthScore(edge)) * weights.pathWidth;
  penaltySum += (1 - difficultyScoreFromTags(edge)) * weights.difficulty;
  penaltySum += (1 - slipRiskScoreFromTags(edge)) * weights.slipRisk;
  penaltySum += (1 - slopeScoreFromTags(edge)) * weights.maxSlope;
  penaltySum += (1 - curvatureScorePlaceholder(edge)) * weights.pathCurvature;

  // Basis-Kosten sind Distanz. Penalties machen den Weg "länger" für den Algo.
  return d * (1 + penaltySum);
}

/**
 * Für Simulated Annealing (ähnlich wie oben)
 */
export function edgeBaseCostForSA(edge: GraphEdge, weights: WeightConfig): number {
  return edgeBaseCost(edge, weights);
}

/**
 * Berechnet Metriken für die Anzeige im UI
 */
export function calculateRouteMetrics(edges: GraphEdge[]): RouteMetrics {
  let totalDist = 0;

  let sumPedestrian = 0;
  let sumWidth = 0;
  let sumDifficulty = 0;
  let sumSlip = 0;
  let sumSlope = 0;

  if (!edges || edges.length === 0) {
    return createEmptyMetrics();
  }

  for (const edge of edges) {
    const d = edge.distance;
    totalDist += d;

    sumPedestrian += pedestrianFriendlyScore(edge) * d;
    sumWidth += pathWidthScore(edge) * d;
    sumDifficulty += difficultyScoreFromTags(edge) * d;
    sumSlip += slipRiskScoreFromTags(edge) * d;
    sumSlope += slopeScoreFromTags(edge) * d;
  }

  if (totalDist === 0) return createEmptyMetrics();

  return {
    totalDistance: Math.round(totalDist),
    avgPedestrianFriendly: sumPedestrian / totalDist,
    avgPathWidth: sumWidth / totalDist,
    avgDifficulty: sumDifficulty / totalDist,
    avgSlipRisk: sumSlip / totalDist,
    avgMaxSlope: sumSlope / totalDist,
  };
}

function createEmptyMetrics(): RouteMetrics {
  return {
    totalDistance: 0,
    avgPedestrianFriendly: 0, avgPathWidth: 0, avgDifficulty: 0,
    avgSlipRisk: 0, avgMaxSlope: 0
  };
}

// ---------------------------------------------------------
// Score Funktionen (Cleaned Up)
// ---------------------------------------------------------

export function pedestrianFriendlyScore(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;
  // Dedizierte Fußwege sind top
  if (hasTag(tags, 'highway', ['footway', 'pedestrian', 'path', 'steps'])) return 1.0;
  // Verkehrsberuhigt ist okay
  if (hasTag(tags, 'highway', ['living_street', 'residential', 'service', 'track'])) return 0.7;
  // Radwege sind gemischt
  if (hasTag(tags, 'highway', ['cycleway'])) return 0.6;
  // Straßen mit Verkehr vermeiden
  if (hasTag(tags, 'highway', ['primary', 'secondary', 'tertiary', 'trunk'])) return 0.1;
  return 0.5;
}

export function pathWidthScore(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.5;
  const widthTag = getTag(tags, 'width');
  if (widthTag) {
    const width = parseFloat(widthTag);
    if (!isNaN(width)) {
      if (width >= 2.5) return 1.0;
      if (width >= 1.5) return 0.8;
      if (width >= 0.8) return 0.5; // Eng
      return 0.2; // Sehr eng
    }
  }
  // Heuristik basierend auf Typ
  if (hasTag(tags, 'highway', ['residential', 'living_street'])) return 0.9;
  if (hasTag(tags, 'highway', ['footway'])) return 0.6;
  if (hasTag(tags, 'highway', ['path'])) return 0.4;
  return 0.5;
}

export function difficultyScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.7; // Standard: Mittelmaß

  // SAC Scale (Wanderskala)
  const sac = getTag(tags, 'sac_scale');
  if (sac) {
    if (['hiking'].includes(sac)) return 1.0; // T1 (leicht)
    if (['mountain_hiking'].includes(sac)) return 0.7; // T2
    if (['demanding_mountain_hiking'].includes(sac)) return 0.4; // T3
    if (['alpine_hiking', 'demanding_alpine_hiking', 'difficult_alpine_hiking'].includes(sac)) return 0.1; // Zu schwer für Spaziergang
  }
  return 0.7;
}

export function slipRiskScoreFromTags(edge: GraphEdge): number {
  const tags = edge.tags;
  if (!tags) return 0.6;

  // Surface
  const surface = getTag(tags, 'surface');
  if (surface) {
    if (['asphalt', 'paved', 'concrete', 'paving_stones'].includes(surface)) return 1.0;
    if (['compacted', 'fine_gravel'].includes(surface)) return 0.8;
    if (['gravel', 'ground', 'dirt', 'grass', 'sand'].includes(surface)) return 0.5;
    if (['mud', 'clay'].includes(surface)) return 0.2;
  }

  // Smoothness
  const smooth = getTag(tags, 'smoothness');
  if (smooth) {
    if (['excellent', 'good'].includes(smooth)) return 1.0;
    if (['intermediate'].includes(smooth)) return 0.7;
    if (['bad', 'very_bad', 'horrible'].includes(smooth)) return 0.2;
  }

  return 0.6;
}

export function slopeScoreFromTags(edge: GraphEdge): number {
  // Ohne Höhendaten in Kanten ist das oft geraten, aber wir schauen auf Tags
  const tags = edge.tags;
  if (!tags) return 0.7;

  const incline = getTag(tags, 'incline');
  if (incline) {
    // Numerisch
    const match = incline.match(/(-?\d+(\.\d+)?)\s*%/);
    if (match) {
      const slope = Math.abs(parseFloat(match[1]));
      if (slope <= 3) return 1.0; // Flach
      if (slope <= 8) return 0.7; // Moderat
      if (slope <= 15) return 0.3; // Steil
      return 0.1; // Sehr steil
    }
    // Textuell
    if (incline === 'up' || incline === 'down') return 0.5;
    if (incline === 'steep') return 0.2;
  }

  // Stufen sind anstrengend
  if (hasTag(tags, 'highway', ['steps'])) return 0.2;

  return 0.7; // Annahme: Flach
}

export function curvatureScorePlaceholder(_edge: GraphEdge): number {
  // Placeholder: Könnte man später berechnen, wenn Geometrie im Edge gespeichert wird
  return 0.5;
}
