// core/config/weight-matrices.ts


import {WeightMatrix} from '../models/weight.model';

export const WEIGHT_MATRICES: WeightMatrix[] = [
  {
    id: 'matrix_1',
    name: 'Profil 1 – Gleich gewichtet',
    description:
      'Alles gleich gewichtet.',
    weights: {
      pedestrianFriendly: 1,           // Fußgängerfreundliche Wege
      pathWidth: 1,                    // Wegbreite
      pathCurvature: 1,                // Linienführung der Wege
      overtakeOptions: 1,              // Überholmöglichkeiten

      treeShade: 1,                    // Baumdichte / Schatten
      vegetationNoiseDampening: 1,     // Vegetationsbasierte Schalldämpfung
      lightShadow: 1,                  // Licht- und Schattenwirkung
      seating: 1,                      // Sitzgelegenheiten
      shelter: 1,                      // Wetterschutz

      safeCrossings: 1,                // Sichere Querungen
      maxSlope: 1,                     // Maximale Steigung
      seasonalVegetation: 1,           // Jahreszeitliche Wirkung der Vegetation
      viewWindows: 1,                  // Blickfenster

      difficulty: 1,                   // Schwierigkeit
      slipRisk: 1,                     // Rutschrisiko
    },
  },
  {
    id: 'matrix_2',
    name: 'Profil 2 – Fokus auf Atmosphäre & Vegetation',
    description:
      'Hohe Gewichtung auf Schatten, Vegetation, Lichtwirkung, Jahreszeitenwirkung und Blickfenster.',
    weights: {
      pedestrianFriendly: 0.4,          // Fußgängerfreundliche Wege
      pathWidth: 0.4,                   // Wegbreite
      pathCurvature: 0.7,               // Linienführung der Wege
      overtakeOptions: 0.4,             // Überholmöglichkeiten

      treeShade: 0.9,                   // Baumdichte / Schatten
      vegetationNoiseDampening: 0.8,    // Vegetationsbasierte Schalldämpfung
      lightShadow: 0.9,                 // Licht- und Schattenwirkung
      seating: 0.8,                     // Sitzgelegenheiten
      shelter: 0.4,                     // Wetterschutz

      safeCrossings: 0.4,               // Sichere Querungen
      maxSlope: 0.3,                    // Maximale Steigung
      seasonalVegetation: 1.0,          // Jahreszeitliche Wirkung der Vegetation
      viewWindows: 0.9,                 // Blickfenster

      difficulty: 0.3,                  // Schwierigkeit
      slipRisk: 0.3,                    // Rutschrisiko
    },
  },
  {
    id: 'matrix_3',
    name: 'Profil 3 – Fokus auf Sicherheit & Schwierigkeit',
    description:
      'Starker Fokus auf sichere Querungen, Steigung, Schwierigkeit und Rutschrisiko.',
    weights: {
      pedestrianFriendly: 0.6,          // Fußgängerfreundliche Wege
      pathWidth: 0.6,                   // Wegbreite
      pathCurvature: 0.4,               // Linienführung der Wege
      overtakeOptions: 0.4,             // Überholmöglichkeiten

      treeShade: 0.3,                   // Baumdichte / Schatten
      vegetationNoiseDampening: 0.3,    // Vegetationsbasierte Schalldämpfung
      lightShadow: 0.3,                 // Licht- und Schattenwirkung
      seating: 0.3,                     // Sitzgelegenheiten
      shelter: 0.3,                     // Wetterschutz

      safeCrossings: 1.0,               // Sichere Querungen
      maxSlope: 0.9,                    // Maximale Steigung
      seasonalVegetation: 0.3,          // Jahreszeitliche Wirkung der Vegetation
      viewWindows: 0.3,                 // Blickfenster

      difficulty: 0.9,                  // Schwierigkeit
      slipRisk: 0.8,                    // Rutschrisiko
    },
  }
];
