// core/services/graph.service.ts

import {inject, Injectable} from '@angular/core';
import { Graph, GraphEdge, GraphNode } from '../models/graph.model';
import { OverpassResponse, OverpassElement } from '../models/osm-overpass.model';
import {distanceBetweenNodes, haversineDistance} from '../utils/geometry.utils';
import {estimateSafety, estimateShade} from '../utils/tag.utils';
import {RouteResult} from '../models/route.model';

@Injectable({
  providedIn: 'root',
})
export class GraphService {

  /**
   * Baut aus einer Overpass-Response einen gerichteten Graphen.
   * Jede Way-Segmentfolge (n0 -> n1 -> n2 ...) wird zu Kanten.
   */
  buildGraphFromOverpass(response: OverpassResponse): Graph {
    const nodeMap: Record<string, GraphNode> = {};
    const edges: GraphEdge[] = [];
    const adjacency: Record<string, GraphEdge[]> = {};

    const elements = response.elements || [];

    const osmNodes = elements.filter((el) => el.type === 'node');
    const osmWays = elements.filter((el) => el.type === 'way');

    // 1. Nodes mappen
    for (const el of osmNodes) {
      if (el.lat == null || el.lon == null) continue;

      const id = el.id.toString();
      nodeMap[id] = {
        id,
        lat: el.lat,
        lon: el.lon,
        tags: el.tags || {},
      };
    }

    // 2. Ways in Edges konvertieren
    for (const way of osmWays) {
      if (!way.nodes || way.nodes.length < 2) continue;

      const wayTags = way.tags || {};
      const nodeIds = way.nodes.map((n) => n.toString());

      for (let i = 0; i < nodeIds.length - 1; i++) {
        const fromId = nodeIds[i];
        const toId = nodeIds[i + 1];

        const fromNode = nodeMap[fromId];
        const toNode = nodeMap[toId];

        if (!fromNode || !toNode) {
          continue; // unvollständige Daten
        }

        const distance = distanceBetweenNodes(fromNode, toNode);
        const shade = estimateShade(wayTags);
        const safety = estimateSafety(wayTags);

        const edgeId = `${way.id}_${fromId}_${toId}`;

        const edge: GraphEdge = {
          id: edgeId,
          from: fromId,
          to: toId,
          distance,
          shade,
          safety,
          tags: wayTags,
        };

        edges.push(edge);

        if (!adjacency[fromId]) {
          adjacency[fromId] = [];
        }
        adjacency[fromId].push(edge);

        // Wenn ihr bidirektionale Wege wollt, hier auch reverse-Edge hinzufügen:
        if (!this.isOneWay(way)) {
          const reverseId = `${way.id}_${toId}_${fromId}`;
          const reverseEdge: GraphEdge = {
            ...edge,
            id: reverseId,
            from: toId,
            to: fromId,
          };
          edges.push(reverseEdge);

          if (!adjacency[toId]) {
            adjacency[toId] = [];
          }
          adjacency[toId].push(reverseEdge);
        }
      }
    }

    return {
      nodes: nodeMap,
      edges,
      adjacency,
    };
  }

  /**
   * Prüft, ob ein Way als Einbahnstraße behandelt werden soll.
   */
  private isOneWay(way: OverpassElement): boolean {
    const tags = way.tags || {};
    const oneway = tags['oneway'];
    if (oneway === 'yes' || oneway === 'true' || oneway === '1') return true;
    return false;
  }

  findNearestNode(graph: Graph, lat: number, lon: number): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const nodeId in graph.nodes) {
      const n = graph.nodes[nodeId];
      const d = Math.hypot(n.lat - lat, n.lon - lon); // reicht für Vergleich, muss nicht haversine sein
      if (d < bestDist) {
        bestDist = d;
        bestId = nodeId;
      }
    }

    return bestId;
  }

  findAnchorNode(
    graph: Graph,
    startId: string,
    desiredDistance: number,
    tolerance: number = 0.25
  ): string | null {
    const start = graph.nodes[startId];
    if (!start) return null;

    const reachableIds = this.getReachableNodeIds(graph, startId);
    if (reachableIds.length <= 1) {
      console.warn('GraphService.findAnchorNode: only start node reachable');
      return null;
    }

    const targetDist = desiredDistance * 0.5;
    const minDist = targetDist * (1 - tolerance);
    const maxDist = targetDist * (1 + tolerance);

    let bestNodeId: string | null = null;
    let bestError = Infinity;

    for (const id of reachableIds) {
      if (id === startId) continue;

      const n = graph.nodes[id];
      const d = haversineDistance(start.lat, start.lon, n.lat, n.lon);
      const error = Math.abs(d - targetDist);

      if (d >= minDist && d <= maxDist && error < bestError) {
        bestError = error;
        bestNodeId = id;
      }
    }

    if (!bestNodeId) {
      console.warn(
        'GraphService.findAnchorNode: no node found in distance band, falling back to farthest reachable'
      );
      // Fallback: weitester erreichbarer Node
      let farthestId: string | null = null;
      let farthest = 0;
      for (const id of reachableIds) {
        if (id === startId) continue;
        const n = graph.nodes[id];
        const d = haversineDistance(start.lat, start.lon, n.lat, n.lon);
        if (d > farthest) {
          farthest = d;
          farthestId = id;
        }
      }
      return farthestId;
    }

    return bestNodeId;
  }


  combineRoutes(out: RouteResult | null, back: RouteResult | null): RouteResult | null {
    if (!out || !back) {
      console.warn('combineRoutes: one of the routes is null', { out, back });
      return null;
    }

    const nodes = [...out.nodes];
    const backNodes = back.nodes.slice(1);
    nodes.push(...backNodes);

    const edges = [...out.edges, ...back.edges];
    const polyline: [number, number][] = [
      ...out.polyline,
      ...back.polyline.slice(1),
    ];

    const totalCost = out.totalCost + back.totalCost;

    return { nodes, edges, polyline, totalCost };
  }

  getReachableNodeIds(graph: Graph, startId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [];

    visited.add(startId);
    queue.push(startId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const neighbors = graph.adjacency[currentId] ?? [];

      for (const edge of neighbors) {
        const nextId = edge.to;
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }

    return Array.from(visited);
  }


}
