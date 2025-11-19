// core/models/algorithm-runner.model.ts

import { Graph } from './graph.model';
import {WeightConfig} from './weight.model';
import {RouteResult} from './route.model';

export interface AlgorithmRunner {
  id: string;
  name: string;

  run(
    graph: Graph,
    startId: string,
    targetId: string,
    weights: WeightConfig,
    avoidEdges?: Set<string>
  ): RouteResult | null;
}
