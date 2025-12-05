// src/app/core/models/weight.model.ts

export interface WeightConfig {
  // --- Basis-Attribute (Wegbeschaffenheit) ---
  pedestrianFriendly: number; // Priorisiert Fußwege/Pfade vor Straßen
  pathWidth: number;          // Bevorzugt breitere Wege
  difficulty: number;         // SAC Scale (Wanderskala) & allgemeine Begehbarkeit
  slipRisk: number;           // Oberflächenbeschaffenheit (Surface/Smoothness)

  // --- Topologie ---
  maxSlope: number;           // Bestraft starke Steigungen
  pathCurvature: number;      // Bevorzugt kurvige vs. schnurgerade Wege (für Spaziergang-Charakter)
}

export interface WeightMatrix {
  id: string;
  name: string;
  description?: string;
  weights: WeightConfig;
}
