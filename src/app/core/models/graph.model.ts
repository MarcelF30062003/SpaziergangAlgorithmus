// core/models/graph.model.ts

export type OsmTagMap = Record<string, string>;

export interface GraphNode {
  id: string;          // OSM node id (als String)
  lat: number;
  lon: number;
  tags: OsmTagMap;     // z.B. { "highway": "crossing", "traffic_signals": "pedestrian" }
}

export interface GraphEdge {
  id: string;          // synthetic ID, z.B. `${wayId}_${from}_${to}`
  from: string;        // node id
  to: string;          // node id

  distance: number;    // Meter
  incline?: number;    // Steigung in %, optional
  shade?: number;      // 0–1, Heuristik
  noise?: number;      // 0–1, 1 = laut, optional
  safety?: number;     // 0–1, 1 = sehr sicher, optional

  tags: OsmTagMap;     // Tags vom Way (und ggf. vom Segment)
}

/**
 * GraphModel-Container.
 * adjacency[nodeId] = ausgehende Kanten u.a. für Pfadsuche.
 */
export interface Graph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  adjacency: Record<string, GraphEdge[]>;
}
