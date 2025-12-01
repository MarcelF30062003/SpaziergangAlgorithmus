import {AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild} from '@angular/core';
import {RouteResult} from '../../core/models/route.model';
import * as L from 'leaflet';
import {GraphNode} from '../../core/models/graph.model';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class Map implements AfterViewInit, OnChanges {
  @ViewChild('map', { static: true }) mapContainer!: ElementRef;

  @Input() route?: RouteResult | null;

  // NEU: Inputs für Start und Ziel
  @Input() startNode?: GraphNode | null;
  @Input() anchorNode?: GraphNode | null;

  private map!: L.Map;

  // NEU: Layer für die Marker
  private startLayer?: L.CircleMarker;
  private routeLayer?: L.Polyline;
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
      center: [51.7189, 8.7575],
      zoom: 14,
      zoomControl: false, // Wir setzen den Zoom-Control manuell (optional, sieht oft cleaner aus)
    });

    // Zoom Control unten rechts, damit es nicht mit dem Header kollidiert
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // **MODERNER KARTENSTIL**: CartoDB Voyager
    // Viel sauberer als Standard-OSM, perfekt für Apps
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);
  }

  private updateView(): void {
    // 1. Route zeichnen
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = undefined;
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
      this.startLayer = undefined;
    }

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

    // 3. Ankerpunkt zeichnen
    if (this.anchorLayer) {
      this.map.removeLayer(this.anchorLayer);
      this.anchorLayer = undefined;
    }

    if (this.anchorNode) {
      this.anchorLayer = L.circleMarker([this.anchorNode.lat, this.anchorNode.lon], {
        color: 'white',       // Weißer Rand
        weight: 3,
        fillColor: '#f00',    // Leuchtendes Rot
        fillOpacity: 1,
        radius: 8
      }).addTo(this.map).bindPopup("Anker / Ziel");

      // WICHTIG: Nach vorne holen!
      this.anchorLayer.bringToFront();
    }
  }
}
