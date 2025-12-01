// core/models/route.model.ts

import { GraphEdge, GraphNode } from './graph.model';

export interface RouteMetrics {
  totalDistance: number;        // Gesamtdistanz in Metern

  // --- Metriken passend zur WeightConfig (0.0 - 1.0) ---
  avgPedestrianFriendly: number;
  avgPathWidth: number;
  avgPathCurvature: number;
  avgOvertakeOptions: number;

  avgTreeShade: number;
  avgVegetationNoiseDampening: number;
  avgLightShadow: number;
  avgSeating: number;
  avgShelter: number;

  avgSafeCrossings: number;
  avgMaxSlope: number;          // Score (1.0 = flach/gut, 0.0 = steil/schlecht)
  avgSeasonalVegetation: number;
  avgViewWindows: number;

  avgDifficulty: number;        // Score (1.0 = leicht, 0.0 = schwer)
  avgSlipRisk: number;          // Score (1.0 = sicher, 0.0 = rutschig)

  // --- Zusätzliche Infos ---
  litDistance: number;
  litPercentage: number;
  greeneryDistance: number;
}

export interface RouteResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  polyline: [number, number][];
  totalCost: number;
  totalDistance?: number;
  metrics?: RouteMetrics;
}
