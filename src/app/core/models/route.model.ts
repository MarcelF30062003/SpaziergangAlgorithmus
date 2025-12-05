// src/app/core/models/route.model.ts

import { GraphEdge, GraphNode } from './graph.model';

export interface RouteMetrics {
  totalDistance: number;

  // Die harten Fakten (0.0 - 1.0 Score)
  avgPedestrianFriendly: number;
  avgPathWidth: number;
  avgDifficulty: number;
  avgSlipRisk: number;
  avgMaxSlope: number;
}

export interface RouteResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  polyline: [number, number][];
  totalCost: number;
  totalDistance?: number;
  metrics?: RouteMetrics;
}
