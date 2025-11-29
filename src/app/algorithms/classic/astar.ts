// src/app/algorithms/classic/astar.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { WeightConfig } from '../../core/models/weight.model';
import { RouteResult } from '../../core/models/route.model';
import { edgeBaseCost } from '../../core/utils/cost.util';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';

interface AStarEntry {
  nodeId: string;
  fScore: number; // f = g + h (Gesamtkosten-Schätzung)
}

@Injectable({
  providedIn: 'root'
})
export class AStarRunner implements AlgorithmRunner {
  id = 'astar';
  name = 'A* Search';

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) {
      return null;
    }

    // gScore: Die tatsächlichen Kosten vom Start bis hierhin
    const gScore: Record<string, number> = {};
    // cameFrom: Um den Pfad am Ende zu rekonstruieren
    const cameFrom: Record<string, GraphEdge | undefined> = {};
    const visited = new Set<string>();

    // Initialisierung
    // Wir sparen uns das Iterieren über alle Nodes für Performance (Lazy Init via Check)
    gScore[startId] = 0;

    // Open List (Simuliert durch Array + Sortieren)
    const open: AStarEntry[] = [{
      nodeId: startId,
      fScore: this.heuristic(startNode, targetNode)
    }];

    while (open.length > 0) {
      // 1. Knoten mit niedrigstem fScore wählen
      open.sort((a, b) => a.fScore - b.fScore);
      const current = open.shift()!;
      const currentId = current.nodeId;

      if (currentId === targetId) {
        return this.buildRoute(graph, cameFrom, gScore[targetId], startId, targetId, weights);
      }

      visited.add(currentId);

      const edges = graph.adjacency[currentId] || [];

      for (const edge of edges) {
        const neighborId = edge.to;
        if (visited.has(neighborId)) continue;

        // Kosten berechnen
        const tentativeG = (gScore[currentId] ?? Infinity) + edgeBaseCost(edge, weights);
        const neighborG = gScore[neighborId] ?? Infinity;

        if (tentativeG < neighborG) {
          // Besserer Weg gefunden!
          cameFrom[neighborId] = edge;
          gScore[neighborId] = tentativeG;

          const h = this.heuristic(graph.nodes[neighborId], targetNode);
          const f = tentativeG + h;

          const existingIndex = open.findIndex(e => e.nodeId === neighborId);
          if (existingIndex >= 0) {
            open[existingIndex].fScore = f;
          } else {
            open.push({ nodeId: neighborId, fScore: f });
          }
        }
      }
    }

    return null; // Kein Pfad gefunden
  }

  /**
   * Heuristik: Luftlinie (Haversine).
   * Das "zieht" den Algorithmus zielgerichtet zum Endpunkt.
   */
  private heuristic(a: GraphNode, b: GraphNode): number {
    return distanceBetweenNodes(a, b);
  }

  private buildRoute(
    graph: Graph,
    cameFrom: Record<string, GraphEdge | undefined>,
    finalCost: number,
    startId: string,
    targetId: string,
    weights: WeightConfig // Nur für Neuberechnung falls nötig
  ): RouteResult {
    const pathEdges: GraphEdge[] = [];
    let currentId = targetId;

    // Rückwärts laufen
    while (currentId !== startId) {
      const edge = cameFrom[currentId];
      if (!edge) break;
      pathEdges.push(edge);
      currentId = edge.from;
    }
    pathEdges.reverse();

    const pathNodes: GraphNode[] = [graph.nodes[startId]];
    for (const e of pathEdges) {
      pathNodes.push(graph.nodes[e.to]);
    }

    const polyline: [number, number][] = pathNodes.map(n => [n.lat, n.lon]);

    return {
      nodes: pathNodes,
      edges: pathEdges,
      polyline,
      totalCost: finalCost
    };
  }
}
