import {AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild} from '@angular/core';
import {RouteResult} from '../../core/models/route.model';
import * as L from 'leaflet';
import {GraphNode} from '../../core/models/graph.model';

@Component({
  selector: 'app-map',
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.css',
  standalone: true
})
export class Map implements AfterViewInit, OnChanges {
  @ViewChild('map', { static: true }) mapContainer!: ElementRef;

  @Input() route?: RouteResult | null;

  // NEU: Inputs für Start und Ziel
  @Input() startNode?: GraphNode | null;

  private map!: L.Map;
  private routeLayer?: L.Polyline;

  // NEU: Layer für die Marker
  private startLayer?: L.CircleMarker;
  private anchorLayer?: L.CircleMarker;

  ngAfterViewInit(): void {
    this.initMap();
    this.updateView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map) {
      this.updateView();
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [40.7829, -73.9654], // Central Park
      zoom: 14,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
  }

  private updateView(): void {
    // 1. Route zeichnen
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }
    if (this.route) {
      this.routeLayer = L.polyline(this.route.polyline, {
        weight: 5,
        opacity: 0.8,
        color: 'blue',
      }).addTo(this.map);

      // WICHTIG: Route nach hinten schieben, damit sie nichts verdeckt
      this.routeLayer.bringToBack();

      this.map.fitBounds(this.routeLayer.getBounds(), { padding: [20, 20] });
    }

    // 2. Startpunkt zeichnen
    if (this.startLayer) {
      this.map.removeLayer(this.startLayer);
    }
    console.log(this.startNode);
    if (this.startNode) {
      this.startLayer = L.circleMarker([this.startNode.lat, this.startNode.lon], {
        color: 'white',       // Weißer Rand für Kontrast
        weight: 3,            // Randbreite
        fillColor: '#0f0',    // Leuchtendes Grün innen
        fillOpacity: 1,
        radius: 8
      }).addTo(this.map).bindPopup("Start");

      // WICHTIG: Nach vorne holen!
      this.startLayer.bringToFront();
    }
  }
}
