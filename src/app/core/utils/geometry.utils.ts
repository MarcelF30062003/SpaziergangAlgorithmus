// core/utils/geometry.util.ts

import { GraphNode } from '../models/graph.model';

/**
 * Haversine-Distanz in Metern.
 */
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

/**
 * Einfache Steigungsberechnung in %.
 * Erwartet Höhen in Metern, falls ihr ele-Tags habt.
 */
export function slopePercent(
  elevationFrom: number,
  elevationTo: number,
  distanceMeters: number
): number {
  if (distanceMeters === 0) return 0;
  const diff = elevationTo - elevationFrom;
  return (diff / distanceMeters) * 100;
}
