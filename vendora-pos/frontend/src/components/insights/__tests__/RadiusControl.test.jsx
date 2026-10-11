import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RadiusControl from '../RadiusControl';

const BOUNDS = { min: 250, max: 5000 };

describe('RadiusControl — slider vs map-zoom mode (2026-10-11)', () => {
  it('without setMode: no mode toggle, slider shown (backward-compatible for the paid view)', () => {
    const { container, queryByText } = render(
      <RadiusControl unit="mi" setUnit={() => {}} radiusM={1000} setRadiusM={() => {}} bounds={BOUNDS} />,
    );
    expect(queryByText('Map zoom')).toBeNull();          // no toggle
    expect(container.querySelector('input[type="range"]')).toBeTruthy(); // slider present
  });

  it('slider mode: shows the slider + presets, hides the map hint', () => {
    const { container, getByText, queryByText } = render(
      <RadiusControl unit="mi" setUnit={() => {}} radiusM={1000} setRadiusM={() => {}} bounds={BOUNDS} mode="slider" setMode={() => {}} />,
    );
    expect(getByText('Slider')).toBeTruthy();
    expect(getByText('Map zoom')).toBeTruthy();
    expect(container.querySelector('input[type="range"]')).toBeTruthy();   // slider present
    expect(queryByText(/Zoom the map in or out/i)).toBeNull();             // no map hint
  });

  it('map mode: hides the slider/presets and shows the zoom hint', () => {
    const { container, getByText } = render(
      <RadiusControl unit="mi" setUnit={() => {}} radiusM={1000} setRadiusM={() => {}} bounds={BOUNDS} mode="map" setMode={() => {}} />,
    );
    expect(container.querySelector('input[type="range"]')).toBeNull();     // slider hidden
    expect(getByText(/Zoom the map in or out/i)).toBeTruthy();             // hint shown
  });

  it('clicking the toggle calls setMode with the chosen mode', () => {
    const setMode = vi.fn();
    const { getByText } = render(
      <RadiusControl unit="mi" setUnit={() => {}} radiusM={1000} setRadiusM={() => {}} bounds={BOUNDS} mode="slider" setMode={setMode} />,
    );
    fireEvent.click(getByText('Map zoom'));
    expect(setMode).toHaveBeenCalledWith('map');
  });

  it('always shows the current radius label and the unit toggle', () => {
    const { getByText } = render(
      <RadiusControl unit="mi" setUnit={() => {}} radiusM={1609} setRadiusM={() => {}} bounds={BOUNDS} mode="map" setMode={() => {}} />,
    );
    expect(getByText(/Radius — 1\.00 mi/)).toBeTruthy(); // 1609 m ≈ 1.00 mi
    expect(getByText('km')).toBeTruthy();                // unit toggle still present in map mode
  });
});
