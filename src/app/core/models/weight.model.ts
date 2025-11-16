// core/models/weights.model.ts

/**
 * Gewichtungen 0..1 für verschiedene Kriterien.
 * Das ist nur ein Beispiel-Set – ihr könnt Felder ergänzen/entfernen.
 */
export interface WeightConfig {
  pedestrianFriendly: number;        // Fußgängerfreundliche Wege
  pathWidth: number;                 // Wegbreite
  pathCurvature: number;             // Linienführung der Wege
  overtakeOptions: number;           // Überholmöglichkeiten bei höherem Gehtempo

  treeShade: number;                 // Baumdichte / Schatten
  vegetationNoiseDampening: number;  // Vegetationsbasierte Schalldämpfung
  lightShadow: number;               // Licht- und Schattenwirkung entlang des Wegs
  seating: number;                   // Sitzgelegenheiten
  shelter: number;                   // Wetterschutz

  safeCrossings: number;             // Sichere Querungen
  maxSlope: number;                  // Maximale Steigung
  seasonalVegetation: number;        // Jahreszeitliche Wirkung der Vegetation
  viewWindows: number;               // Blickfenster zu Landmarken

  difficulty: number;                // Schwierigkeit (sac_scale, incline)
  slipRisk: number;                  // Rutschrisiko (surface, smoothness)
}

/**
 * Optional: Auswahl typischer Kriterien-Kategorien,
 * falls ihr im UI bestimmte Kriterien ein-/ausschalten wollt.
 */
export interface CriteriaSelection {
  useQuietness: boolean;
  useSportiness: boolean;
  useScenic: boolean;
}

export interface WeightMatrix {
  id: string;          // z.B. "default_safety"
  name: string;        // z.B. "Standard – Sicher & Komfortabel"
  description?: string;
  weights: WeightConfig;
}
