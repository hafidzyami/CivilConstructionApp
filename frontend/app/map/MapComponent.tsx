'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import Link from 'next/link';

// Fix Leaflet icon issues
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const redIcon = new L.Icon({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'red-marker',
});

interface LocationState {
  lat: number;
  lon: number;
  zoom: number;
}

const DEFAULT_LOCATION: LocationState = {
  lat: -6.358137,
  lon: 106.835432,
  zoom: 16,
};

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function MapComponent() {
  const [location, setLocation] = useState<LocationState>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(300);
  const [searchInput, setSearchInput] = useState<string>('');
  const [osmData, setOsmData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const calculateZoom = (dist: number): number => {
    return Math.max(13, 19 - Math.floor(Math.log2(dist / 50)));
  };

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            zoom: calculateZoom(radius),
          });
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const fetchOSMData = useCallback(async () => {
    setLoading(true);
    setOsmData(null); // Clear old data immediately
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/osm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.lat,
          lon: location.lon,
          radius: radius,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OSM data: ${response.statusText}`);
      }

      const data = (await response.json()) as FeatureCollection;
      setOsmData(data);
      setSuccessMessage(
        `Successfully loaded ${data.features?.length || 0} infrastructure features.`
      );
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('OSM fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [location.lat, location.lon, radius]);

  const handleSearch = async () => {
    setError('');

    const coordMatch = searchInput.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setLocation({ lat, lon, zoom: calculateZoom(radius) });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=1`
      );
      const results = await response.json();

      if (results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        setLocation({ lat, lon, zoom: calculateZoom(radius) });
      } else {
        setError('Location not found');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Geocoding error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update zoom when radius changes, but DO NOT auto-fetch
  useEffect(() => {
    setLocation((prev) => ({ ...prev, zoom: calculateZoom(radius) }));
  }, [radius]);

  const getFeatureStyle = (feature: Feature): L.PathOptions => {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const geometry = feature.geometry as GeoJSON.Geometry | null;
    const geometryType = geometry?.type;

    if (props.natural === 'water' || props.waterway) {
      return {
        color: '#1E40AF',
        fillColor: '#3B82F6',
        fillOpacity: 0.7,
        weight: 2,
        opacity: 1,
      };
    }

    if (props.railway) {
      return {
        color: '#1F2937',
        weight: 4,
        opacity: 1,
        dashArray: '8, 4',
      };
    }

    if (props.highway) {
      const majorRoads = ['motorway', 'trunk', 'primary', 'secondary'];
      const highwayVal =
        typeof props.highway === 'string' ? props.highway : String(props.highway ?? '');
      const isMajor = majorRoads.includes(highwayVal);
      return {
        color: '#EA580C',
        weight: isMajor ? 4 : 3,
        opacity: 1,
      };
    }

    if (props.building) {
      return {
        color: '#374151',
        fillColor: '#9CA3AF',
        fillOpacity: 0.8,
        weight: 2,
        opacity: 1,
      };
    }

    if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
      return {
        color: '#DC2626',
        weight: 3,
        opacity: 1,
      };
    }

    return {
      color: '#DC2626',
      fillColor: '#FCA5A5',
      fillOpacity: 0.7,
      weight: 2,
      opacity: 1,
    };
  };

  const getPopupContent = (feature: Feature): string => {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const priorityKeys = [
      'name',
      'building',
      'highway',
      'railway',
      'waterway',
      'natural',
      'addr:street',
      'addr:housenumber',
      'building:levels',
      'ref',
      'maxspeed',
      'service',
      'bridge',
      'tunnel',
    ];
    const ignoreKeys = [
      'geometry',
      'nodes',
      'ways',
      'relation',
      'source',
      'created_by',
      'element_start_id',
      'osmid',
      'osm_id',
      'osm_type',
      'unique_id',
      'z_index',
    ];

    let html =
      '<div style="font-family: sans-serif; font-size: 12px; max-height: 250px; overflow-y: auto;"><table style="width:100%; border-collapse: collapse;">';
    let rowsAdded = 0;

    const addRow = (key: string, val: unknown): string => {
      const niceKey = key
        .replace('addr:', '')
        .replace('building:', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      return `<tr style="border-bottom: 1px solid #eee;"><td style="font-weight:bold; color:#555; padding:4px; width: 35%; vertical-align: top;">${niceKey}</td><td style="padding:4px; vertical-align: top;">${String(
        val
      )}</td></tr>`;
    };

    priorityKeys.forEach((key) => {
      if (
        props[key] &&
        String(props[key]).trim() !== '' &&
        String(props[key]).toLowerCase() !== 'nan'
      ) {
        html += addRow(key, props[key]);
        rowsAdded++;
      }
    });

    Object.entries(props).forEach(([key, value]) => {
      if (
        !priorityKeys.includes(key) &&
        !ignoreKeys.includes(key) &&
        value &&
        String(value).trim() !== '' &&
        String(value).toLowerCase() !== 'nan'
      ) {
        html += addRow(key, value);
        rowsAdded++;
      }
    });

    html += '</table></div>';
    return rowsAdded === 0 ? '<b>No detailed attributes available</b>' : html;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="bg-white/95 backdrop-blur-md shadow-lg border-b border-slate-200/80 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                <span className="font-medium">Back</span>
              </Link>
              <div className="h-6 w-px bg-slate-300"></div>
              <h1 className="text-2xl font-bold bg-linear-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
                Infrastructure Explorer
              </h1>
            </div>
            {osmData && osmData.features && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {osmData.features.length} Features
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Search Location
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Jakarta, Indonesia or -6.358, 106.835"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900 placeholder:text-slate-400"
                  />
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-6 py-3 bg-linear-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed cursor-pointer transition-all shadow-md hover:shadow-lg"
                >
                  Search
                </button>
              </div>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Search Radius
              </label>
              <div className="flex items-center gap-3 bg-white border border-slate-300 rounded-xl px-4 py-3 shadow-sm">
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((radius - 50) / 950) * 100}%, #cbd5e1 ${((radius - 50) / 950) * 100}%, #cbd5e1 100%)`,
                  }}
                />
                <span className="text-sm font-bold text-slate-900 w-14 text-right">{radius}m</span>
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2 opacity-0">
                Action
              </label>
              <button
                onClick={fetchOSMData}
                disabled={loading}
                className="w-full h-[52px] px-4 py-3 bg-linear-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-800 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed cursor-pointer transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Loading</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
                      />
                    </svg>
                    <span>Fetch Data</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <div>{successMessage}</div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <div className="font-semibold">Error</div>
                <div>{error}</div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-mono">
                {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3B82F6' }}></div>
                <span>Water</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EA580C' }}></div>
                <span>Roads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#9CA3AF' }}></div>
                <span>Buildings</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#1F2937' }}></div>
                <span>Railways</span>
              </div>
            </div>
          </div>

          {osmData?.features && osmData.features.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-sm">
              No infrastructure features found in this area. Try increasing the search radius or
              searching a different location.
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          center={[location.lat, location.lon]}
          zoom={location.zoom}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <MapUpdater center={[location.lat, location.lon]} zoom={location.zoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          <Marker position={[location.lat, location.lon]} icon={redIcon}>
            <Popup>Search Center</Popup>
          </Marker>

          <Rectangle
            bounds={[
              [
                location.lat - radius / 111000,
                location.lon - radius / (111000 * Math.cos((location.lat * Math.PI) / 180)),
              ],
              [
                location.lat + radius / 111000,
                location.lon + radius / (111000 * Math.cos((location.lat * Math.PI) / 180)),
              ],
            ]}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '5, 5',
            }}
            interactive={false}
          />

          {osmData && osmData.features && osmData.features.length > 0 && (
            <GeoJSON
              key={`osm-data-${location.lat}-${location.lon}-${radius}`}
              data={osmData}
              style={(feature: unknown) => getFeatureStyle(feature as Feature)}
              onEachFeature={(feature: Feature, layer: L.Layer) => {
                const popupContent = getPopupContent(feature);
                (
                  layer as unknown as { bindPopup?: (content: string, opts?: unknown) => void }
                ).bindPopup?.(popupContent, { maxWidth: 300 });

                const originalStyle = getFeatureStyle(feature);
                const geometryType = feature.geometry?.type;
                const isLine = geometryType === 'LineString' || geometryType === 'MultiLineString';

                layer.on({
                  click: (e: L.LeafletMouseEvent) => {
                    (layer as unknown as { openPopup?: () => void }).openPopup?.();
                    L.DomEvent.stopPropagation(e);
                  },
                  mouseover: (e: L.LeafletMouseEvent) => {
                    const targetLayer = e.target as unknown as {
                      setStyle?: (s: L.PathOptions) => void;
                      bringToFront?: () => void;
                    };
                    const hoverStyle: L.PathOptions = {
                      color: '#FBBF24',
                      weight: isLine ? 4 : 3,
                      opacity: 1,
                    };
                    if (!isLine) {
                      hoverStyle.fillColor = '#FDE68A';
                      hoverStyle.fillOpacity = 0.9;
                    }
                    targetLayer.setStyle?.(hoverStyle);
                    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                      targetLayer.bringToFront?.();
                    }
                    L.DomEvent.stopPropagation(e);
                  },
                  mouseout: (e: L.LeafletMouseEvent) => {
                    const targetLayer = e.target as unknown as {
                      setStyle?: (s: L.PathOptions) => void;
                    };
                    targetLayer.setStyle?.(originalStyle);
                    L.DomEvent.stopPropagation(e);
                  },
                });
              }}
              pane="overlayPane"
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
