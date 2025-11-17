import {Component, inject} from '@angular/core';
import {RouteResult} from '../core/models/route.model';
import {OsmService} from '../core/services/osm.service';
import {GreedyBestFirstRunner} from '../algorithms/heuristic/greedy-best-first';
import {BeamSearchRunner} from '../algorithms/heuristic/beam-search';
import {Map} from '../features/map/map';
import {WeightMatrixService} from '../core/services/weight-matrix.service';
import {GraphService} from '../core/services/graph.service';

@Component({
  selector: 'app-runner',
  imports: [
    Map
  ],
  templateUrl: './runner.html',
  styleUrl: './runner.css',
  standalone: true
})
export class Runner {

  graphService: GraphService = inject(GraphService);

  currentRoute: RouteResult | null = null;

  constructor(
    private osmService: OsmService,
    private weightMatrixService: WeightMatrixService,
    private greedyRunner: GreedyBestFirstRunner,
    private beamRunner: BeamSearchRunner
  ) {}

  runGreedy() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    const desiredDistance = 10000; // 3 km Spaziergang

    const params = {lat: 51.7189, lon: 8.7575, radius: 2000};

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);

      const anchorId = this.graphService.findAnchorNode(graph, startId!, desiredDistance);
      console.log(startId);
      console.log(anchorId);
      const out = this.greedyRunner.run(graph, startId!, anchorId!, weights);
      const back = this.greedyRunner.run(graph, anchorId!, startId!, weights);
      this.currentRoute = this.graphService.combineRoutes(out!, back!);
      console.log(this.currentRoute);
    });
  }

  runBeam() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    const desiredDistance = 3000;
    const params = { lat: 51.7189, lon: 8.7575, radius: 2000 };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      const anchorId = this.graphService.findAnchorNode(graph, startId!, desiredDistance);

      const out = this.beamRunner.run(graph, startId!, anchorId!, weights);
      const back = this.beamRunner.run(graph, anchorId!, startId!, weights);

      if (!out || !back) {
        console.warn('runBeam: out or back is null', { out, back });
        this.currentRoute = null;
        return;
      }

      this.currentRoute = this.graphService.combineRoutes(out, back);
    });
  }
}
