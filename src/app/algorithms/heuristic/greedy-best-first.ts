// core/algorithms/heuristic/greedy-best-first.runner.ts

import { Injectable } from '@angular/core';
import { WeightConfig } from '../../core/models/weight.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';
import { edgeBaseCost } from '../../core/utils/cost.util';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';

interface OpenEntry {
  nodeId: string;
  score: number; // Heuristik + Penalty
}

/**
 * Greedy Best-First Search (Optimiert für Rundwege):
 * - Bei A -> B: Nutzt Heuristik h(n) zum Ziel.
 * - Bei A -> A (Rundweg): Generiert Wegpunkte und bestraft Rückwege extrem.
 */
@Injectable({
  providedIn: 'root',
})
export class GreedyBestFirstRunner implements AlgorithmRunner {
  id = 'greedy_best_first';
  name = 'Greedy Best-First Search (Roundtrip Optimized)';

  /**
   * Haupteinstiegspunkt.
   * Unterscheidet automatisch zwischen einfachem Weg und Rundweg.
   */
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

    // Fall 1: Rundweg gewünscht (Start == Ziel)
    if (startId === targetId) {
      const defaultDistance = 3000; // 3km Standard, falls keine Distanz UI vorhanden ist
      return this.generateRoundTrip(graph, startId, defaultDistance, weights);
    }

    // Fall 2: Normaler Weg A -> B
    // Wir übergeben ein leeres Set, da es keine verbotenen Straßen gibt.
    return this.runSegment(graph, startId, targetId, weights, new Set<string>());
  }

  /**
   * Erstellt einen Rundweg in Dreiecksform und verhindert, 
   * dass der Algorithmus den gleichen Weg zurückläuft.
   */
  public generateRoundTrip(
    graph: Graph,
    startId: string,
    approxDistanceMeters: number,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    
    // 1. ZWISCHENZIELE FINDEN
    // Wir teilen die Distanz durch 3 (Start -> A -> B -> Start)
    const segmentDist = approxDistanceMeters / 3;

    // Punkt A finden (zufällig in passender Entfernung)
    const waypoint1 = this.findRandomNodeAtDistance(graph, startNode, segmentDist);
    if (!waypoint1) {
        console.warn('Konnte keinen ersten Wegpunkt finden.');
        return null;
    }

    // Punkt B finden (muss weit weg von Start UND weit weg von Punkt A sein)
    // Das 'avoidNode' Argument sorgt für die Dreiecksform.
    let waypoint2 = this.findRandomNodeAtDistance(graph, startNode, segmentDist, waypoint1);
    
    // Fallback: Falls kein perfektes Dreieck möglich ist, nimm irgendeinen Punkt
    if (!waypoint2) {
        waypoint2 = this.findRandomNodeAtDistance(graph, startNode, segmentDist);
    }
    if (!waypoint2) return null;

    // Die Route: Start -> W1 -> W2 -> Start
    const targets = [waypoint1.id, waypoint2.id, startId];
    
    // Sammel-Variablen für das Endergebnis
    let combinedNodes: GraphNode[] = [];
    let combinedEdges: GraphEdge[] = [];
    let totalCost = 0;
    
    // GEDÄCHTNIS: Hier speichern wir alle Straßen, die wir schon gelaufen sind.
    const visitedEdgeSignatures = new Set<string>();

    let currentStart = startId;

    // 2. SEGMENTE BERECHNEN
    for (const target of targets) {
      // Segment berechnen mit "Gedächtnis" (visitedEdgeSignatures)
      const result = this.runSegment(graph, currentStart, target, weights, visitedEdgeSignatures);

      if (!result) {
        console.warn(`Kein Weg gefunden von ${currentStart} nach ${target}`);
        // Wenn ein Teilstück fehlt, ist der ganze Rundweg kaputt
        return null; 
      }

      // Gefundene Straßen zur "Blacklist" hinzufügen
      for (const edge of result.edges) {
        const sig = this.getEdgeSignature(edge);
        visitedEdgeSignatures.add(sig);
      }

      // Ergebnis zusammenfügen
      // (Beim Mergen darauf achten, dass Knoten an Schnittstellen nicht doppelt sind)
      if (combinedNodes.length === 0) {
        combinedNodes = [...result.nodes];
      } else {
        // Den ersten Knoten weglassen, da er identisch mit dem letzten des vorigen Segments ist
        combinedNodes = [...combinedNodes, ...result.nodes.slice(1)];
      }
      
      combinedEdges = [...combinedEdges, ...result.edges];
      totalCost += result.totalCost;

      // Das Ziel dieses Segments ist der Start des nächsten
      currentStart = target;
    }

    // Polyline für die Karte generieren
    const polyline: [number, number][] = combinedNodes.map(n => [n.lat, n.lon]);

    return {
      nodes: combinedNodes,
      edges: combinedEdges,
      polyline,
      totalCost
    };
  }

  /**
   * Der Kern-Algorithmus: Greedy Search mit Penalty-Logik.
   */
  private runSegment(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    visitedEdges: Set<string>
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    const open: OpenEntry[] = [];
    const visitedInSegment = new Set<string>();
    const cameFrom: Record<string, GraphEdge | undefined> = {};

    // Initialisierung
    open.push({
      nodeId: startId,
      score: this.heuristic(startNode, targetNode)
    });

    while (open.length > 0) {
      // Sortieren: Kleinster Score zuerst (Greedy)
      open.sort((a, b) => a.score - b.score);
      const current = open.shift()!;
      const currentId = current.nodeId;

      // Ziel erreicht
      if (currentId === targetId) {
        return this.buildRouteResult(graph, startId, targetId, cameFrom, weights);
      }

      if (visitedInSegment.has(currentId)) continue;
      visitedInSegment.add(currentId);

      const neighbors = graph.adjacency[currentId] || [];

      for (const edge of neighbors) {
        const nextId = edge.to;
        if (visitedInSegment.has(nextId)) continue;

        const nextNode = graph.nodes[nextId];
        if (!nextNode) continue;

        // --- PENALTY CHECK ---
        const sig = this.getEdgeSignature(edge);
        const isAlreadyUsed = visitedEdges.has(sig);

        // Basis-Heuristik (Luftlinie zum Ziel)
        const h = this.heuristic(nextNode, targetNode);
        
        // Berechnung des Scores
        let score = h;

        if (isAlreadyUsed) {
            // MASSIVE Bestrafung: Wir tun so, als wäre dieser Weg 10.000km länger.
            // Der Algorithmus nimmt diesen Weg nur, wenn es GAR KEINE andere Option gibt (Sackgasse).
            score += 10000000; 
        }

        // Wir fügen den Nachbarn zur Open List hinzu
        // (Bei Greedy ist es oft okay, Duplikate in Open zu haben, solange wir visited prüfen)
        cameFrom[nextId] = edge;
        open.push({ nodeId: nextId, score: score });
      }
    }

    return null;
  }

  // --- HILFSFUNKTIONEN ---

  private heuristic(a: GraphNode, b: GraphNode): number {
    return distanceBetweenNodes(a, b);
  }

  /**
   * Generiert eine eindeutige ID für eine Kante, unabhängig von der Richtung.
   * A->B bekommt den gleichen String wie B->A.
   */
  private getEdgeSignature(edge: GraphEdge): string {
      return [edge.from, edge.to].sort().join('-');
  }

  /**
   * Sucht zufälligen Knoten im Radius.
   * @param avoidNode Wenn gesetzt, muss der gefundene Punkt Abstand zu diesem Node haben.
   */
  private findRandomNodeAtDistance(
      graph: Graph, 
      startNode: GraphNode, 
      targetDist: number, 
      avoidNode?: GraphNode
  ): GraphNode | null {
    const candidates: GraphNode[] = [];
    const minD = targetDist * 0.6; // Größere Toleranz für bessere Ergebnisse
    const maxD = targetDist * 1.4;

    // Iteration über alle Knoten (Achtung: Performance bei sehr großen Graphen!)
    for (const key in graph.nodes) {
        const node = graph.nodes[key];
        const d = distanceBetweenNodes(startNode, node);
        
        if (d >= minD && d <= maxD) {
            // Geometrie-Check: Dreieck aufspannen
            if (avoidNode) {
                const distToAvoid = distanceBetweenNodes(node, avoidNode);
                // Der neue Punkt sollte mindestens 50% der Segmentlänge vom anderen Punkt entfernt sein
                if (distToAvoid < targetDist * 0.5) {
                    continue; 
                }
            }
            candidates.push(node);
        }
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private buildRouteResult(
    graph: Graph,
    startId: string,
    targetId: string,
    cameFrom: Record<string, GraphEdge | undefined>,
    weights: WeightConfig
  ): RouteResult | null {
    const pathEdges: GraphEdge[] = [];
    const pathNodes: GraphNode[] = [];
    let currentId: string | undefined = targetId;

    // Rückwärts rekonstruieren
    while (currentId && currentId !== startId) {
      // TYPE FIX: Explizite Typisierung verhindert den TS7022 Fehler
      const edge: GraphEdge | undefined = cameFrom[currentId];
      
      if (!edge) {
        console.warn('Pfad unterbrochen bei Rekonstruktion');
        return null;
      }
      pathEdges.push(edge);
      currentId = edge.from;
    }

    if (graph.nodes[startId]) {
        pathNodes.push(graph.nodes[startId]);
    }

    pathEdges.reverse();

    for (const edge of pathEdges) {
      const node = graph.nodes[edge.to];
      if (node) pathNodes.push(node);
    }

    const polyline: [number, number][] = pathNodes.map((n) => [n.lat, n.lon]);

    let totalCost = 0;
    for (const e of pathEdges) {
      totalCost += edgeBaseCost(e, weights);
    }

    return {
      nodes: pathNodes,
      edges: pathEdges,
      polyline,
      totalCost,
    };
  }
}