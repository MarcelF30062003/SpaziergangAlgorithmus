// src/app/core/services/graph.service.ts

import {Injectable} from '@angular/core';
import { Graph, GraphEdge, GraphNode } from '../models/graph.model';
import { OverpassResponse, OverpassElement } from '../models/osm-overpass.model';
import {distanceBetweenNodes, haversineDistance, isPointInPolygon} from '../utils/geometry.utils';
import {estimateSafety, estimateShade} from '../utils/tag.utils';
import {RouteResult} from '../models/route.model';

@Injectable({
  providedIn: 'root',
})
export class GraphService {

  buildGraphFromOverpass(response: OverpassResponse): Graph {
    const nodeMap: Record<string, GraphNode> = {};
    const edges: GraphEdge[] = [];
    const adjacency: Record<string, GraphEdge[]> = {};

    const elements = response.elements || [];

    const osmNodes = elements.filter((el) => el.type === 'node');
    const osmWays = elements.filter((el) => el.type === 'way');
    const osmRelations = elements.filter((el) => el.type === 'relation');

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

    // --- 2. GRÜNFLÄCHEN EXTRAHIEREN (Kontext) ---
    const greenPolygons: Array<{ tags: any, coords: {lat: number, lon: number}[] }> = [];

    // A) Normale Flächen (Ways)
    for (const way of osmWays) {
      const t = way.tags || {};
      // Ist es eine relevante Fläche?
      const isGreen = t['landuse'] || t['leisure'] || (t['natural'] && t['natural'] !== 'tree');

      if (isGreen && way.nodes && way.nodes.length > 2) {
        // Koordinaten auflösen
        const coords = way.nodes
          .map(nid => nodeMap[nid.toString()])
          .filter(n => n !== undefined)
          .map(n => ({ lat: n.lat, lon: n.lon }));

        if (coords.length > 2) {
          greenPolygons.push({ tags: t, coords });
        }
      }
    }

    // B) Relationen (z.B. Central Park)
    for (const rel of osmRelations) {
      const t = rel.tags || {};
      const isGreen = t['landuse'] || t['leisure'] || (t['natural'] && t['natural'] !== 'tree');

      if (isGreen && rel.members) {
        const relCoords: {lat: number, lon: number}[] = [];
        for (const member of rel.members) {
          if (member.type === 'way' && member.role === 'outer') {
            const memberWay = osmWays.find(w => w.id === member.ref);
            if (memberWay && memberWay.nodes) {
              const wNodes = memberWay.nodes
                .map(nid => nodeMap[nid.toString()])
                .filter(n => n !== undefined)
                .map(n => ({ lat: n.lat, lon: n.lon }));
              relCoords.push(...wNodes);
            }
          }
        }
        if (relCoords.length > 2) {
          greenPolygons.push({ tags: t, coords: relCoords });
        }
      }
    }

    // --- 3. KANTEN (EDGES) BAUEN & ANREICHERN ---
    for (const way of osmWays) {
      if (!way.nodes || way.nodes.length < 2) continue;

      // Wir wollen nur Wege, keine Umrisse von Parks als Pfade (außer sie sind explizit Highways)
      if (!way.tags?.['highway']) continue;

      const wayTags = way.tags || {};
      const nodeIds = way.nodes.map((n) => n.toString());

      for (let i = 0; i < nodeIds.length - 1; i++) {
        const fromId = nodeIds[i];
        const toId = nodeIds[i + 1];

        const fromNode = nodeMap[fromId];
        const toNode = nodeMap[toId];

        if (!fromNode || !toNode) continue;

        const distance = distanceBetweenNodes(fromNode, toNode);

        // >> CONTEXT CHECK: Liegt dieser Weg in einer Grünfläche? <<
        const enrichedTags = { ...wayTags };

        // Optimierung: Wir prüfen nur den Startknoten
        for (const poly of greenPolygons) {
          if (isPointInPolygon(fromNode.lat, fromNode.lon, poly.coords)) {
            // Treffer! Kontext übertragen
            if (poly.tags['landuse']) enrichedTags['context_landuse'] = poly.tags['landuse'];
            if (poly.tags['leisure']) enrichedTags['context_leisure'] = poly.tags['leisure'];
            if (poly.tags['natural']) enrichedTags['context_natural'] = poly.tags['natural'];
            enrichedTags['is_inside_green'] = 'yes';
            break; // Erster Treffer genügt meistens
          }
        }

        const edgeId = `${way.id}_${fromId}_${toId}`;

        // Wir nutzen jetzt die angereicherten Tags für die Berechnung
        const edge: GraphEdge = {
          id: edgeId,
          from: fromId,
          to: toId,
          distance,
          tags: enrichedTags, // <--- WICHTIG: Hier sind jetzt die Kontext-Infos drin
          shade: estimateShade(enrichedTags),
          safety: estimateSafety(enrichedTags),
        };

        edges.push(edge);

        if (!adjacency[fromId]) adjacency[fromId] = [];
        adjacency[fromId].push(edge);

        // Bidirektional
        if (!this.isOneWay(way)) {
          const reverseId = `${way.id}_${toId}_${fromId}`;
          const reverseEdge: GraphEdge = {
            ...edge,
            id: reverseId,
            from: toId,
            to: fromId,
          };
          edges.push(reverseEdge);

          if (!adjacency[toId]) adjacency[toId] = [];
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

  private isOneWay(way: OverpassElement): boolean {
    const tags = way.tags || {};
    const oneway = tags['oneway'];
    if (oneway === 'yes' || oneway === 'true' || oneway === '1') return true;
    return false;
  }

  // ... (Die restlichen Methoden findNearestNode, findAnchorNode etc. bleiben unverändert)
  findNearestNode(graph: Graph, lat: number, lon: number): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const nodeId in graph.nodes) {
      const n = graph.nodes[nodeId];
      const d = Math.hypot(n.lat - lat, n.lon - lon);
      if (d < bestDist) {
        bestDist = d;
        bestId = nodeId;
      }
    }
    return bestId;
  }

  findAnchorNode(graph: Graph, startId: string, desiredDistance: number, tolerance: number = 0.25, factor?: number): string | null {
    const start = graph.nodes[startId];
    if (!start) return null;
    const reachableIds = this.getReachableNodeIds(graph, startId);
    if (reachableIds.length <= 1) return null;

    let targetDist = factor ? (desiredDistance * 0.5) / factor : desiredDistance * 0.5;
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

    // Fallback: weitester Punkt
    if (!bestNodeId) {
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
    if (!out || !back) return null;
    const nodes = [...out.nodes];
    const backNodes = back.nodes.slice(1);
    nodes.push(...backNodes);
    const edges = [...out.edges, ...back.edges];
    const polyline: [number, number][] = [...out.polyline, ...back.polyline.slice(1)];
    const totalCost = out.totalCost + back.totalCost;
    const totalDistance = (out.totalDistance || 0) + (back.totalDistance || 0);
    return { nodes, edges, polyline, totalCost, totalDistance };
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
