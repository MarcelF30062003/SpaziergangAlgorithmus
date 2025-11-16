import {Component, inject, OnInit} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {Map} from './features/map/map';
import {Runner} from './runner/runner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Map, Runner],
  templateUrl: './app.html',
  standalone: true,
  styleUrl: './app.css'
})
export class App{

}
