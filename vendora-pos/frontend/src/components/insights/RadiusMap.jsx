import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchTileObjectURL as insightsFetchTile } from '../../lib/insightsClient';

// The catchment map for Neighbourhood Insights: the shop at the centre with a circle at the chosen radius, over
// an OpenStreetMap base. Tiles come through our backend proxy (authed), so the browser never calls the tile host
// directly. Plain Leaflet (no react-leaflet) to avoid a React-version coupling. Online-only by design.
//
// A custom tile layer fetches each tile WITH the PWA bearer header and swaps in a blob URL (Leaflet's default
// <img src=...> can't send an Authorization header). Blob URLs are revoked on load to avoid leaks. The shop
// centre is a circleMarker (no external marker-icon asset to break under the bundler).
const AuthTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const img = document.createElement('img');
    img.setAttribute('role', 'presentation');
    img.alt = '';
    const fetchTile = this.options.fetchTile || insightsFetchTile;
    const onTileError = this.options.onTileError;
    fetchTile(coords.z, coords.x, coords.y)
      .then((url) => {
        img.onload = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } done(null, img); };
        img.onerror = (e) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } if (onTileError) onTileError(e); done(e, img); };
        img.src = url;
      })
      // A tile that can't be fetched OR served from cache (offline, no saved copy) — tell the parent so it can
      // swap the blank map for the slider-only fallback instead of leaving a grey grid.
      .catch((e) => { if (onTileError) onTileError(e); done(e, img); });
    return img;
  },
});

const ACCENT = '#2563eb';

// The radius that exactly fits INSIDE the current map viewport, centred on the view: half of the smaller of the
// viewport's height/width in metres. It depends on the zoom (and latitude), not on panning, so zooming in/out
// grows/shrinks it while looking around does not. Used by the "radius follows the map" mode.
function inscribedRadiusM(map) {
  const b = map.getBounds();
  const c = b.getCenter();
  const halfH = c.distanceTo(L.latLng(b.getNorth(), c.lng));
  const halfW = c.distanceTo(L.latLng(c.lat, b.getEast()));
  return Math.min(halfH, halfW);
}

export default function RadiusMap({ point, radiusM, fetchTile, followView = false, onViewRadius = null, onTileError = null, ariaLabel = 'Map of the area around your shop with the selected radius' }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  // Keep the latest callback in a ref so attaching/detaching the map listeners doesn't depend on its identity.
  const onViewRef = useRef(onViewRadius);
  useEffect(() => { onViewRef.current = onViewRadius; }, [onViewRadius]);

  // Create the map once we have a point (and tear it down on unmount / point change). A map error must NEVER
  // crash the surrounding card, so everything is wrapped in try/catch and the fit happens AFTER the container has
  // a real size (otherwise Leaflet projects against a 0×0/undefined pane → "layerPointToLatLng" on undefined).
  useEffect(() => {
    if (!point || !elRef.current || mapRef.current) return undefined;
    let map;
    try {
      // Give the map a valid view IMMEDIATELY (sets the pixel origin) before adding layers or fitting bounds.
      // Full zoom: +/- buttons, scroll-wheel / trackpad, double-click, box-zoom, and pinch on touch. maxZoom 19
      // matches the OSM tiles (the proxy rejects higher). The user's manual zoom persists until they move the
      // radius slider (which re-frames the circle).
      map = L.map(elRef.current, {
        zoomControl: true, attributionControl: true,
        scrollWheelZoom: true, doubleClickZoom: true, boxZoom: true, touchZoom: true,
        minZoom: 3, maxZoom: 19, zoomSnap: 0.25, wheelPxPerZoomLevel: 80,
      }).setView([point.lat, point.lng], 14);
      mapRef.current = map;
      new AuthTileLayer('{z}/{x}/{y}', { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap contributors', fetchTile, onTileError }).addTo(map);
      L.circleMarker([point.lat, point.lng], { radius: 6, color: ACCENT, fillColor: ACCENT, fillOpacity: 1, weight: 2 })
        .addTo(map).bindTooltip('Your shop', { direction: 'top' });
      circleRef.current = L.circle([point.lat, point.lng], { radius: radiusM, color: ACCENT, weight: 2, fillColor: ACCENT, fillOpacity: 0.08 }).addTo(map);
      // Fit to the circle only once the container is laid out and sized.
      const raf = requestAnimationFrame(() => {
        if (!mapRef.current) return;
        try { map.invalidateSize(); if (circleRef.current) map.fitBounds(circleRef.current.getBounds(), { padding: [16, 16] }); } catch { /* keep the setView fallback */ }
      });
      return () => { cancelAnimationFrame(raf); try { map.remove(); } catch { /* ignore */ } mapRef.current = null; circleRef.current = null; };
    } catch {
      try { if (map) map.remove(); } catch { /* ignore */ }
      mapRef.current = null; circleRef.current = null;
      return undefined;
    }
  }, [point && point.lat, point && point.lng]);

  // Update the circle when the radius changes. In the normal (slider) mode we re-fit the map to the circle. In
  // "follow the map" mode we must NOT re-fit — the user's own zoom is what sets the radius, so re-fitting would
  // fight their gesture (and loop) — we only resize the circle in place.
  useEffect(() => {
    const map = mapRef.current; const circle = circleRef.current;
    if (!map || !circle) return;
    try {
      circle.setRadius(radiusM);
      if (!followView) map.fitBounds(circle.getBounds(), { padding: [16, 16] });
    } catch { /* ignore transient */ }
  }, [radiusM, followView]);

  // "Radius follows the map view": as the user zooms in/out, report the radius that fits the viewport so the
  // parent can re-sum the figures. No programmatic map movement happens here, so there's no feedback loop
  // (parent → radiusM → the effect above only resizes the circle in place when followView is on).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followView) return undefined;
    const emit = () => {
      try {
        const m = inscribedRadiusM(map);
        if (onViewRef.current && Number.isFinite(m) && m > 0) onViewRef.current(Math.round(m));
      } catch { /* ignore transient */ }
    };
    map.on('zoomend', emit);
    map.on('moveend', emit);
    emit(); // sync once when follow mode turns on, so the radius matches what's already on screen
    return () => { try { map.off('zoomend', emit); map.off('moveend', emit); } catch { /* ignore */ } };
  }, [followView, point && point.lat, point && point.lng]);

  if (!point) return null;
  return <div ref={elRef} role="img" className="h-64 w-full overflow-hidden rounded-2xl border border-gray-100" aria-label={ariaLabel} />;
}
