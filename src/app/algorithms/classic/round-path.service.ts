import { Injectable, inject } from '@angular/core';
import { Graph } from '../../core/models/graph.model';
import { WeightConfig } from '../../core/models/weight.model';
import { RouteResult } from '../../core/models/route.model';
import { DijkstraRunner } from './dijkstra';
import { GraphService } from '../../core/services/graph.service';
import { haversineDistance } from '../../core/utils/geometry.utils';

@Injectable({
  providedIn: 'root'
})
export class RoundPathService {

  private readonly dijkstra = inject(DijkstraRunner);
  private readonly graphService = inject(GraphService);

  /**
   * Erzeugt einen echten Rundweg:
   *
   * 1. Start → Anchor1 (ungefähr desiredDistance / 2)
   * 2. Anchor1 → Anchor2 ("seitlicher" Punkt)
   * 3. Anchor2 → Start
   */
  buildRoundRoute(
    graph: Graph,
    startId: string,
    desiredDistance: number,
    weights: WeightConfig
  ): RouteResult | null {

    // --------------------------------
    // Schritt 1: Anchor 1 suchen
    // --------------------------------
    const anchor1 = this.graphService.findAnchorNode(graph, startId, desiredDistance / 2);
    if (!anchor1) {
      console.warn('Kein Anchor1 gefunden');
      return null;
    }

    // --------------------------------
    // Schritt 2: Anchor 2 (seitlich versetzter Punkt)
    // --------------------------------
    const anchor2 = this.findSideAnchor(graph, startId, anchor1, desiredDistance / 2);
    if (!anchor2) {
      console.warn('Kein Anchor2 gefunden');
      return null;
    }

    // --------------------------------
    // Schritt 3: 3× Dijkstra
    // --------------------------------
    const leg1 = this.dijkstra.run(graph, startId, anchor1, weights);
    const leg2 = this.dijkstra.run(graph, anchor1, anchor2, weights);
    const leg3 = this.dijkstra.run(graph, anchor2, startId, weights);

    if (!leg1 || !leg2 || !leg3) {
      console.warn("Min. eine Teilroute konnte nicht berechnet werden");
      return null;
    }

    // --------------------------------
    // Schritt 4: Routen kombinieren
    // --------------------------------
    const merged12 = this.graphService.combineRoutes(leg1, leg2);
    const merged123 = this.graphService.combineRoutes(merged12, leg3);

    return merged123;
  }



  /**
   * Anchor 2 = Knoten, der:
   *
   * - ungefähr desiredDistance entfernt ist (wie Anchor1)
   * - vom Winkel her möglichst SEITLICH zu Anchor1 liegt
   *
   * So erzwingen wir eine Rundform.
   */
  private findSideAnchor(
    graph: Graph,
    startId: string,
    anchor1Id: string,
    dist: number
  ): string | null {

    const start = graph.nodes[startId];
    const anchor1 = graph.nodes[anchor1Id];

    const targetMin = dist * 0.7;
    const targetMax = dist * 1.3;

    let bestNode: string | null = null;
    let bestScore = -Infinity;

    for (const id in graph.nodes) {
      if (id === startId || id === anchor1Id) continue;

      const n = graph.nodes[id];

      const d = haversineDistance(start.lat, start.lon, n.lat, n.lon);
      if (d < targetMin || d > targetMax) continue;

      // Winkel berechnen
      const angle = this.sideAngle(start, anchor1, n);

      // Score = möglichst großer Winkel seitlich
      if (angle > bestScore) {
        bestScore = angle;
        bestNode = id;
      }
    }

    return bestNode;
  }


  /**
   * Winkel zwischen:
   *
   *  start → anchor1
   *  start → candidate
   *
   * Je größer der Winkel, desto weiter seitlich.
   */
  private sideAngle(start: any, a1: any, n: any): number {
    const v1 = [a1.lat - start.lat, a1.lon - start.lon];
    const v2 = [n.lat - start.lat, n.lon - start.lon];
    const dp = v1[0] * v2[0] + v1[1] * v2[1];
    const m1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const m2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);

    if (m1 === 0 || m2 === 0) return 0;

    const cos = Math.max(-1, Math.min(1, dp / (m1 * m2)));
    return Math.acos(cos);  // In Radiant
  }
}
