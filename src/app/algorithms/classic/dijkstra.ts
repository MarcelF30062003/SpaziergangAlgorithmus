// src/app/algorithms/classic/dijkstra.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph } from '../../core/models/graph.model';
import { WeightConfig } from '../../core/models/weight.model';
import { RouteResult } from '../../core/models/route.model';
import { edgeBaseCost } from '../../core/utils/cost.util';

interface QueueEntry {
  nodeId: string;
  cost: number;
}

@Injectable({
  providedIn: 'root'
})
export class DijkstraRunner implements AlgorithmRunner {
  id: string = "dijkstra";
  name: string = "dijkstra";

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {

    if (!graph.nodes[startId] || !graph.nodes[targetId]) {
      console.warn('DijkstraRunner: invalid start/target');
      return null;
    }

    const dist: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const visited = new Set<string>();

    // Initialisierung
    Object.keys(graph.nodes).forEach(id => {
      dist[id] = Infinity;
      prev[id] = null;
    });

    dist[startId] = 0;

    const open: QueueEntry[] = [];
    open.push({ nodeId: startId, cost: 0 });

    while (open.length > 0) {
      open.sort((a, b) => a.cost - b.cost);
      const { nodeId: currentId } = open.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId === targetId) {
        return this.buildRoute(graph, prev, dist[targetId], startId, targetId);
      }

      // *** WICHTIG: richtige Kantenquelle ***
      const edges = graph.adjacency[currentId];
      if (!edges) continue;

      for (const edge of edges) {
        const neighborId = edge.to;
        if (visited.has(neighborId)) continue;

        const cost = edgeBaseCost(edge, weights);
        const newCost = dist[currentId] + cost;

        if (newCost < dist[neighborId]) {
          dist[neighborId] = newCost;
          prev[neighborId] = currentId;
          open.push({ nodeId: neighborId, cost: newCost });
        }
      }
    }

    console.warn('DijkstraRunner: no path found');
    return null;
  }

  private buildRoute(
    graph: Graph,
    prev: Record<string, string | null>,
    finalCost: number,
    startId: string,
    targetId: string
  ): RouteResult {

    // Schritt 1: Knoten-ID Pfad rekonstruieren
    const idPath: string[] = [];
    let cur: string | null = targetId;

    while (cur) {
      idPath.push(cur);
      cur = prev[cur];
    }
    idPath.reverse();

    // Schritt 2: Node-Objekte erzeugen
    const nodes = idPath.map(id => graph.nodes[id]);

    // Schritt 3: Kanten erzeugen
    const edges = [];
    for (let i = 0; i < idPath.length - 1; i++) {
      const from = idPath[i];
      const to = idPath[i + 1];

      const edge = graph.adjacency[from].find(e => e.to === to);
      if (edge) edges.push(edge);
    }

    // Schritt 4: Polyline erzeugen
    const polyline: [number, number][] = nodes.map(n => [n.lat, n.lon]);

    return {
      nodes,
      edges,
      polyline,
      totalCost: finalCost
    };
  }

}
