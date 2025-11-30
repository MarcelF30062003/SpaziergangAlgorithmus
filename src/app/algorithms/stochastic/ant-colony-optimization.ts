import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { WeightConfig } from '../../core/models/weight.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';

import {
  curvatureScorePlaceholder, difficultyScoreFromTags, lightShadowScoreFromTags,
  overtakeScoreFromTags,
  pathWidthScore,
  pedestrianFriendlyScore,
  safeCrossingScoreFromTags, seasonalVegetationScoreFromTags,
  seatingScoreFromTags,
  shadeScoreFromTags, shelterScoreFromTags, slipRiskScoreFromTags,
  slopeScoreFromTags,
  vegetationNoiseScoreFromTags, viewWindowScoreFromTags
} from '../../core/utils/cost.util';

interface AntPath {
  edges: GraphEdge[];
  nodes: GraphNode[];
  totalDistance: number;
  routeQuality: number;
}

interface PathStep {
  node: GraphNode;
  edgeFromParent: GraphEdge | null; // Die Kante, über die wir zu diesem Node kamen
  triedEdges: Set<string>;          // Kanten, die von diesem Node aus schon probiert wurden (Backtracking)
}

@Injectable({
  providedIn: 'root',
})
export class AntColonyOptimizationRunner implements AlgorithmRunner {
  id = 'ant_colony_optimization';
  name = 'Ant Colony Optimization (ACO)';

  // ACO-Parameter
  private readonly numAnts = 15;
  private readonly numIterations = 25;
  private readonly alpha = 1.0;            // Einfluss der Pheromone
  private readonly beta = 2.0;             // Einfluss der Heuristik
  private readonly evaporationRate = 0.1;  // Verdunstung
  private readonly q0 = 0.80;              // Exploitation vs Exploration
  private readonly initialPheromone = 1.0;

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
      console.warn('ACO: Invalid start or target');
      return null;
    }

    // Pheromone initialisieren
    const pheromones: Record<string, number> = {};
    for (const edge of graph.edges) {
      pheromones[edge.id] = this.initialPheromone;
    }

    let bestPath: AntPath | null = null;
    let bestCost = Infinity;

    console.log(`[ACO] Starting: ${this.numAnts} ants, ${this.numIterations} iterations`);

    for (let iter = 0; iter < this.numIterations; iter++) {
      const iterationPaths: AntPath[] = [];

      // Jede Ameise läuft los
      for (let ant = 0; ant < this.numAnts; ant++) {
        const path = this.constructPath(
          graph,
          startId,
          targetId,
          weights,
          pheromones,
          avoidEdges
        );

        if (path) {
          iterationPaths.push(path);

          // Kostenfunktion: Minimieren.
          // Wir nutzen (Distanz / Quality), damit kürzere und qualitativ hochwertigere Wege gewinnen.
          // +0.1 um Division durch 0 zu vermeiden.
          const cost = path.totalDistance / (path.routeQuality + 0.1);

          if (cost < bestCost) {
            bestCost = cost;
            bestPath = path;
          }
        }
      }

      // Pheromone verdunsten
      for (const edgeId in pheromones) {
        pheromones[edgeId] *= (1 - this.evaporationRate);
      }

      // Pheromone verstärken (Update)
      for (const path of iterationPaths) {
        const deposit = (path.routeQuality * 100) / (path.totalDistance + 1);
        for (const edge of path.edges) {
          pheromones[edge.id] = (pheromones[edge.id] || this.initialPheromone) + deposit;
        }
      }

      if (iter % 5 === 0 || iter === this.numIterations - 1) {
        console.log(`[ACO] Iteration ${iter}: Paths found = ${iterationPaths.length}, Best cost = ${bestCost === Infinity ? 'None' : bestCost.toFixed(2)}`);
      }
    }

    if (!bestPath) {
      console.warn('[ACO] No path found after all iterations');
      return null;
    }

    console.log(`[ACO] Success! Distance: ${bestPath.totalDistance.toFixed(0)}m, Avg Quality: ${bestPath.routeQuality.toFixed(2)}`);
    return this.convertToRouteResult(bestPath, weights);
  }

  /**
   * Pfadkonstruktion mit Stack-basiertem Backtracking, um Sackgassen zu verlassen.
   */
  private constructPath(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    pheromones: Record<string, number>,
    globalAvoidEdges?: Set<string>
  ): AntPath | null {
    const startNode = graph.nodes[startId];

    // Stack für DFS/Backtracking
    const stack: PathStep[] = [];
    const visitedIds = new Set<string>();

    // Startknoten auf den Stack
    stack.push({
      node: startNode,
      edgeFromParent: null,
      triedEdges: new Set<string>()
    });
    visitedIds.add(startId);

    let steps = 0;
    const MAX_STEPS = 3000; // Notbremse gegen Endlosschleifen

    while (stack.length > 0 && steps < MAX_STEPS) {
      steps++;
      const currentStep = stack[stack.length - 1];
      const currentNode = currentStep.node;

      // Ziel erreicht?
      if (currentNode.id === targetId) {
        return this.buildPathFromStack(stack, weights);
      }

      // Nächste Kante wählen
      const nextEdge = this.selectNextEdge(
        graph,
        currentNode.id,
        targetId,
        visitedIds,
        currentStep.triedEdges, // Welche Kanten von hier aus schon erfolglos waren
        weights,
        pheromones,
        globalAvoidEdges
      );

      if (nextEdge) {
        // Vorwärts gehen
        const nextNode = graph.nodes[nextEdge.to];
        visitedIds.add(nextNode.id);

        stack.push({
          node: nextNode,
          edgeFromParent: nextEdge,
          triedEdges: new Set<string>()
        });
      } else {
        // Sackgasse: Backtracking
        const failedStep = stack.pop();
        if (!failedStep) return null;

        visitedIds.delete(failedStep.node.id); // Node wieder freigeben

        // Wenn der Stack nicht leer ist, markieren wir die Kante im Vorgänger als "versucht"
        if (stack.length > 0) {
          const parentStep = stack[stack.length - 1];
          if (failedStep.edgeFromParent) {
            parentStep.triedEdges.add(failedStep.edgeFromParent.id);
          }
        } else {
          // Wir sind zurück am Start und haben keine Optionen mehr -> Kein Weg
          return null;
        }
      }
    }

    return null; // Timeout
  }

  private buildPathFromStack(stack: PathStep[], weights: WeightConfig): AntPath {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let dist = 0;

    for (const step of stack) {
      nodes.push(step.node);
      if (step.edgeFromParent) {
        edges.push(step.edgeFromParent);
        dist += step.edgeFromParent.distance;
      }
    }

    const quality = this.calculateRouteQuality(edges, weights);
    return { nodes, edges, totalDistance: dist, routeQuality: quality };
  }

  private selectNextEdge(
    graph: Graph,
    currentId: string,
    targetId: string,
    visitedIds: Set<string>,
    triedEdgesLocal: Set<string>,
    weights: WeightConfig,
    pheromones: Record<string, number>,
    globalAvoidEdges?: Set<string>
  ): GraphEdge | null {
    const neighbors = graph.adjacency[currentId] || [];
    const candidates: Array<{ edge: GraphEdge; attractiveness: number }> = [];

    const targetNode = graph.nodes[targetId];

    for (const edge of neighbors) {
      // Kriterien für Ausschluss:
      if (globalAvoidEdges && globalAvoidEdges.has(edge.id)) continue;
      if (visitedIds.has(edge.to)) continue;
      if (triedEdgesLocal.has(edge.id)) continue;

      const nextNode = graph.nodes[edge.to];
      if (!nextNode) continue;

      // Berechnung Attraktivität
      const pheromone = pheromones[edge.id] || this.initialPheromone;
      const heuristic = this.calculateHeuristic(edge, nextNode, targetNode, weights);

      // Formel: Tau^alpha * Eta^beta
      const attractiveness = Math.pow(pheromone, this.alpha) * Math.pow(heuristic, this.beta);
      candidates.push({ edge, attractiveness });
    }

    if (candidates.length === 0) return null;

    // Entscheidung: Exploitation vs Exploration
    const q = Math.random();
    if (q < this.q0) {
      // Exploitation: Wähle den Besten
      candidates.sort((a, b) => b.attractiveness - a.attractiveness);
      return candidates[0].edge;
    } else {
      // Exploration: Roulette-Wheel Selection
      return this.selectProbabilistic(candidates);
    }
  }

  private calculateHeuristic(
    edge: GraphEdge,
    nextNode: GraphNode,
    targetNode: GraphNode,
    weights: WeightConfig
  ): number {
    // 1. Qualität der Kante (0.0 bis 1.0)
    const quality = this.edgeQualityScore(edge, weights);

    // 2. Distanz zum Ziel (je kleiner desto besser)
    const d = distanceBetweenNodes(nextNode, targetNode);
    // Invers zur Distanz -> je näher, desto höher der Wert
    const distFactor = 1000 / (d + 10);

    // Kombination: Qualität ist wichtig, aber Zieldistanz treibt die Richtung
    return (quality * 2.0) + (distFactor * 5.0);
  }

  /**
   * Berechnet Score (0..1) basierend auf ALLEN konfigurierten Gewichten.
   */
  private edgeQualityScore(edge: GraphEdge, weights: WeightConfig): number {
    let sum = 0;
    let wSum = 0;

    // Hilfsfunktion zum Aufsummieren
    const add = (val: number, w: number) => {
      sum += val * w;
      wSum += w;
    };

    // Einbindung aller Hilfsfunktionen aus cost.util.ts passend zum WeightConfig Interface
    add(pedestrianFriendlyScore(edge), weights.pedestrianFriendly);
    add(pathWidthScore(edge), weights.pathWidth);
    add(curvatureScorePlaceholder(edge), weights.pathCurvature);
    add(overtakeScoreFromTags(edge), weights.overtakeOptions);

    add(shadeScoreFromTags(edge), weights.treeShade);
    add(vegetationNoiseScoreFromTags(edge), weights.vegetationNoiseDampening);
    add(lightShadowScoreFromTags(edge), weights.lightShadow);
    add(seatingScoreFromTags(edge), weights.seating);
    add(shelterScoreFromTags(edge), weights.shelter);

    add(safeCrossingScoreFromTags(edge), weights.safeCrossings);
    add(slopeScoreFromTags(edge), weights.maxSlope);
    add(seasonalVegetationScoreFromTags(edge), weights.seasonalVegetation);
    add(viewWindowScoreFromTags(edge), weights.viewWindows);

    add(difficultyScoreFromTags(edge), weights.difficulty);
    add(slipRiskScoreFromTags(edge), weights.slipRisk);

    // Wenn alle Gewichte 0 sind oder keine Daten da sind, geben wir neutral 0.5 zurück
    if (wSum === 0) return 0.5;

    return sum / wSum;
  }

  private calculateRouteQuality(edges: GraphEdge[], weights: WeightConfig): number {
    if (edges.length === 0) return 0;
    let sum = 0;
    for (const e of edges) {
      sum += this.edgeQualityScore(e, weights);
    }
    return sum / edges.length;
  }

  private selectProbabilistic(
    candidates: Array<{ edge: GraphEdge; attractiveness: number }>
  ): GraphEdge {
    const total = candidates.reduce((acc, c) => acc + c.attractiveness, 0);
    if (total <= 0) return candidates[0].edge;

    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.attractiveness;
      if (r <= 0) return c.edge;
    }
    return candidates[candidates.length - 1].edge;
  }

  private convertToRouteResult(path: AntPath, weights: WeightConfig): RouteResult {
    const polyline: [number, number][] = path.nodes.map((n) => [n.lat, n.lon]);

    // Kostenberechnung für das Endergebnis
    // Wir nutzen hier eine ähnliche Logik wie bei A*: Distanz * Penalty
    const qualityPenalty = 1 - path.routeQuality;
    const totalCost = path.totalDistance * (1 + qualityPenalty);

    return {
      nodes: path.nodes,
      edges: path.edges,
      polyline,
      totalCost,
      totalDistance: path.totalDistance
    };
  }
}
