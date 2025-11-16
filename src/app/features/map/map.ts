import {AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild} from '@angular/core';
import {RouteResult} from '../../core/models/route.model';
import * as L from 'leaflet';

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

  private map!: L.Map;
  private routeLayer?: L.Polyline;

  ngAfterViewInit(): void {
    this.initMap();
    if (this.route) {
      this.showRoute(this.route);
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [51.7189, 8.7575], // Paderborn
      zoom: 14,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
  }

  /**
   * Wird aufgerufen, wenn ihr eine neue Route über @Input() reinreicht.
   */
  ngOnChanges(): void {
    if (this.map && this.route) {
      this.showRoute(this.route);
    }
  }

  private showRoute(route: RouteResult) {
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    this.routeLayer = L.polyline(route.polyline, {
      weight: 5,
      opacity: 0.8,
      color: 'blue',
    }).addTo(this.map);

    this.map.fitBounds(this.routeLayer.getBounds(), {
      padding: [20, 20],
    });
  }
}
