// src/app/algorithms/heuristic/greedy-best-first.ts

import { Injectable } from '@angular/core';
import { WeightConfig } from '../../core/models/weight.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';
import { edgeBaseCost } from '../../core/utils/cost.util';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';

/**
 * Eintrag in der Open-List.
 * Speichert den Zustand eines Pfades, um Backtracking zu ermöglichen.
 */
interface SearchNode {
  nodeId: string;
  edgeFromParent: GraphEdge | null;
  parentNodeId: string | null;
  g: number;      // Bisher zurückgelegte Distanz (Meter)
  score: number;  // Der "Attraktivitäts-Wert" (niedriger ist besser)
}

/**
 * Greedy Best-First Search (Robust & Organic):
 * - Nutzt eine Open-List (Priority Queue ähnlich), um Sackgassen zu vermeiden.
 * - Bevorzugt qualitativ hochwertige Wege (Schatten, ruhig).
 * - Bestraft Rückwege extrem.
 * - Achtet auf das Distanz-Budget.
 */
@Injectable({
  providedIn: 'root',
})
export class GreedyBestFirstRunner implements AlgorithmRunner {
  id = 'greedy_best_first';
  name = 'Greedy Best-First (Smart)';

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) {
      console.warn('GreedyBestFirst: Invalid start or target id');
      return null;
    }

    // Fall 1: Rundweg (Start == Ziel)
    if (startId === targetId) {
      const defaultDistance = 3000;
      return this.generateRoundTrip(graph, startId, defaultDistance, weights);
    }

    // Fall 2: Einfacher Weg A -> B
    // Budget: Wir erlauben max 20% Umweg für schöne Strecken
    const airDist = distanceBetweenNodes(startNode, targetNode);
    const maxDist = airDist * 1.2; 
    
    return this.runSegment(graph, startId, targetId, weights, new Set<string>(), maxDist);
  }

  /**
   * Generiert einen Rundweg über 3 Segmente (Dreieck), um Hin- und Rückweg zu trennen.
   */
  public generateRoundTrip(
    graph: Graph,
    startId: string,
    targetDistanceMeters: number,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    
    // 1. ZWISCHENZIELE
    // Wir teilen durch ~3.3. Das sorgt dafür, dass die Luftlinie etwas kürzer ist 
    // als der tatsächliche Weg (Faktor ~1.3 Kurvigkeit), damit wir die Zieldistanz treffen.
    const segmentAirDistance = targetDistanceMeters / 3.3;

    // Punkt A finden
    const waypoint1 = this.findRandomNodeAtDistance(graph, startNode, segmentAirDistance);
    if (!waypoint1) return null;

    // Punkt B finden (Dreiecks-Form erzwingen durch 'avoidNode')
    let waypoint2 = this.findRandomNodeAtDistance(graph, startNode, segmentAirDistance, waypoint1);
    if (!waypoint2) {
        // Fallback ohne Avoidance
        waypoint2 = this.findRandomNodeAtDistance(graph, startNode, segmentAirDistance);
    }
    if (!waypoint2) return null;

    const targets = [waypoint1.id, waypoint2.id, startId];
    
    // Speicher
    let combinedNodes: GraphNode[] = [];
    let combinedEdges: GraphEdge[] = [];
    let totalCost = 0;
    
    // Globale Blacklist für bereits genutzte Straßen
    const visitedEdgeSignatures = new Set<string>();

    let currentStart = startId;
    
    // Budget pro Segment (etwas Puffer für Varianz)
    const segmentBudget = (targetDistanceMeters / 3) * 1.15; 

    // 2. SEGMENTE BERECHNEN
    for (const target of targets) {
      const result = this.runSegment(
        graph, 
        currentStart, 
        target, 
        weights, 
        visitedEdgeSignatures,
        segmentBudget
      );

      if (!result) {
        console.warn(`Greedy: Konnte Segment von ${currentStart} nach ${target} nicht finden.`);
        return null; 
      }

      // Benutzte Kanten sperren (für den Rückweg)
      for (const edge of result.edges) {
        const sig = this.getEdgeSignature(edge);
        visitedEdgeSignatures.add(sig);
      }

      // Zusammenfügen
      if (combinedNodes.length === 0) {
        combinedNodes = [...result.nodes];
      } else {
        combinedNodes = [...combinedNodes, ...result.nodes.slice(1)];
      }
      
      combinedEdges = [...combinedEdges, ...result.edges];
      totalCost += result.totalCost;
      currentStart = target;
    }

    const polyline: [number, number][] = combinedNodes.map(n => [n.lat, n.lon]);

    return {
      nodes: combinedNodes,
      edges: combinedEdges,
      polyline,
      totalCost
    };
  }

  /**
   * Kern-Logik: Robuste Suche mit Open-List.
   * Verbindet Greedy-Heuristik mit Qualitätskosten und Distanz-Limit.
   */
  private runSegment(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    visitedEdgesGlobal: Set<string>,
    distanceLimit: number
  ): RouteResult | null {
    const targetNode = graph.nodes[targetId];

    // Open List für Kandidaten
    const openList: SearchNode[] = [];
    // Closed Set für besuchte Knoten (innerhalb dieses Segments)
    const closedSet = new Set<string>();
    
    // Map für Rekonstruktion
    const cameFromMap = new Map<string, { edge: GraphEdge, parent: string }>();

    // Startknoten
    openList.push({
      nodeId: startId,
      edgeFromParent: null,
      parentNodeId: null,
      g: 0,
      score: 0
    });

    const MAX_ITERATIONS = 5000; // Schutz vor Endlosschleifen
    let iterations = 0;

    while (openList.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;

      // 1. Sortieren und Stochastic Pick
      // Wir sortieren nach Score aufsteigend.
      openList.sort((a, b) => a.score - b.score);

      // "Organic Feel": Wir nehmen zufällig einen der Top 3 Kandidaten.
      // Das verhindert Roboter-Linien, behält aber die Richtung bei.
      // Wenn wir nah am Limit sind, nehmen wir strikt den Besten (Index 0).
      let selectedIndex = 0;
      const topCount = Math.min(openList.length, 3);
      
      // Nur variieren, wenn wir noch Puffer haben. Wenn es eng wird, strikt optimieren.
      const bestNode = openList[0];
      const distToTarget = distanceBetweenNodes(graph.nodes[bestNode.nodeId], targetNode);
      const isCritical = (bestNode.g + distToTarget) > (distanceLimit * 0.95);

      if (!isCritical && topCount > 1) {
        selectedIndex = Math.floor(Math.random() * topCount);
      }

      // Element entfernen
      const current = openList.splice(selectedIndex, 1)[0];
      
      // Wenn schon besucht (über einen besseren/anderen Weg), überspringen
      if (closedSet.has(current.nodeId)) continue;
      closedSet.add(current.nodeId);

      // Mapping speichern (für Pfad-Rekonstruktion)
      if (current.edgeFromParent && current.parentNodeId) {
        cameFromMap.set(current.nodeId, { edge: current.edgeFromParent, parent: current.parentNodeId });
      }

      // Ziel erreicht?
      if (current.nodeId === targetId) {
        return this.reconstructPath(graph, startId, targetId, cameFromMap, weights);
      }

      // Nachbarn expandieren
      const edges = graph.adjacency[current.nodeId] || [];
      for (const edge of edges) {
        const nextId = edge.to;
        if (closedSet.has(nextId)) continue;

        const nextNode = graph.nodes[nextId];
        if (!nextNode) continue;

        // --- SCORE BERECHNUNG ---
        
        // 1. Heuristik (Luftlinie zum Ziel)
        const h = distanceBetweenNodes(nextNode, targetNode);
        
        // 2. Distanz-Check (g = bisher gelaufen)
        const newG = current.g + edge.distance;
        
        // Soft-Limit: Wenn wir das Budget überschreiten, explodieren die Kosten.
        // Das zwingt den Algo, SOFORT den kürzesten Weg zum Ziel zu suchen (h minimieren).
        let limitPenalty = 0;
        if ((newG + h) > distanceLimit) {
           // Wir sind drüber! 
           // Faktor 10 auf alles außer h -> Der Algo wird zum reinen Distance-Greedy
           limitPenalty = 10000; 
        }

        // 3. Qualitäts-Kosten (Schatten, Lärm, etc.)
        // edgeBaseCost liefert hohe Werte für schlechte Wege.
        const qualityCost = edgeBaseCost(edge, weights);

        // 4. Global Visited Penalty (Rückweg vermeiden)
        let visitedPenalty = 0;
        const sig = this.getEdgeSignature(edge);
        if (visitedEdgesGlobal.has(sig)) {
            // Extrem hohe Strafe, aber nicht "unendlich", damit Sackgassen lösbar bleiben
            visitedPenalty = 50000; 
        }

        // Gesamter Score:
        // Wir gewichten Quality mit Faktor 4, damit er Umwege in Kauf nimmt.
        // Aber wenn das Limit erreicht ist, dominiert 'limitPenalty'.
        const score = h + (qualityCost * 4.0) + visitedPenalty + limitPenalty;

        openList.push({
          nodeId: nextId,
          edgeFromParent: edge,
          parentNodeId: current.nodeId,
          g: newG,
          score: score
        });
      }
    }

    // Wenn Liste leer oder Timeout -> Kein Weg gefunden
    return null;
  }

  private reconstructPath(
    graph: Graph,
    startId: string,
    targetId: string,
    cameFrom: Map<string, { edge: GraphEdge, parent: string }>,
    weights: WeightConfig
  ): RouteResult {
    const pathNodes: GraphNode[] = [];
    const pathEdges: GraphEdge[] = [];
    
    let curr: string | undefined = targetId;
    
    // Vom Ziel rückwärts zum Start
    while (curr && curr !== startId) {
      const entry = cameFrom.get(curr);
      if (!entry) break; // Sollte nicht passieren

      pathEdges.push(entry.edge);
      pathNodes.push(graph.nodes[curr]);
      curr = entry.parent;
    }

    // Startknoten hinzufügen
    if (graph.nodes[startId]) {
      pathNodes.push(graph.nodes[startId]);
    }

    // Umdrehen (Start -> Ziel)
    pathNodes.reverse();
    pathEdges.reverse();

    const polyline: [number, number][] = pathNodes.map(n => [n.lat, n.lon]);
    
    let totalCost = 0;
    let totalDist = 0;
    for (const e of pathEdges) {
      totalCost += edgeBaseCost(e, weights);
      totalDist += e.distance;
    }

    return {
      nodes: pathNodes,
      edges: pathEdges,
      polyline,
      totalCost,
      totalDistance: totalDist
    };
  }

  // --- Hilfsfunktionen ---

  private getEdgeSignature(edge: GraphEdge): string {
      return [edge.from, edge.to].sort().join('-');
  }

  private findRandomNodeAtDistance(
      graph: Graph, 
      startNode: GraphNode, 
      targetDist: number, 
      avoidNode?: GraphNode
  ): GraphNode | null {
    const candidates: GraphNode[] = [];
    const minD = targetDist * 0.7; 
    const maxD = targetDist * 1.3;

    for (const key in graph.nodes) {
        const node = graph.nodes[key];
        const d = distanceBetweenNodes(startNode, node);
        
        if (d >= minD && d <= maxD) {
            if (avoidNode) {
                const distToAvoid = distanceBetweenNodes(node, avoidNode);
                // Dreieck: Punkte müssen voneinander entfernt sein
                if (distToAvoid < targetDist * 0.6) continue; 
            }
            candidates.push(node);
        }
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}