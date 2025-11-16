// core/models/osm-overpass.model.ts

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
