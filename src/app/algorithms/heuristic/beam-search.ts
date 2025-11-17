import { Injectable } from '@angular/core';
import { WeightConfig } from '../../core/models/weight.model';
import { Graph, GraphEdge, GraphNode } from '../../core/models/graph.model';
import { RouteResult } from '../../core/models/route.model';
import { distanceBetweenNodes } from '../../core/utils/geometry.utils';
import { edgeBaseCost } from '../../core/utils/cost.util';
import { AlgorithmRunner } from '../../core/models/algorithm-runner.model';

interface BeamEntry {
  nodeId: string;
  score: number; // f = g + h
}

@Injectable({
  providedIn: 'root',
})
export class BeamSearchRunner implements AlgorithmRunner {
  id = 'beam_search';
  name = 'Beam Search';

  // Breite des Beams – kannst du später per UI konfigurierbar machen
  private readonly beamWidth = 10;

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {
    const startNode = graph.nodes[startId];
    const targetNode = graph.nodes[targetId];

    if (!startNode || !targetNode) {
      console.warn('BeamSearchRunner: invalid start or target id', {
        startId,
        targetId,
      });
      return null;
    }

    // 1. Versuch: Beam Search
    const beamResult = this.runBeam(graph, startId, targetId, weights, this.beamWidth);
    if (beamResult) {
      return beamResult;
    }

    console.info('BeamSearchRunner: no path with beam, falling back to full A* search');

    // 2. Fallback: Vollständige A*-ähnliche Suche (kein Beamschnitt)
    return this.runFull(graph, startId, targetId, weights);
  }

  // -----------------------
  // Beam-Variante
  // -----------------------
  private runBeam(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    beamWidth: number
  ): RouteResult | null {
    const visited = new Set<string>();
    const cameFrom: Record<string, GraphEdge | undefined> = {};
    const gScore: Record<string, number> = {};
    gScore[startId] = 0;

    let beam: BeamEntry[] = [
      {
        nodeId: startId,
        score: this.heuristic(graph.nodes[startId], graph.nodes[targetId]),
      },
    ];

    while (beam.length > 0) {
      // besten Kandidaten nach vorne
      beam.sort((a, b) => a.score - b.score);

      // 1. bestes Element rausnehmen
      const current = beam.shift()!;
      const currentId = current.nodeId;

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      if (currentId === targetId && cameFrom[currentId]) {
        console.info('BeamSearchRunner (beam): path found', {
          startId,
          targetId,
          visited: visited.size,
        });
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

        if (existingG === undefined || tentativeG < existingG) {
          gScore[nextId] = tentativeG;
          cameFrom[nextId] = edge;

          const h = this.heuristic(nextNode, graph.nodes[targetId]);
          const fScore = tentativeG + h;

          const existingIndex = beam.findIndex((b) => b.nodeId === nextId);
          if (existingIndex >= 0) {
            if (fScore < beam[existingIndex].score) {
              beam[existingIndex].score = fScore;
            }
          } else {
            beam.push({ nodeId: nextId, score: fScore });
          }
        }
      }

      // Beam begrenzen
      if (beam.length > beamWidth) {
        beam.sort((a, b) => a.score - b.score);
        beam = beam.slice(0, beamWidth);
      }
    }

    console.warn('BeamSearchRunner (beam): no path found', {
      startId,
      targetId,
      visited: visited.size,
    });
    return null;
  }

  // -----------------------
  // Fallback: vollständige Suche (A*-ähnlich)
  // -----------------------
  private runFull(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig
  ): RouteResult | null {
    const visited = new Set<string>();
    const cameFrom: Record<string, GraphEdge | undefined> = {};
    const gScore: Record<string, number> = {};
    gScore[startId] = 0;

    let open: BeamEntry[] = [
      {
        nodeId: startId,
        score: this.heuristic(graph.nodes[startId], graph.nodes[targetId]),
      },
    ];

    while (open.length > 0) {
      open.sort((a, b) => a.score - b.score);
      const current = open.shift()!;
      const currentId = current.nodeId;

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId === targetId && cameFrom[currentId]) {
        console.info('BeamSearchRunner (full): path found', {
          startId,
          targetId,
          visited: visited.size,
        });
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

        if (existingG === undefined || tentativeG < existingG) {
          gScore[nextId] = tentativeG;
          cameFrom[nextId] = edge;

          const h = this.heuristic(nextNode, graph.nodes[targetId]);
          const fScore = tentativeG + h;

          const existingIndex = open.findIndex((e) => e.nodeId === nextId);
          if (existingIndex >= 0) {
            if (fScore < open[existingIndex].score) {
              open[existingIndex].score = fScore;
            }
          } else {
            open.push({ nodeId: nextId, score: fScore });
          }
        }
      }
    }

    console.warn('BeamSearchRunner (full): no path found', {
      startId,
      targetId,
      visited: visited.size,
    });
    return null;
  }

  private heuristic(a: GraphNode, b: GraphNode): number {
    return distanceBetweenNodes(a, b);
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

    while (currentId && currentId !== startId) {
      const edge: GraphEdge | undefined = cameFrom[currentId];
      if (!edge) {
        console.warn('BeamSearchRunner: incomplete path reconstruction');
        return null;
      }

      pathEdges.push(edge);
      currentId = edge.from;
    }

    pathNodes.push(graph.nodes[startId]);

    pathEdges.reverse();

    for (const edge of pathEdges) {
      const node = graph.nodes[edge.to];
      if (node) {
        pathNodes.push(node);
      }
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
