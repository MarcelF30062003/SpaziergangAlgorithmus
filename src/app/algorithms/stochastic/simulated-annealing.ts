// src/app/algorithms/stochastic/simulated-annealing.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { WeightConfig } from '../../core/models/weight.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';
import { edgeBaseCostForSA } from '../../core/utils/cost.util';

interface StackFrame {
  nodeId: string;
  edgeFromParent: GraphEdge | null;
  neighbors: GraphEdge[];
  visitedIndex: number;
  currentDist: number;
}

@Injectable({
  providedIn: 'root',
})
export class SimulatedAnnealingRunner implements AlgorithmRunner {
  id = 'simulated_annealing';
  name = 'Simulated Annealing (Directed)';

  // --- PARAMETER ---
  // Wir starten etwas kühler, damit er nicht so stark "zittert"
  private readonly initialTemp = 80;
  private readonly coolingFactor = 0.98;
  private readonly minTemp = 0.1;

  // ZIEL-SOG: Erhöht auf 3.0.
  // Das sorgt dafür, dass er viel lieber in Richtung Ziel läuft als seitwärts.
  private readonly heuristicWeight = 3.0;

  // Strafe, wenn wir uns vom Ziel entfernen (gegen Zick-Zack)
  private readonly wrongDirectionPenalty = 200;

  // Maximale Distanz relativ zur Luftlinie (gegen 40km Ausreißer)
  private readonly maxDistanceFactor = 2.5;
  private readonly minBufferMeters = 2500;

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    avoidEdges?: Set<string>
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) return null;

    const airDistance = distanceBetweenNodes(startNode, targetNode);
    const maxSearchDist = Math.max(this.minBufferMeters, airDistance * this.maxDistanceFactor);

    const stack: StackFrame[] = [];

    // WICHTIG: pathSet speichert NUR die Knoten im aktuellen Pfad.
    // Das verhindert effizient Kreise (Loops).
    const pathSet = new Set<string>();

    let currentTemp = this.initialTemp;

    // Start
    pathSet.add(startId);
    stack.push({
      nodeId: startId,
      edgeFromParent: null,
      neighbors: this.getProbabilisticNeighbors(graph, startId, targetNode, weights, currentTemp, avoidEdges, pathSet),
      visitedIndex: 0,
      currentDist: 0
    });

    let steps = 0;
    const MAX_STEPS = 50000;

    while (stack.length > 0 && steps < MAX_STEPS) {
      steps++;
      const frame = stack[stack.length - 1];

      if (frame.nodeId === targetId) {
        return this.buildRouteResult(graph, stack, weights);
      }

      if (frame.visitedIndex < frame.neighbors.length) {
        const edge = frame.neighbors[frame.visitedIndex];
        frame.visitedIndex++;

        const nextId = edge.to;
        const newDist = frame.currentDist + edge.distance;

        // Distanz-Check
        if (newDist > maxSearchDist) continue;

        // Loop-Check: Ist der Knoten schon im aktuellen Pfad?
        if (!pathSet.has(nextId)) {
          pathSet.add(nextId);

          // Abkühlen
          currentTemp = Math.max(this.minTemp, currentTemp * this.coolingFactor);

          const nextNeighbors = this.getProbabilisticNeighbors(
            graph,
            nextId,
            targetNode,
            weights,
            currentTemp,
            avoidEdges,
            pathSet // Übergebe das Set, damit Nachbarn gefiltert werden
          );

          stack.push({
            nodeId: nextId,
            edgeFromParent: edge,
            neighbors: nextNeighbors,
            visitedIndex: 0,
            currentDist: newDist
          });
        }
      } else {
        // Backtracking
        const popped = stack.pop();
        if (popped) {
          pathSet.delete(popped.nodeId); // Wichtig: Knoten wieder freigeben für andere Pfade
        }
      }
    }

    return null;
  }

  private buildRouteResult(graph: Graph, stack: StackFrame[], weights: WeightConfig): RouteResult {
    const pathNodes: GraphNode[] = [];
    const pathEdges: GraphEdge[] = [];
    let totalCost = 0;
    let totalDistance = 0;

    for (const frame of stack) {
      const node = graph.nodes[frame.nodeId];
      pathNodes.push(node);
      if (frame.edgeFromParent) {
        pathEdges.push(frame.edgeFromParent);
        totalCost += edgeBaseCostForSA(frame.edgeFromParent, weights);
        totalDistance += frame.edgeFromParent.distance;
      }
    }
    return {
      nodes: pathNodes,
      edges: pathEdges,
      polyline: pathNodes.map(n => [n.lat, n.lon]),
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
    avoidEdges: Set<string> | undefined,
    currentPathSet: Set<string>
  ): GraphEdge[] {
    const neighbors = graph.adjacency[currentId] || [];
    if (neighbors.length === 0) return [];

    const currentNode = graph.nodes[currentId];
    const distToTargetCurrent = distanceBetweenNodes(currentNode, targetNode);

    const candidates = neighbors
      .filter(edge => !currentPathSet.has(edge.to)) // Filtere Loops sofort raus
      .map((edge) => {
        const nextNode = graph.nodes[edge.to];
        if (!nextNode) return { edge, score: Infinity };

        let g = edgeBaseCostForSA(edge, weights);

        // Rückweg-Strafe (global)
        if (avoidEdges && avoidEdges.has(edge.id)) {
          g += 10000;
        }

        const distToTargetNext = distanceBetweenNodes(nextNode, targetNode);

        // --- RICHTUNGS-LOGIK ---
        // Bewegen wir uns vom Ziel weg?
        if (distToTargetNext > distToTargetCurrent) {
          // Strafe! Das verhindert das ziellose Umherirren.
          g += this.wrongDirectionPenalty;
        }

        // Heuristik
        const h = distToTargetNext * this.heuristicWeight;
        const f = g + h;

        // Noise
        const noise = -Math.log(-Math.log(Math.random() + 1e-6));
        const perturbedScore = f - (temp * noise);

        return { edge, score: perturbedScore };
      });

    // Sortieren: Beste zuerst
    candidates.sort((a, b) => a.score - b.score);

    // Optional: Nur die Top X betrachten, um Verzweigungen zu reduzieren
    // return candidates.slice(0, 5).map(c => c.edge);
    return candidates.map(c => c.edge);
  }
}
