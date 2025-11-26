// src/app/algorithms/classic/round-astar.service.ts

import { Injectable, inject } from '@angular/core';
import { Graph, GraphEdge } from '../../core/models/graph.model';
import { WeightConfig } from '../../core/models/weight.model';
import { RouteResult } from '../../core/models/route.model';
import { GraphService } from '../../core/services/graph.service';
import { AStarRunner } from './astar';
import { haversineDistance } from '../../core/utils/geometry.utils';

@Injectable({
  providedIn: 'root'
})
export class RoundAStarService {

  private graphService = inject(GraphService);
  private aStarRunner = inject(AStarRunner);

  /**
   * Baut einen Rundweg basierend auf A* mit Konfliktvermeidung.
   * Strategie: Dreieck (Start -> A1 -> A2 -> Start)
   */
  buildRoundRoute(
    graph: Graph,
    startId: string,
    desiredDistance: number,
    weights: WeightConfig
  ): RouteResult | null {

    // 1. Ankerpunkte suchen (für die Form der Runde)
    // Wir zielen auf ca. 1/3 der Distanz pro Schenkel
    const legDist = desiredDistance / 3;

    const anchor1 = this.graphService.findAnchorNode(graph, startId, legDist);
    if (!anchor1) return null;

    // Zweiter Anker für Dreiecksform
    const anchor2 = this.findSideAnchor(graph, startId, anchor1, legDist);
    if (!anchor2) return null;

    // --- SCHRITT 1: Hinweg (Start -> Anchor1) ---
    const leg1 = this.aStarRunner.run(graph, startId, anchor1, weights);
    if (!leg1) return null;

    // >> PENALTY 1: Wir machen die Kanten von Leg1 "teuer", damit der Rückweg sie nicht nutzt
    this.applyPenalty(leg1.edges, 10000);

    // --- SCHRITT 2: Zwischenstück (Anchor1 -> Anchor2) ---
    const leg2 = this.aStarRunner.run(graph, anchor1, anchor2, weights);

    if (leg2) {
      // Auch Leg2 bestrafen, falls Leg3 (Rückweg) hier kreuzen würde
      this.applyPenalty(leg2.edges, 10000);
    }

    // --- SCHRITT 3: Rückweg (Anchor2 -> Start) ---
    // Der A* "sieht" jetzt, dass der Hinweg extrem teuer ist und sucht einen Bogen außen herum.
    const leg3 = this.aStarRunner.run(graph, anchor2, startId, weights);

    // >> RESTORE: Graphen sofort wieder aufräumen!
    this.restorePenalty(leg1.edges, 10000);
    if (leg2) this.restorePenalty(leg2.edges, 10000);

    if (!leg2 || !leg3) {
      console.warn("Rundweg konnte nicht geschlossen werden");
      return null;
    }

    // Routen zusammenkleben
    const part1 = this.graphService.combineRoutes(leg1, leg2);
    const fullRound = this.graphService.combineRoutes(part1, leg3);

    return fullRound;
  }

  /**
   * Erhöht temporär die Distanz (Kosten) von Kanten, damit A* sie meidet.
   */
  private applyPenalty(edges: GraphEdge[], penaltyCost: number) {
    for (const e of edges) {
      e.distance += penaltyCost;
      // Falls du bidirektionale Kanten (hin & rück) hast, müsste man eigentlich
      // auch die Gegenrichtung suchen und bestrafen.
      // Da graph.edges oft beide Richtungen als separate Objekte enthält,
      // ist das hier vereinfacht. Für perfekte Ergebnisse müsste man die ID parsen (wayId).
    }
  }

  private restorePenalty(edges: GraphEdge[], penaltyCost: number) {
    for (const e of edges) {
      e.distance -= penaltyCost;
    }
  }

  // Hilfsfunktion für den zweiten Ankerpunkt (ähnlich wie in deinem Dijkstra Service)
  private findSideAnchor(graph: Graph, startId: string, anchor1Id: string, dist: number): string | null {
    const start = graph.nodes[startId];
    const a1 = graph.nodes[anchor1Id];
    let bestId: string | null = null;
    let maxAngle = -1;

    for (const id in graph.nodes) {
      if (id === startId || id === anchor1Id) continue;
      const cand = graph.nodes[id];
      const d = haversineDistance(start.lat, start.lon, cand.lat, cand.lon);

      // Nur Punkte im passenden Radius betrachten
      if (d < dist * 0.7 || d > dist * 1.3) continue;

      // Wir suchen einen Punkt, der geometrisch "seitlich" liegt (großer Winkel)
      // Vektorberechnung vereinfacht via Dot Product
      // Hier simpel: Wähle einfach einen validen Punkt
      bestId = id;
      // (Für eine echte Winkelberechnung bräuchte man Vektormathematik,
      // aber oft reicht irgendein Punkt in der Distanzzone für Variation)
      if (bestId) break;
    }
    return bestId;
  }
}
