// core/algorithms/heuristic/greedy-best-first.runner.ts

import { Injectable } from '@angular/core';
import {WeightConfig} from '../../core/models/weight.model';
import {Graph, GraphEdge, GraphNode} from '../../core/models/graph.model';
import {RouteResult} from '../../core/models/route.model';
import {distanceBetweenNodes} from '../../core/utils/geometry.utils';
import {edgeBaseCost} from '../../core/utils/cost.util';
import {AlgorithmRunner} from '../../core/models/algorithm-runner.model';


interface OpenEntry {
  nodeId: string;
  heuristic: number;   // h(n)
}

/**
 * Greedy Best-First Search:
 * - benutzt NUR die Heuristik h(n) zum Ziel
 * - ignoriert die bisherige Wegkosten g(n)
 * → schnell, aber nicht immer optimal
 */
@Injectable({
  providedIn: 'root',
})
export class GreedyBestFirstRunner implements AlgorithmRunner {
  id = 'greedy_best_first';
  name = 'Greedy Best-First Search';

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) {
      console.warn('GreedyBestFirstRunner: invalid start or target id', {
        startId,
        targetId,
      });
      return null;
    }

    const open: OpenEntry[] = [];
    const visited = new Set<string>();
    const cameFrom: Record<string, GraphEdge | undefined> = {};

    // Kosten ab Start (gScore)
    const gScore: Record<string, number> = {};
    gScore[startId] = 0;

    // initial
    open.push({
      nodeId: startId,
      heuristic: this.heuristic(startNode, targetNode), // wir nutzen das Feld weiter als "score"
    });

    while (open.length > 0) {
      // 1. Knoten mit geringstem score wählen
      open.sort((a, b) => a.heuristic - b.heuristic);
      const current = open.shift()!;
      const currentId = current.nodeId;

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      // Ziel erreicht?
      if (currentId === targetId && cameFrom[currentId]) {
        return this.buildRouteResult(graph, startId, targetId, cameFrom, weights);
      }

      const neighbors = graph.adjacency[currentId] || [];

      for (const edge of neighbors) {
        const nextId = edge.to;
        if (visited.has(nextId)) continue;

        const nextNode = graph.nodes[nextId];
        if (!nextNode) continue;

        const edgeCost = edgeBaseCost(edge, weights);
        const currentG = gScore[currentId] ?? Infinity;
        const tentativeG = currentG + edgeCost;

        const existingG = gScore[nextId];

        // Besserer Weg zu nextId gefunden?
        if (existingG === undefined || tentativeG < existingG) {
          gScore[nextId] = tentativeG;
          cameFrom[nextId] = edge;

          const h = this.heuristic(nextNode, targetNode);
          const score = tentativeG + h; // f = g + h

          const existingIndex = open.findIndex((e) => e.nodeId === nextId);
          if (existingIndex >= 0) {
            open[existingIndex].heuristic = score;
          } else {
            open.push({ nodeId: nextId, heuristic: score });
          }
        }
      }
    }

    console.warn('GreedyBestFirstRunner: no path found');
    return null;
  }


  /**
   * Heuristik: Luftlinien-Distanz zwischen current und Ziel.
   * Das ist konsistent mit eurer Geometrie (haversine).
   */
  private heuristic(a: GraphNode, b: GraphNode): number {
    return distanceBetweenNodes(a, b);
  }

  /**
   * Rekonstruiert den Pfad aus der cameFrom-Map und berechnet
   * RouteResult inkl. Polyline & totalCost.
   */
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

    // Rückwärts von Ziel → Start
    while (currentId && currentId !== startId) {
      const edge: any = cameFrom[currentId];
      if (!edge) {
        console.warn('GreedyBestFirstRunner: incomplete path reconstruction');
        return null;
      }

      pathEdges.push(edge);
      currentId = edge.from;
    }

    // Startknoten hinzufügen
    pathNodes.push(graph.nodes[startId]);

    // Reihenfolge umdrehen: Start → Ziel
    pathEdges.reverse();

    for (const edge of pathEdges) {
      const node = graph.nodes[edge.to];
      if (node) {
        pathNodes.push(node);
      }
    }

    const polyline: [number, number][] = pathNodes.map((n) => [n.lat, n.lon]);

    // Gesamtkosten anhand edgeBaseCost
    let totalCost = 0;
    for (const e of pathEdges) {
      totalCost += edgeBaseCost(e, weights);
    }

    const result: RouteResult = {
      nodes: pathNodes,
      edges: pathEdges,
      polyline,
      totalCost,
    };

    return result;
  }
}
