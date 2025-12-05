// runner.ts

import {Component, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouteResult} from '../core/models/route.model';
import {OsmService} from '../core/services/osm.service';
import {GreedyBestFirstRunner} from '../algorithms/heuristic/greedy-best-first';
import {BeamSearchRunner} from '../algorithms/heuristic/beam-search';
import {Map} from '../features/map/map';
import {WeightMatrixService} from '../core/services/weight-matrix.service';
import {GraphService} from '../core/services/graph.service';
import {SimulatedAnnealingRunner} from '../algorithms/stochastic/simulated-annealing';
import {GraphNode} from '../core/models/graph.model';
import {DijkstraRunner} from '../algorithms/classic/dijkstra';
import {RoundPathService} from '../algorithms/classic/round-path.service';
import {RoundAStarService} from '../algorithms/classic/round-astar.service';
import {calculateRouteMetrics} from '../core/utils/cost.util';

@Component({
  selector: 'app-runner',
  imports: [
    Map,
    CommonModule
  ],
  templateUrl: './runner.html',
  styleUrl: './runner.css',
  standalone: true
})
export class Runner {

  graphService: GraphService = inject(GraphService);
  private readonly dijkstraRunner = inject(DijkstraRunner);
  private readonly roundService = inject(RoundPathService);
  private readonly roundAStarService = inject(RoundAStarService);

  currentRoute: RouteResult | null = null;
  currentStartNode: GraphNode | null = null;
  currentQuality: number | null = null;
  desiredDistance: number = 3000;

  //Central Park
  params = {lat:  40.7829, lon: -73.9654, radius: this.desiredDistance};

  //Timesquare
  //params = {lat:  40.7580, lon: -73.9855, radius: this.desiredDistance};

  //komplexes Wohngebiet
  //params = {lat:  33.6051, lon: -112.2857, radius: this.desiredDistance};

  constructor(
    private osmService: OsmService,
    private weightMatrixService: WeightMatrixService,
    private greedyRunner: GreedyBestFirstRunner,
    private beamRunner: BeamSearchRunner,
    private saRunner: SimulatedAnnealingRunner
  ) {}

  private resetView() {
    this.currentRoute = null;
    this.currentStartNode = null;
    this.currentQuality = null;
  }

  // Ausschnitt aus runner.ts -> analyzeRoute Methode

  private analyzeRoute(route: RouteResult | null, algoName: string, weights: any) {
    if (!route) {
      console.warn(`[${algoName}] Keine Route gefunden.`);
      return;
    }

    // ACHTUNG: calculateRouteQuality in cost.util.ts muss nun auch angepasst sein,
    // damit es nicht auf alte Felder zugreift! (Habe ich oben erledigt)
    // Da wir calculateRouteQuality oben im cost.util nicht explizit gepostet haben,
    // hier der Hinweis: Die Funktion nutzt 'edgeQualityScore', und das habe ich oben
    // auf die neuen Felder umgestellt. Es passt also.

    const metrics = calculateRouteMetrics(route.edges);
    route.metrics = metrics;
    this.currentRoute = route;

    console.group(`🏁 Ergebnis: ${algoName}`);
    console.log(`Gesamtdistanz: ${metrics.totalDistance} m`);

    const pct = (val: number) => (val * 100).toFixed(1) + '%';

    // Schlanke Tabelle
    console.table({
      '--- WEGQUALITÄT ---': '',
      'Fußgängerfreundlichkeit': pct(metrics.avgPedestrianFriendly),
      'Wegbreite (Score)': pct(metrics.avgPathWidth),
      'Bodenbelag (Rutschfestigkeit)': pct(metrics.avgSlipRisk),
      'Schwierigkeit (Leichtigkeit)': pct(metrics.avgDifficulty),
      'Flachheit (Keine Steigung)': pct(metrics.avgMaxSlope),
    });
    console.groupEnd();
  }

  runGreedy() {
    this.resetView();
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);


    this.osmService.fetchGraph(this.params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, this.params.lat, this.params.lon);
      this.currentStartNode = graph.nodes[startId!];

      const anchorId = this.graphService.findAnchorNode(graph, startId!, this.desiredDistance);

      const out = this.greedyRunner.run(graph, startId!, anchorId!, weights);
      const back = this.greedyRunner.run(graph, anchorId!, startId!, weights);

      const res = this.graphService.combineRoutes(out!, back!);
      this.analyzeRoute(res, 'Greedy Best-First', weights);
    });
  }

  runBeam() {
    this.resetView();
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    this.osmService.fetchGraph(this.params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, this.params.lat, this.params.lon);
      this.currentStartNode = graph.nodes[startId!];

      const anchorId = this.graphService.findAnchorNode(graph, startId!, this.desiredDistance);

      const out = this.beamRunner.run(graph, startId!, anchorId!, weights);
      const back = this.beamRunner.run(graph, anchorId!, startId!, weights);

      let res = null;
      if (out && back) {
        res = this.graphService.combineRoutes(out, back);
      } else {
        console.warn('runBeam: out or back is null');
      }
      this.analyzeRoute(res, 'Beam Search', weights);
    });
  }

  runSA() {
    this.resetView();
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    this.osmService.fetchGraph(this.params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, this.params.lat, this.params.lon);
      if (!startId) {
        console.error('Kein Startknoten gefunden');
        return;
      }
      this.currentStartNode = graph.nodes[startId];

      const attemptFactors = [1.5, 2.2, 3.0, 4.0, 5.0, 6.0];

      let finalRoute: RouteResult | null = null;
      let bestFallbackRoute: RouteResult | null = null;
      let smallestDiff = Infinity;

      for (const factor of attemptFactors) {
        const anchorId = this.graphService.findAnchorNode(graph, startId, this.desiredDistance, 0.25, factor);
        if (!anchorId) continue;

        const out = this.saRunner.run(graph, startId, anchorId, weights);

        const avoidEdges = new Set<string>();
        if (out) {
          out.edges.forEach(e => {
            avoidEdges.add(e.id);
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
          if (!combined || combined.totalDistance == null) continue;

          const dist = combined.totalDistance;
          const diff = Math.abs(dist - this.desiredDistance);

          if (diff < smallestDiff) {
            smallestDiff = diff;
            bestFallbackRoute = combined;
          }

          const minValid = this.desiredDistance * 0.8;
          const maxValid = this.desiredDistance * 1.2;

          if (dist >= minValid && dist <= maxValid) {
            finalRoute = combined;
            break;
          }
        }
      }

      const resultRoute = finalRoute || bestFallbackRoute;
      if (!resultRoute) {
        console.error('[SA] Kritischer Fehler: Gar keine Route generierbar.');
      }
      this.analyzeRoute(resultRoute, 'Simulated Annealing', weights);
    });
  }


  runRoundDijkstra() {
    this.resetView();
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    this.osmService.fetchGraph(this.params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, this.params.lat, this.params.lon);
      if (!startId) return;

      this.currentStartNode = graph.nodes[startId];

      const res = this.roundService.buildRoundRoute(graph, startId, this.desiredDistance, weights);
      this.analyzeRoute(res, 'Dijkstra Roundtrip', weights);
    });
  }

  runRoundAStar() {
    this.resetView();
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);

    this.osmService.fetchGraph(this.params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, this.params.lat, this.params.lon);
      if (!startId) {
        console.warn("Startpunkt nicht gefunden");
        return;
      }

      this.currentStartNode = graph.nodes[startId];

      console.info('Starte A* Rundweg Berechnung...');
      const res = this.roundAStarService.buildRoundRoute(graph, startId, this.desiredDistance, weights);

      if (!res) {
        console.warn("A* Rundweg konnte nicht generiert werden");
      }
      this.analyzeRoute(res, 'A* Roundtrip', weights);
    });
  }
}
