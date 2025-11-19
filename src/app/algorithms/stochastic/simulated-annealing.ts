// src/app/algorithms/heuristic/simulated-annealing.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { WeightConfig } from '../../core/models/weight.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';
import { edgeBaseCostForSA} from '../../core/utils/cost.util';

interface StackFrame {
  nodeId: string;
  edgeFromParent: GraphEdge | null; // Kante, über die wir hierher kamen
  neighbors: GraphEdge[];           // Noch zu besuchende Nachbarn (sortiert/gewürfelt)
  visitedIndex: number;             // Index des nächsten Nachbarn
}

@Injectable({
  providedIn: 'root',
})
export class SimulatedAnnealingRunner implements AlgorithmRunner {
  id = 'simulated_annealing';
  name = 'Simulated Annealing (Stochastic Search)';

  // Parameter für den Prozess
  private readonly initialTemp = 100; // Start-Temperatur (in "Kosten-Einheiten", z.B. Meter)
  private readonly coolingFactor = 0.99; // Abkühlung pro Schritt
  private readonly minTemp = 5; // Wenn T hierunter fällt, verhalten wir uns fast wie Greedy

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    avoidEdges?: Set<string>
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) {
      console.warn('SimulatedAnnealing: Invalid start or target');
      return null;
    }

    // Stack für iteratives DFS (um Rekursionslimit zu vermeiden und Backtracking zu ermöglichen)
    const stack: StackFrame[] = [];
    const visited = new Set<string>();

    // Initialisierung
    let currentTemp = this.initialTemp;

    // Startknoten auf den Stack
    stack.push({
      nodeId: startId,
      edgeFromParent: null,
      neighbors: this.getProbabilisticNeighbors(graph, startId, targetNode, weights, currentTemp),
      visitedIndex: 0
    });
    visited.add(startId);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]; // Peek

      // Ziel erreicht?
      if (frame.nodeId === targetId) {
        return this.buildRouteResult(graph, stack, weights);
      }

      // Haben wir noch Nachbarn zu besuchen?
      if (frame.visitedIndex < frame.neighbors.length) {
        const edge = frame.neighbors[frame.visitedIndex];
        frame.visitedIndex++; // Fürs nächste Mal vorrücken

        const nextId = edge.to;

        if (!visited.has(nextId)) {
          visited.add(nextId);

          // Abkühlen
          currentTemp = Math.max(this.minTemp, currentTemp * this.coolingFactor);

          // Nächsten Frame pushen
          // Hier wird die Entscheidung "probabilistisch" getroffen, da die Nachbarn
          // in getProbabilisticNeighbors bereits entsprechend sortiert wurden.
          const nextNeighbors = this.getProbabilisticNeighbors(graph, nextId, targetNode, weights, currentTemp, avoidEdges);
          stack.push({
            nodeId: nextId,
            edgeFromParent: edge,
            neighbors: nextNeighbors,
            visitedIndex: 0
          });
        }
      } else {
        // Sackgasse oder alle Nachbarn besucht: Backtracking
        stack.pop();
        // (Optional: Man könnte 'visited' hier entfernen, um andere Pfade zu erlauben,
        // aber bei Graphensuche ist 'visited' meist strikt, um Zyklen zu vermeiden.)
      }
    }

    console.warn('SimulatedAnnealing: No path found');
    return null;
  }


  /**
   * Rekonstruiert den Pfad aus dem Stack.
   */
  private buildRouteResult(
    graph: Graph,
    stack: StackFrame[],
    weights: WeightConfig
  ): RouteResult {
    const pathNodes: GraphNode[] = [];
    const pathEdges: GraphEdge[] = [];
    let totalCost = 0;
    let totalDistance = 0; // NEU

    for (const frame of stack) {
      const node = graph.nodes[frame.nodeId];
      pathNodes.push(node);

      if (frame.edgeFromParent) {
        pathEdges.push(frame.edgeFromParent);
        totalCost += edgeBaseCostForSA(frame.edgeFromParent, weights);
        totalDistance += frame.edgeFromParent.distance; // <--- WICHTIG: Meter addieren
      }
    }
    const polyline: [number, number][] = pathNodes.map((n) => [n.lat, n.lon]);
    return {
      nodes: pathNodes,
      edges: pathEdges,
      polyline,
      totalCost,
      totalDistance
    };
  }

  private getProbabilisticNeighbors(
    graph: Graph,
    currentId: string,
    targetNode: GraphNode,
    weights: WeightConfig,
    temp: number,
    avoidEdges?: Set<string> // <--- NEU
  ): GraphEdge[] {
    const neighbors = graph.adjacency[currentId] || [];
    if (neighbors.length === 0) return [];

    const candidates = neighbors.map((edge) => {
      const nextNode = graph.nodes[edge.to];
      if (!nextNode) return { edge, score: Infinity };

      // Basis-Kosten
      let g = edgeBaseCostForSA(edge, weights);

      // --- NEU: STRAFE FÜR BENUTZTE KANTEN ---
      if (avoidEdges && avoidEdges.has(edge.id)) {
        // Wir schlagen massiv Kosten drauf (z.B. 10.000 "virtuelle Meter")
        // Das sorgt dafür, dass er diese Kante nur nimmt, wenn es gar keinen anderen Weg gibt.
        g += 10000;
      }
      // ---------------------------------------

      const h = distanceBetweenNodes(nextNode, targetNode);
      const f = g + h;

      const noise = -Math.log(-Math.log(Math.random()));
      const perturbedScore = f - temp * noise;

      return { edge, score: perturbedScore };
    });

    candidates.sort((a, b) => a.score - b.score);
    return candidates.map((c) => c.edge);
  }

}
