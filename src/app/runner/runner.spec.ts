import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Runner } from './runner';

describe('Runner', () => {
  let component: Runner;
  let fixture: ComponentFixture<Runner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Runner]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Runner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
