// src/app/core/utils/geometry.utils.ts

import { GraphNode } from '../models/graph.model';

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Erdradius in Metern
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function distanceBetweenNodes(a: GraphNode, b: GraphNode): number {
  return haversineDistance(a.lat, a.lon, b.lat, b.lon);
}

export function slopePercent(
  elevationFrom: number,
  elevationTo: number,
  distanceMeters: number
): number {
  if (distanceMeters === 0) return 0;
  const diff = elevationTo - elevationFrom;
  return (diff / distanceMeters) * 100;
}

// --- NEU: Wichtig für die Park-Erkennung ---
/**
 * Prüft, ob ein Punkt (lat/lon) innerhalb eines Polygons liegt.
 * Ray-Casting Algorithmus.
 */
export function isPointInPolygon(lat: number, lon: number, polygon: {lat: number, lon: number}[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lon;
    const xj = polygon[j].lat, yj = polygon[j].lon;

    const intersect = ((yi > lon) !== (yj > lon))
      && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
