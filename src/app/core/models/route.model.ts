// core/models/route-result.model.ts

import { GraphEdge, GraphNode } from './graph.model';

export interface RouteResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  polyline: [number, number][]; // [lat, lon] – direkt für Leaflet
  totalCost: number;
}
