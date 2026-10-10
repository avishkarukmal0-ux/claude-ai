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
    fetchTile(coords.z, coords.x, coords.y)
      .then((url) => {
        img.onload = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } done(null, img); };
        img.onerror = (e) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } done(e, img); };
        img.src = url;
      })
      .catch((e) => done(e, img));
    return img;
  },
});

const ACCENT = '#2563eb';

export default function RadiusMap({ point, radiusM, fetchTile }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);

  // Create the map once we have a point (and tear it down on unmount / point change).
  useEffect(() => {
    if (!point || !elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    mapRef.current = map;
    new AuthTileLayer('{z}/{x}/{y}', { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap contributors', fetchTile }).addTo(map);
    L.circleMarker([point.lat, point.lng], { radius: 6, color: ACCENT, fillColor: ACCENT, fillOpacity: 1, weight: 2 })
      .addTo(map).bindTooltip('Your shop', { direction: 'top' });
    circleRef.current = L.circle([point.lat, point.lng], { radius: radiusM, color: ACCENT, weight: 2, fillColor: ACCENT, fillOpacity: 0.08 }).addTo(map);
    map.fitBounds(circleRef.current.getBounds(), { padding: [16, 16] });
    // Leaflet needs a correct container size; it can init before layout settles.
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; circleRef.current = null; };
  }, [point && point.lat, point && point.lng]);

  // Update the circle (and re-fit) when only the radius changes.
  useEffect(() => {
    const map = mapRef.current; const circle = circleRef.current;
    if (!map || !circle) return;
    circle.setRadius(radiusM);
    map.fitBounds(circle.getBounds(), { padding: [16, 16] });
  }, [radiusM]);

  if (!point) return null;
  return <div ref={elRef} className="h-64 w-full overflow-hidden rounded-2xl border border-gray-100" aria-label="Map of the area around your shop with the selected radius" />;
}
