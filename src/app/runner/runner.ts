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
import {AntColonyOptimizationRunner} from '../algorithms/stochastic/ant-colony-optimization';
import { DijkstraRunner } from '../algorithms/classic/dijkstra';
import { RoundPathService } from '../algorithms/classic/round-path.service';
import { RoundAStarService } from '../algorithms/classic/round-astar.service'; // <--- NEU

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
  private readonly dijkstraRunner = inject(DijkstraRunner);
  private readonly roundService = inject(RoundPathService);
  private readonly roundAStarService = inject(RoundAStarService); // <--- NEU

  currentRoute: RouteResult | null = null;

  currentStartNode: GraphNode | null = null;

  constructor(
    private osmService: OsmService,
    private weightMatrixService: WeightMatrixService,
    private greedyRunner: GreedyBestFirstRunner,
    private beamRunner: BeamSearchRunner,
    private saRunner: SimulatedAnnealingRunner,
    private acoRunner: AntColonyOptimizationRunner
  ) {}

  runGreedy() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 3000;
    const params = {lat: 51.7189, lon: 8.7575, radius: 2000};

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      const anchorId = this.graphService.findAnchorNode(graph, startId!, desiredDistance);

      const out = this.greedyRunner.run(graph, startId!, anchorId!, weights);
      const back = this.greedyRunner.run(graph, anchorId!, startId!, weights);
      this.currentRoute = this.graphService.combineRoutes(out!, back!);
      this.currentStartNode = graph.nodes[startId!];
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
        console.warn('runBeam: out or back is null');
        this.currentRoute = null;
        return;
      }
      this.currentRoute = this.graphService.combineRoutes(out, back);
      this.currentStartNode = graph.nodes[startId!];
    });
  }

  runSA() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 3000;
    const params = { lat: 51.7189, lon: 8.7575, radius: 2000 };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) {
        console.error('Kein Startknoten gefunden');
        return;
      }

      const attemptFactors = [1.5, 2.2, 3.0, 4.0, 5.0, 6.0];

      let finalRoute: RouteResult | null = null;
      let finalAnchorId: string | null = null;

      // --- NEU: Fallback-Speicher für die "beste schlechte" Route ---
      let bestFallbackRoute: RouteResult | null = null;
      let bestFallbackAnchorId: string | null = null;
      let smallestDiff = Infinity; // Die kleinste Abweichung vom Ziel (3000m)

      for (const factor of attemptFactors) {
        console.log(`[SA] Versuche Faktor: ${factor}`);

        const anchorId = this.graphService.findAnchorNode(graph, startId, desiredDistance, 0.25, factor);
        if (!anchorId) continue;

        // Hinweg
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

        // Rückweg
        const back = this.saRunner.run(graph, anchorId, startId, weights, avoidEdges);

        if (out && back) {
          const combined = this.graphService.combineRoutes(out, back);

          // Sicherheitscheck, falls totalDistance fehlt oder null ist
          if (!combined || combined.totalDistance == null) continue;

          const dist = combined.totalDistance;
          const diff = Math.abs(dist - desiredDistance);

          // --- NEU: 1. Fallback aktualisieren ---
          // Ist diese Route besser (näher am Ziel) als unser bisheriger Favorit?
          if (diff < smallestDiff) {
            smallestDiff = diff;
            bestFallbackRoute = combined;
            bestFallbackAnchorId = anchorId;
          }

          // 2. Strict Check: Toleranzbereich +/- 20%
          const minValid = desiredDistance * 0.8;
          const maxValid = desiredDistance * 1.2;

          if (dist >= minValid && dist <= maxValid) {
            finalRoute = combined;
            finalAnchorId = anchorId;
            console.log(`[SA] Treffer! Länge: ${dist.toFixed(0)}m (Ziel: ${desiredDistance}m)`);
            break; // Perfekt, Schleife beenden
          } else {
            console.warn(`[SA] Nicht im Zielbereich (${dist.toFixed(0)}m). Diff: ${diff.toFixed(0)}m. Nächster Versuch...`);
          }
        }
      }

      // --- NEU: Entscheidung am Ende (Perfekt > Fallback > Nichts) ---
      this.currentStartNode = graph.nodes[startId];

      if (finalRoute) {
        // Fall A: Perfekte Route gefunden
        this.currentRoute = finalRoute;
      }
      else if (bestFallbackRoute) {
        // Fall B: Keine perfekte, aber wir nehmen die beste, die wir haben
        console.warn(`[SA] Keine perfekte Route gefunden. Nehme beste Näherung (${bestFallbackRoute.totalDistance?.toFixed(0)}m).`);
        this.currentRoute = bestFallbackRoute;
      }
      else {
        // Fall C: Gar nichts gefunden (sehr unwahrscheinlich)
        console.error('[SA] Kritischer Fehler: Gar keine Route generierbar.');
        this.currentRoute = null;
      }
    });
  }

  runACO() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 3000;
    const params = { lat: 51.7189, lon: 8.7575, radius: 2000 };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) return;

      const anchorId = this.graphService.findAnchorNode(graph, startId, desiredDistance);
      if (!anchorId) return;

      // Hinweg
      const out = this.acoRunner.run(graph, startId, anchorId, weights);

      // Rückweg mit Vermeidung
      const avoidEdges = new Set<string>();
      if (out) {
        out.edges.forEach(e => {
          avoidEdges.add(e.id);
          // Reverse Edge auch vermeiden
          const parts = e.id.split('_');
          if (parts.length === 3) {
            const reverseId = `${parts[0]}_${parts[2]}_${parts[1]}`;
            avoidEdges.add(reverseId);
          }
        });
      }

      const back = this.acoRunner.run(graph, anchorId, startId, weights, avoidEdges);

      if (out && back) {
        this.currentRoute = this.graphService.combineRoutes(out, back);
        this.currentStartNode = graph.nodes[startId];
      }
    });
  }

  runDijkstra() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 3000;
    const params = { lat: 40.7829, lon: -73.9654, radius: desiredDistance }; // Achtung: Koordinaten sind hier hardcoded New York

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) return;

      const anchorId = this.graphService.findAnchorNode(graph, startId, desiredDistance);
      const out = this.dijkstraRunner.run(graph, startId, anchorId!, weights);
      const back = this.dijkstraRunner.run(graph, anchorId!, startId, weights);

      if (!out || !back) return;
      this.currentRoute = this.graphService.combineRoutes(out, back);
    });
  }

  runRoundDijkstra() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 8000;
    const params = { lat: 40.7829, lon: -73.9654, radius: desiredDistance };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) return;

      const res = this.roundService.buildRoundRoute(graph, startId, desiredDistance, weights);
      if (res) this.currentRoute = res;
    });
  }

  // --- NEU: A* Rundweg ---

  runRoundAStar() {
    const matrix = this.weightMatrixService.getDefault();
    const weights = this.weightMatrixService.cloneWeights(matrix.weights);
    const desiredDistance = 8000; // 3 km Runde

    // Hier verwende ich deine Paderborn-Koordinaten aus den anderen Methoden,
    // passe dies ggf. an, wenn du New York (Central Park) nutzen willst.
    const params = { lat: 40.7829, lon: -73.9654, radius: desiredDistance };

    this.osmService.fetchGraph(params).subscribe(graph => {
      const startId = this.graphService.findNearestNode(graph, params.lat, params.lon);
      if (!startId) {
        console.warn("Startpunkt nicht gefunden");
        return;
      }

      console.info('Starte A* Rundweg Berechnung...');
      const res = this.roundAStarService.buildRoundRoute(graph, startId, desiredDistance, weights);

      if (!res) {
        console.warn("A* Rundweg konnte nicht generiert werden");
        return;
      }

      this.currentRoute = res;
      console.info('A* Rundweg fertig:', res);
    });
  }
}
