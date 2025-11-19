// src/app/algorithms/stochastic/ant-colony-optimization.ts

import { Injectable } from '@angular/core';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { WeightConfig } from '../../core/models/weight.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';

// Import der Score-Funktionen aus cost.util.ts
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

@Injectable({
  providedIn: 'root',
})
export class AntColonyOptimizationRunner implements AlgorithmRunner {
  id = 'ant_colony_optimization';
  name = 'Ant Colony Optimization (ACO)';

  // ACO-Parameter
  private readonly numAnts = 15;           // Anzahl Ameisen pro Iteration (reduziert für Performance)
  private readonly numIterations = 25;     // Anzahl Iterationen
  private readonly alpha = 1.0;            // Einfluss der Pheromone
  private readonly beta = 3.0;             // Einfluss der Heuristik (erhöht für bessere Zielausrichtung)
  private readonly evaporationRate = 0.1;  // Verdunstungsrate (0.1 = 10% Verdunstung)
  private readonly q0 = 0.85;              // Exploitation vs Exploration (85% beste Wahl)
  private readonly initialPheromone = 1.0; // Initiale Pheromonmenge (erhöht)

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

    // Hauptschleife: Iterationen
    for (let iter = 0; iter < this.numIterations; iter++) {
      const iterationPaths: AntPath[] = [];

      // Jede Ameise konstruiert einen Pfad
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

          // Beste Route tracken
          const cost = path.totalDistance / (path.routeQuality + 0.01); // Niedriger = besser
          if (cost < bestCost) {
            bestCost = cost;
            bestPath = path;
          }
        }
      }

      // Pheromone verdunsten lassen
      for (const edgeId in pheromones) {
        pheromones[edgeId] *= (1 - this.evaporationRate);
      }

      // Pheromone von erfolgreichen Pfaden hinzufügen
      for (const path of iterationPaths) {
        const deposit = path.routeQuality / (path.totalDistance + 1);
        for (const edge of path.edges) {
          pheromones[edge.id] = (pheromones[edge.id] || 0) + deposit;
        }
      }

      if (iter % 5 === 0) {
        console.log(`[ACO] Iteration ${iter}: Best cost = ${bestCost.toFixed(2)}, Paths found = ${iterationPaths.length}`);
      }
    }

    if (!bestPath) {
      console.warn('[ACO] No path found');
      return null;
    }

    console.log(`[ACO] Complete. Best route quality: ${bestPath.routeQuality.toFixed(3)}, Distance: ${bestPath.totalDistance.toFixed(0)}m`);

    return this.convertToRouteResult(bestPath, weights);
  }

  /**
   * Eine Ameise konstruiert einen Pfad von Start zu Ziel
   */
  private constructPath(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    pheromones: Record<string, number>,
    avoidEdges?: Set<string>
  ): AntPath | null {
    const visited = new Set<string>();
    const pathEdges: GraphEdge[] = [];
    const pathNodes: GraphNode[] = [];

    let currentId = startId;
    pathNodes.push(graph.nodes[currentId]);

    let totalDistance = 0;
    const maxSteps = 1000; // Sicherheit gegen Endlosschleifen

    for (let step = 0; step < maxSteps; step++) {
      if (currentId === targetId) {
        // Ziel erreicht!
        const routeQuality = this.calculateRouteQuality(pathEdges, weights);
        return {
          edges: pathEdges,
          nodes: pathNodes,
          totalDistance,
          routeQuality
        };
      }

      visited.add(currentId);

      // Nächste Kante wählen
      const nextEdge = this.selectNextEdge(
        graph,
        currentId,
        targetId,
        visited,
        weights,
        pheromones,
        avoidEdges
      );

      if (!nextEdge) {
        // Sackgasse - aber vielleicht sind wir am Ziel?
        if (currentId === targetId) {
          const routeQuality = this.calculateRouteQuality(pathEdges, weights);
          return {
            edges: pathEdges,
            nodes: pathNodes,
            totalDistance,
            routeQuality
          };
        }
        return null;
      }

      pathEdges.push(nextEdge);
      totalDistance += nextEdge.distance;
      currentId = nextEdge.to;
      pathNodes.push(graph.nodes[currentId]);
    }

    return null; // Timeout
  }

  /**
   * Wählt die nächste Kante basierend auf Pheromonen und Heuristik
   */
  private selectNextEdge(
    graph: Graph,
    currentId: string,
    targetId: string,
    visited: Set<string>,
    weights: WeightConfig,
    pheromones: Record<string, number>,
    avoidEdges?: Set<string>
  ): GraphEdge | null {
    const neighbors = graph.adjacency[currentId] || [];
    const candidates: Array<{ edge: GraphEdge; attractiveness: number }> = [];

    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;

      const nextNode = graph.nodes[edge.to];
      if (!nextNode) continue;

      // Berechne Attraktivität
      const pheromone = pheromones[edge.id] || this.initialPheromone;
      const heuristic = this.calculateHeuristic(edge, nextNode, graph.nodes[targetId], weights, avoidEdges);

      const attractiveness = Math.pow(pheromone, this.alpha) * Math.pow(heuristic, this.beta);

      candidates.push({ edge, attractiveness });
    }

    if (candidates.length === 0) return null;

    // Exploitation vs Exploration
    const q = Math.random();

    if (q < this.q0) {
      // Exploitation: Wähle beste Kante
      candidates.sort((a, b) => b.attractiveness - a.attractiveness);
      return candidates[0].edge;
    } else {
      // Exploration: Wähle probabilistisch
      return this.selectProbabilistic(candidates);
    }
  }

  /**
   * Berechnet die Heuristik für eine Kante
   * Höherer Wert = besser
   */
  private calculateHeuristic(
    edge: GraphEdge,
    nextNode: GraphNode,
    targetNode: GraphNode,
    weights: WeightConfig,
    avoidEdges?: Set<string>
  ): number {
    // Qualität der Kante (0-1)
    const quality = this.edgeQualityScore(edge, weights);

    // Distanz zum Ziel (je näher, desto besser)
    const distanceToTarget = distanceBetweenNodes(nextNode, targetNode);
    const distanceFactor = 1000 / (distanceToTarget + 1); // Höherer Faktor für Zielausrichtung

    // Länge der Kante (kürzere Kanten bevorzugt, aber nicht zu stark gewichtet)
    const edgeLengthFactor = 100 / (edge.distance + 1);

    // Strafe für zu vermeidende Kanten
    let avoidancePenalty = 1.0;
    if (avoidEdges && avoidEdges.has(edge.id)) {
      avoidancePenalty = 0.001; // Sehr starke Strafe
    }

    // Kombiniere mit mehr Gewicht auf Zieldistanz
    return (quality * 0.3 + distanceFactor * 0.7) * edgeLengthFactor * avoidancePenalty;
  }

  /**
   * Berechnet einen Qualitätsscore (0-1) für eine Kante basierend auf der Gewichtungsmatrix
   * Höherer Wert = bessere Qualität
   */
  private edgeQualityScore(edge: GraphEdge, weights: WeightConfig): number {
    let qualitySum = 0;
    let weightSum = 0;

    // Alle Kriterien durchgehen und gewichtet summieren
    const criteria = [
      { score: pedestrianFriendlyScore(edge), weight: weights.pedestrianFriendly },
      { score: pathWidthScore(edge), weight: weights.pathWidth },
      { score: curvatureScorePlaceholder(edge), weight: weights.pathCurvature },
      { score: overtakeScoreFromTags(edge), weight: weights.overtakeOptions },
      { score: shadeScoreFromTags(edge), weight: weights.treeShade },
      { score: vegetationNoiseScoreFromTags(edge), weight: weights.vegetationNoiseDampening },
      { score: lightShadowScoreFromTags(edge), weight: weights.lightShadow },
      { score: seatingScoreFromTags(edge), weight: weights.seating },
      { score: shelterScoreFromTags(edge), weight: weights.shelter },
      { score: safeCrossingScoreFromTags(edge), weight: weights.safeCrossings },
      { score: slopeScoreFromTags(edge), weight: weights.maxSlope },
      { score: seasonalVegetationScoreFromTags(edge), weight: weights.seasonalVegetation },
      { score: viewWindowScoreFromTags(edge), weight: weights.viewWindows },
      { score: difficultyScoreFromTags(edge), weight: weights.difficulty },
      { score: slipRiskScoreFromTags(edge), weight: weights.slipRisk }
    ];

    for (const criterion of criteria) {
      qualitySum += criterion.score * criterion.weight;
      weightSum += criterion.weight;
    }

    // Normalisieren auf 0-1
    return weightSum > 0 ? qualitySum / weightSum : 0.5;
  }

  /**
   * Berechnet die Gesamtqualität einer Route
   */
  private calculateRouteQuality(edges: GraphEdge[], weights: WeightConfig): number {
    if (edges.length === 0) return 0;

    let totalQuality = 0;
    for (const edge of edges) {
      totalQuality += this.edgeQualityScore(edge, weights);
    }

    return totalQuality / edges.length; // Durchschnittliche Qualität
  }

  /**
   * Probabilistische Auswahl basierend auf Attraktivität
   */
  private selectProbabilistic(
    candidates: Array<{ edge: GraphEdge; attractiveness: number }>
  ): GraphEdge {
    const totalAttractiveness = candidates.reduce((sum, c) => sum + c.attractiveness, 0);

    if (totalAttractiveness === 0) {
      // Fallback: Zufällige Auswahl
      return candidates[Math.floor(Math.random() * candidates.length)].edge;
    }

    let random = Math.random() * totalAttractiveness;

    for (const candidate of candidates) {
      random -= candidate.attractiveness;
      if (random <= 0) {
        return candidate.edge;
      }
    }

    return candidates[candidates.length - 1].edge;
  }

  /**
   * Konvertiert AntPath zu RouteResult
   */
  private convertToRouteResult(path: AntPath, weights: WeightConfig): RouteResult {
    const polyline: [number, number][] = path.nodes.map(n => [n.lat, n.lon]);

    // Kosten ähnlich wie bei anderen Algorithmen berechnen
    let totalCost = 0;
    for (const edge of path.edges) {
      const quality = this.edgeQualityScore(edge, weights);
      // Niedrigere Qualität = höhere Kosten
      totalCost += edge.distance * (2 - quality); // Quality 1 → Faktor 1, Quality 0 → Faktor 2
    }

    return {
      nodes: path.nodes,
      edges: path.edges,
      polyline,
      totalCost,
      totalDistance: path.totalDistance
    };
  }
}
