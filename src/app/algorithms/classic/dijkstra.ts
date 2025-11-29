// src/app/algorithms/classic/dijkstra.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphNode } from '../../core/models/graph.model';
import { WeightConfig } from '../../core/models/weight.model';
import { RouteResult } from '../../core/models/route.model';
import { edgeBaseCost } from '../../core/utils/cost.util';
import { PriorityQueue } from '../../core/utils/priority-queue'; // Importieren!

@Injectable({
  providedIn: 'root'
})
export class DijkstraRunner implements AlgorithmRunner {
  id = 'dijkstra';
  name = 'Dijkstra (Optimiert)';

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {

    if (!graph.nodes[startId] || !graph.nodes[targetId]) {
      return null;
    }

    // Optimierung: Map statt Record für schnellere Zugriffe bei vielen Knoten
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const visited = new Set<string>();

    // Priority Queue statt Array
    const pq = new PriorityQueue<string>();

    // Init Start
    dist.set(startId, 0);
    pq.enqueue(startId, 0);

    while (pq.length > 0) {
      // O(1) statt O(N log N) durch Sortierung
      const currentId = pq.dequeue()!;

      // Skip, wenn wir diesen Knoten schon günstiger abgearbeitet haben
      // (Lazy Deletion: Knoten können mehrfach in der PQ sein)
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId === targetId) {
        return this.buildRoute(graph, prev, dist.get(targetId)!, startId, targetId);
      }

      const edges = graph.adjacency[currentId];
      if (!edges) continue;

      for (const edge of edges) {
        const neighborId = edge.to;
        if (visited.has(neighborId)) continue;

        const cost = edgeBaseCost(edge, weights);
        const currentDist = dist.get(currentId)!;
        const newDist = currentDist + cost;

        const neighborDist = dist.get(neighborId) ?? Infinity;

        if (newDist < neighborDist) {
          dist.set(neighborId, newDist);
          prev.set(neighborId, currentId);
          pq.enqueue(neighborId, newDist);
        }
      }
    }

    return null;
  }

  private buildRoute(
    graph: Graph,
    prev: Map<string, string | null>,
    finalCost: number,
    startId: string,
    targetId: string
  ): RouteResult {
    const nodes: GraphNode[] = [];
    const edges = [];

    let curr: string | null = targetId;
    const pathIds: string[] = [];

    while (curr) {
      pathIds.push(curr);
      if (curr === startId) break;
      curr = prev.get(curr) || null;
    }
    pathIds.reverse();

    // Nodes und Edges rekonstruieren
    for (let i = 0; i < pathIds.length; i++) {
      const id = pathIds[i];
      nodes.push(graph.nodes[id]);

      if (i < pathIds.length - 1) {
        const nextId = pathIds[i+1];
        const edge = graph.adjacency[id]?.find(e => e.to === nextId);
        if (edge) edges.push(edge);
      }
    }

    const polyline: [number, number][] = nodes.map(n => [n.lat, n.lon]);

    return {
      nodes,
      edges,
      polyline,
      totalCost: finalCost
    };
  }
}
