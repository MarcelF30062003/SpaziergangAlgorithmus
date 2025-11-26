// src/app/algorithms/classic/round-path.service.ts

import { Injectable, inject } from '@angular/core';
import { Graph, GraphEdge } from '../../core/models/graph.model';
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

  // Strafe für bereits genutzte Wege (in Metern)
  // 10km Strafe sorgt dafür, dass der Dijkstra diesen Weg nur im absoluten Notfall nimmt
  private readonly PENALTY_COST = 10000;

  /**
   * Erzeugt einen echten Rundweg:
   * 1. Start -> Anchor1
   * 2. Anchor1 -> Anchor2
   * 3. Anchor2 -> Start
   * * Neu: Nutzt Penalties, um Überschneidungen zu verhindern.
   */
  buildRoundRoute(
    graph: Graph,
    startId: string,
    desiredDistance: number,
    weights: WeightConfig
  ): RouteResult | null {

    // Optimierung: Radius etwas kleiner wählen für eine 3-Schenkel-Runde
    // (Distanz / 3) ist oft besser für Dreiecke als (Distanz / 2)
    const legDist = desiredDistance / 3;

    // 1. Anchor 1 suchen
    const anchor1 = this.graphService.findAnchorNode(graph, startId, legDist);
    if (!anchor1) {
      console.warn('Kein Anchor1 gefunden');
      return null;
    }

    // 2. Anchor 2 (seitlich versetzt)
    const anchor2 = this.findSideAnchor(graph, startId, anchor1, legDist);
    if (!anchor2) {
      console.warn('Kein Anchor2 gefunden');
      return null;
    }

    // --- SCHRITT 1: Hinweg (Start -> Anchor1) ---
    const leg1 = this.dijkstra.run(graph, startId, anchor1, weights);
    if (!leg1) return null;

    // >> PENALTY ANWENDEN: Hinweg für Rückweg sperren
    this.applyPenalty(leg1.edges);

    // --- SCHRITT 2: Querverbindung (Anchor1 -> Anchor2) ---
    const leg2 = this.dijkstra.run(graph, anchor1, anchor2, weights);
    if (!leg2) {
      // Aufräumen, falls es schiefgeht
      this.restorePenalty(leg1.edges);
      console.warn("Verbindung Anchor1 -> Anchor2 nicht möglich");
      return null;
    }

    // >> PENALTY ANWENDEN: Auch diesen Weg sperren
    this.applyPenalty(leg2.edges);

    // --- SCHRITT 3: Rückweg (Anchor2 -> Start) ---
    // Der Dijkstra ist jetzt gezwungen, einen neuen Weg zu finden
    const leg3 = this.dijkstra.run(graph, anchor2, startId, weights);

    // >> RESTORE: Den Graphen sofort wieder in den Originalzustand versetzen
    this.restorePenalty(leg1.edges);
    this.restorePenalty(leg2.edges);

    if (!leg3) {
      console.warn("Rückweg nicht möglich");
      return null;
    }

    // 4. Routen kombinieren
    const merged12 = this.graphService.combineRoutes(leg1, leg2);
    const merged123 = this.graphService.combineRoutes(merged12, leg3);

    return merged123;
  }

  /**
   * Erhöht die Distanz-Kosten temporär, um Wege unattraktiv zu machen.
   */
  private applyPenalty(edges: GraphEdge[]) {
    for (const edge of edges) {
      edge.distance += this.PENALTY_COST;
    }
  }

  /**
   * Macht die Änderungen rückgängig.
   */
  private restorePenalty(edges: GraphEdge[]) {
    for (const edge of edges) {
      edge.distance -= this.PENALTY_COST;
    }
  }

  /**
   * Sucht einen Knoten, der seitlich zu Start->Anchor1 liegt.
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

      // Score = möglichst großer Winkel (max ~180 Grad / PI)
      // Wir bevorzugen Punkte, die "weit weg" von der Linie Start-Anchor1 sind
      if (angle > bestScore) {
        bestScore = angle;
        bestNode = id;
      }
    }

    return bestNode;
  }

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
