import {Component, inject} from '@angular/core';
import {RouteResult} from '../core/models/route.model';
import {OsmService} from '../core/services/osm.service';
import {GreedyBestFirstRunner} from '../algorithms/heuristic/greedy-best-first';
import {BeamSearchRunner} from '../algorithms/heuristic/beam-search';
import {Map} from '../features/map/map';
import {WeightMatrixService} from '../core/services/weight-matrix.service';
import {GraphService} from '../core/services/graph.service';
import {SimulatedAnnealingRunner} from '../algorithms/stochastic/simulated-annealing';
import {GraphNode} from '../core/models/graph.model';

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

  currentStartNode: GraphNode | null = null;
  currentAnchorNode: GraphNode | null = null;

  constructor(
    private osmService: OsmService,
    private weightMatrixService: WeightMatrixService,
    private greedyRunner: GreedyBestFirstRunner,
    private beamRunner: BeamSearchRunner,
    private saRunner: SimulatedAnnealingRunner
  ) {}

  runGreedy() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    const desiredDistance = 3000; // 3 km Spaziergang

    const params = {lat: 51.7189, lon: 8.7575, radius: 2000};

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);

      const anchorId = this.graphService.findAnchorNode(graph, startId!, desiredDistance);
      console.log(startId);
      console.log(anchorId);
      const out = this.greedyRunner.run(graph, startId!, anchorId!, weights);
      const back = this.greedyRunner.run(graph, anchorId!, startId!, weights);
      this.currentRoute = this.graphService.combineRoutes(out!, back!);
      this.currentStartNode = graph.nodes[startId!];
      this.currentAnchorNode = graph.nodes[anchorId!];
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
      this.currentStartNode = graph.nodes[startId!];
      this.currentAnchorNode = graph.nodes[anchorId!];
    });
  }

  runSA() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 3000;
    const params = { lat: 51.7189, lon: 8.7575, radius: 2000 };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) return;

      const attemptFactors = [1.5, 2.2, 3.0, 4.0, 5.0, 6.0];
      let finalRoute: RouteResult | null = null;
      let finalAnchorId;
      for (const factor of attemptFactors) {
        console.log(`[SA] Versuche Faktor: ${factor}`);

        const anchorId = this.graphService.findAnchorNode(graph, startId, desiredDistance, 0.25, factor);
        if (!anchorId) continue;
        finalAnchorId = anchorId;

        // SA ist stochastisch - kann sein, dass wir hier mehrmals probieren wollen,
        // aber für die Längenkontrolle reicht einmal pro Anker.
        const out = this.saRunner.run(graph, startId, anchorId, weights);
        const avoidEdges = new Set<string>();
        if (out) {
          out.edges.forEach(e => {
            // Die genutzte Kante blockieren
            avoidEdges.add(e.id);

            // WICHTIG: Auch die RÜCK-RICHTUNG blockieren!
            // Deine ID-Struktur ist: wayID_fromID_toID
            // Wir bauen: wayID_toID_fromID
            const parts = e.id.split('_');
            if (parts.length === 3) {
              const reverseId = `${parts[0]}_${parts[2]}_${parts[1]}`;
              avoidEdges.add(reverseId);
            }
          });
        }
        const back = this.saRunner.run(graph, anchorId, startId, weights, avoidEdges);

        if (out && back) {
          const combined = this.graphService.combineRoutes(out, back);

          if (combined && combined.totalDistance! <= desiredDistance * 1.2) {
            finalRoute = combined;
            console.log(`[SA] Treffer! Länge: ${combined.totalDistance}m`);
            break;
          } else {
            console.warn(`[SA] Zu lang (${combined?.totalDistance}m). Nächster Versuch...`);
          }
        }
      }
      this.currentRoute = finalRoute;
      this.currentStartNode = graph.nodes[startId!];
      this.currentAnchorNode = graph.nodes[finalAnchorId!];
    });
  }
}
