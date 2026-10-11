import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RadiusFigures from '../RadiusFigures';

const profile = { population: 12345, households: 4567, outputAreas: 42, attribution: 'Source: ONS' };

describe('RadiusFigures — every state is visible + diagnostic', () => {
  it('ok: shows population + households that re-sum, and diagnostic', () => {
    const { getByText, container } = render(<RadiusFigures state="ok" http={200} profile={profile} radiusM={1609} unit="mi" />);
    expect(getByText('12,345')).toBeTruthy();   // population
    expect(getByText('4,567')).toBeTruthy();     // households
    expect(container.textContent).toMatch(/42 areas/);
    expect(container.textContent).toMatch(/radius: ok \(200\)/);
  });

  it('loading: shows a counting message', () => {
    const { container } = render(<RadiusFigures state="loading" http={null} radiusM={1000} unit="mi" />);
    expect(container.textContent).toMatch(/Counting people/i);
    expect(container.textContent).toMatch(/radius: loading/);
  });

  it('unconfigured (200): shows the not-switched-on note', () => {
    const { container } = render(<RadiusFigures state="unconfigured" http={200} radiusM={1000} unit="mi" />);
    expect(container.textContent).toMatch(/aren’t switched on yet/i);
    expect(container.textContent).toMatch(/radius: unconfigured \(200\)/);
  });

  it('locked (403): shows the paid add-on note', () => {
    const { container } = render(<RadiusFigures state="locked" http={403} radiusM={1000} unit="mi" />);
    expect(container.textContent).toMatch(/paid Neighbourhood Insights/i);
    expect(container.textContent).toMatch(/radius: locked \(403\)/);
  });

  it('error (404): shows the couldn’t-load note and the code', () => {
    const { container } = render(<RadiusFigures state="error" http={404} radiusM={1000} unit="mi" />);
    expect(container.textContent).toMatch(/Couldn’t load/i);
    expect(container.textContent).toMatch(/radius: error \(404\)/);
  });

  it('no numbers are shown unless state is ok', () => {
    const { queryByText } = render(<RadiusFigures state="unconfigured" http={200} profile={profile} radiusM={1000} unit="mi" />);
    expect(queryByText('12,345')).toBeNull();
  });
});
