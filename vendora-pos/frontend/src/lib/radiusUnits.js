// Shared radius units for the catchment map (used by the free "Your area" card and the paid Insights view).
// Owners think in miles (UK retail) by default, with a km toggle; presets are in the chosen unit and a slider
// covers everything in between, clamped to the server's allowed min/max.
export const METRES_PER_MILE = 1609.344;

export const UNITS = {
  mi: { label: 'miles', abbr: 'mi', factor: METRES_PER_MILE, dp: 2, step: 0.05, presets: [0.25, 0.5, 1, 2, 3] },
  km: { label: 'km', abbr: 'km', factor: 1000, dp: 1, step: 0.1, presets: [0.5, 1, 2, 3, 5] },
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const fmtRadius = (m, unit) => `${(m / UNITS[unit].factor).toFixed(UNITS[unit].dp)} ${UNITS[unit].abbr}`;
