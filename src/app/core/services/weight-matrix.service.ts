// core/services/weight-matrix.service.ts

import { Injectable } from '@angular/core';
import { WEIGHT_MATRICES } from '../config/weight-matrices';
import {WeightConfig, WeightMatrix} from '../models/weight.model';

@Injectable({ providedIn: 'root' })
export class WeightMatrixService {
  getAll(): WeightMatrix[] {
    return WEIGHT_MATRICES;
  }

  getById(id: string): WeightMatrix | undefined {
    return WEIGHT_MATRICES.find((m) => m.id === id);
  }

  getDefault(): WeightMatrix {
    return WEIGHT_MATRICES[0];
  }

  cloneWeights(weights: WeightConfig): WeightConfig {
    return JSON.parse(JSON.stringify(weights));
  }
}
