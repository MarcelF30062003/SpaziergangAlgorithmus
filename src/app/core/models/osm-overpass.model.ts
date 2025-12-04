// core/models/osm-overpass.model.ts

export interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: OverpassMember[]; // <--- Das hat gefehlt!
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
