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

  private readonly PENALTY_FACTOR = 2.0;

  buildRoundRoute(
    graph: Graph,
    startId: string,
    desiredDistance: number,
    weights: WeightConfig
  ): RouteResult | null {

    // SCHRITT 0: Nur erreichbare Knoten betrachten!
    // Das verhindert, dass wir Ziele auf "Inseln" wählen, die Dijkstra nicht erreichen kann.
    const reachableIds = this.graphService.getReachableNodeIds(graph, startId);

    // Wenn wir fast nirgendwohin kommen, abbrechen
    if (reachableIds.length < 10) {
      console.warn('[RoundPath] Zu wenige erreichbare Knoten.');
      return null;
    }

    // Strategie: Dreieck (Start -> A -> B -> Start)
    const legDist = desiredDistance / 3.0;

    // 1. ANKER A FINDEN (aus den erreichbaren!)
    const anchorA = this.findFirstAnchor(graph, startId, reachableIds, legDist);
    if (!anchorA) {
      console.warn('[RoundPath] Kein erreichbarer Anker A gefunden.');
      return null;
    }

    // 2. ANKER B FINDEN
    const anchorB = this.findTriangleAnchor(graph, startId, anchorA, reachableIds, legDist);
    if (!anchorB) {
      console.warn('[RoundPath] Kein erreichbarer Anker B gefunden.');
      return null;
    }

    // --- ROUTING ---
    const leg1 = this.dijkstra.run(graph, startId, anchorA, weights);
    if (!leg1) return null; // Sollte nicht passieren, da erreichbar, aber sicher ist sicher
    this.applyPenalty(leg1.edges, graph);

    const leg2 = this.dijkstra.run(graph, anchorA, anchorB, weights);
    if (!leg2) {
      this.restoreAllPenalties([leg1.edges], graph);
      return null;
    }
    this.applyPenalty(leg2.edges, graph);

    const leg3 = this.dijkstra.run(graph, anchorB, startId, weights);

    // Aufräumen
    this.restoreAllPenalties([leg1.edges, leg2.edges], graph);

    if (!leg3) return null;

    // Zusammenfügen
    const part1 = this.graphService.combineRoutes(leg1, leg2);
    return this.graphService.combineRoutes(part1, leg3);
  }

  /**
   * Findet den ersten Punkt in ca. 'dist' Entfernung (nur unter erreichbaren).
   */
  private findFirstAnchor(
    graph: Graph,
    startId: string,
    candidateIds: string[],
    targetDist: number
  ): string | null {
    const startNode = graph.nodes[startId];
    let bestId: string | null = null;
    let minDiff = Infinity;

    for (const id of candidateIds) {
      if (id === startId) continue;
      const d = haversineDistance(startNode.lat, startNode.lon, graph.nodes[id].lat, graph.nodes[id].lon);

      const diff = Math.abs(d - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Findet einen Punkt für das Dreieck (nur unter erreichbaren).
   */
  private findTriangleAnchor(
    graph: Graph,
    startId: string,
    anchorAId: string,
    candidateIds: string[],
    targetLegDist: number
  ): string | null {
    const startNode = graph.nodes[startId];
    const nodeA = graph.nodes[anchorAId];

    let bestId: string | null = null;
    let bestScore = Infinity;

    for (const id of candidateIds) {
      if (id === startId || id === anchorAId) continue;
      const candidate = graph.nodes[id];

      const dStart = haversineDistance(startNode.lat, startNode.lon, candidate.lat, candidate.lon);
      const dA = haversineDistance(nodeA.lat, nodeA.lon, candidate.lat, candidate.lon);

      // Score: Abweichung vom perfekten gleichschenkligen Dreieck
      const score = Math.abs(dStart - targetLegDist) + Math.abs(dA - targetLegDist);

      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    return bestId;
  }

  // --- Penalty Helpers ---

  private applyPenalty(edges: GraphEdge[], graph: Graph) {
    for (const edge of edges) {
      edge.distance *= this.PENALTY_FACTOR;
      const reverse = graph.adjacency[edge.to]?.find(e => e.to === edge.from);
      if (reverse) reverse.distance *= this.PENALTY_FACTOR;
    }
  }

  private restoreAllPenalties(edgesList: GraphEdge[][], graph: Graph) {
    for (const edges of edgesList) {
      for (const edge of edges) {
        edge.distance /= this.PENALTY_FACTOR;
        const reverse = graph.adjacency[edge.to]?.find(e => e.to === edge.from);
        if (reverse) reverse.distance /= this.PENALTY_FACTOR;
      }
    }
  }
}
