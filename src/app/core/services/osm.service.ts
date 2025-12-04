// core/services/osm.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { OverpassResponse } from '../models/osm-overpass.model';
import {GraphService} from './graph.service';
import {Graph} from '../models/graph.model';

export interface OsmQueryParams {
  lat: number;
  lon: number;
  radius: number; // Meter
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

@Injectable({
  providedIn: 'root',
})
export class OsmService {
  constructor(
    private http: HttpClient,
    private graphService: GraphService
  ) {}

  /**
   * Baut eine Overpass-Query für fußgänger-relevante Wege.
   */
  // src/app/core/services/osm.service.ts

  private buildOverpassQuery(params: OsmQueryParams): string {
    const { lat, lon, radius } = params;

    const highwayFilter =
      '["highway"~"footway|path|cycleway|residential|living_street|track|service|pedestrian"]';

    const greenFilter =
      '["landuse"~"forest|grass|meadow|orchard|recreation_ground|cemetery"]' +
      '["leisure"~"park|garden|nature_reserve|golf_course"]' +
      '["natural"~"wood|scrub|heath|wetland|water"]';

    const amenityFilter = '["amenity"~"bench|shelter|drinking_water|toilets"]';
    const treeFilter = '["natural"~"tree"]';

    // ÄNDERUNG HIER: Timeout hochsetzen (180s) und Speicherlimit erhöhen (ca. 512MB)
    return `
      [out:json][timeout:180][maxsize:536870912];
      (
        // Wege
        way${highwayFilter}(around:${radius},${lat},${lon});

        // Grünflächen (Ways & Relationen)
        way${greenFilter}(around:${radius},${lat},${lon});
        relation${greenFilter}(around:${radius},${lat},${lon});

        // Amenities
        node${amenityFilter}(around:${radius},${lat},${lon});
        node${treeFilter}(around:${radius},${lat},${lon});
      );
      (._;>;);
      out body;
    `;
  }

  /**
   * Ruft die rohen OSM-Daten von Overpass ab.
   */
  fetchRawOsm(params: OsmQueryParams): Observable<OverpassResponse> {
    const body = this.buildOverpassQuery(params);
    const headers = new HttpHeaders({
      'Content-Type': 'text/plain',
    });

    return this.http.post<OverpassResponse>(OVERPASS_URL, body, { headers });
  }

  /**
   * Komfortfunktion: Direkt Graph zurückgeben, der von den Algorithmen benutzt werden kann.
   */
  fetchGraph(params: OsmQueryParams): Observable<Graph> {
    return this.fetchRawOsm(params).pipe(
      map((response) => this.graphService.buildGraphFromOverpass(response))
    );
  }
}
