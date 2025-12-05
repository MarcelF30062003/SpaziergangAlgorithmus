// src/app/core/config/weight-matrices.ts

import { WeightMatrix } from '../models/weight.model';

export const WEIGHT_MATRICES: WeightMatrix[] = [
  {
    id: 'matrix_standard',
    name: 'Standard – Fokus auf Wegqualität',
    description: 'Optimiert auf gut begehbare Wege, vermeidet Straßen und schwieriges Gelände.',
    weights: {
      pedestrianFriendly: 1.0, // Wichtig: Weg vom Autoverkehr
      pathWidth: 0.5,          // Netter Bonus, aber nicht kriegsentscheidend
      difficulty: 0.8,         // Wir wollen entspannt spazieren, nicht klettern
      slipRisk: 0.8,           // Fester Untergrund bevorzugt

      maxSlope: 0.7,           // Zu steil ist anstrengend
      pathCurvature: 0.3       // Leicht gewichtet für etwas Abwechslung in der Linienführung
    },
  }
];
