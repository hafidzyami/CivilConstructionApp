'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import Link from 'next/link';
import { useLanguage } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

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

// Building types configuration
const BUILDING_TYPES = [
  'Hospital',
  'School',
  'Residential Housing',
  'River',
  'Lake',
  'Office',
  'Others'
] as const;

type BuildingType = typeof BUILDING_TYPES[number];

interface SelectedFeature {
  featureId: string;
  type: BuildingType;
  customType?: string;
  lat: number;
  lon: number;
}

// Color mapping for building types
const TYPE_COLORS: Record<BuildingType, { color: string; fillColor: string }> = {
  'Hospital': { color: '#DC2626', fillColor: '#FCA5A5' },
  'School': { color: '#D97706', fillColor: '#FCD34D' },
  'Residential Housing': { color: '#059669', fillColor: '#6EE7B7' },
  'River': { color: '#0284C7', fillColor: '#7DD3FC' },
  'Lake': { color: '#1D4ED8', fillColor: '#93C5FD' },
  'Office': { color: '#7C3AED', fillColor: '#C4B5FD' },
  'Others': { color: '#6B7280', fillColor: '#D1D5DB' }
};

export default function MapComponent() {
  const { t } = useLanguage();
  const [location, setLocation] = useState<LocationState>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(300);
  const [searchInput, setSearchInput] = useState<string>('');
  const [osmData, setOsmData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [selectedFeatures, setSelectedFeatures] = useState<Map<string, SelectedFeature>>(new Map());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [tempBuildingType, setTempBuildingType] = useState<BuildingType>('Hospital');
  const [tempCustomType, setTempCustomType] = useState<string>('');
  const [geoJsonKey, setGeoJsonKey] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showAIDecision, setShowAIDecision] = useState(false);

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

  // Generate unique ID for feature
  const getFeatureId = (feature: Feature): string => {
    const props = feature.properties as Record<string, unknown>;
    return props.osm_id ? String(props.osm_id) : JSON.stringify(feature.geometry);
  };

  // Extract coordinates from feature (centroid for polygons)
  const getFeatureCoordinates = (feature: Feature): { lat: number; lon: number } => {
    const geometry = feature.geometry as GeoJSON.Geometry;
    
    if (geometry.type === 'Point') {
      const coords = (geometry as GeoJSON.Point).coordinates;
      return { lat: coords[1], lon: coords[0] };
    } else if (geometry.type === 'Polygon') {
      const coords = (geometry as GeoJSON.Polygon).coordinates[0];
      const latSum = coords.reduce((sum, coord) => sum + coord[1], 0);
      const lonSum = coords.reduce((sum, coord) => sum + coord[0], 0);
      return { lat: latSum / coords.length, lon: lonSum / coords.length };
    } else if (geometry.type === 'LineString') {
      const coords = (geometry as GeoJSON.LineString).coordinates;
      const midIndex = Math.floor(coords.length / 2);
      return { lat: coords[midIndex][1], lon: coords[midIndex][0] };
    }
    
    // Default fallback
    return { lat: 0, lon: 0 };
  };

  // Handle feature type assignment
  const handleAssignType = () => {
    if (!selectedFeatureId) return;
    
    // Find the feature from osmData to get its coordinates
    const feature = osmData?.features.find(f => getFeatureId(f as Feature) === selectedFeatureId);
    if (!feature) return;
    
    const coords = getFeatureCoordinates(feature as Feature);
    
    const newSelected = new Map(selectedFeatures);
    newSelected.set(selectedFeatureId, {
      featureId: selectedFeatureId,
      type: tempBuildingType,
      customType: tempBuildingType === 'Others' ? tempCustomType : undefined,
      lat: coords.lat,
      lon: coords.lon
    });
    setSelectedFeatures(newSelected);
    setSelectedFeatureId(null);
    setTempCustomType('');
    
    // Force complete re-render by changing key
    setGeoJsonKey(prev => prev + 1);
  };

  const handleSubmitLabels = () => {
    setShowSubmitConfirm(false);
    // Here you would send the labeled data to backend
    console.log('Submitting labeled features:', Array.from(selectedFeatures.values()));
    setShowAIDecision(true);
  };

  const getFeatureStyle = (feature: Feature): L.PathOptions => {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const geometry = feature.geometry as GeoJSON.Geometry | null;
    const geometryType = geometry?.type;
    const featureId = getFeatureId(feature);
    
    // Check if feature has been assigned a type
    const selectedFeature = selectedFeatures.get(featureId);
    if (selectedFeature) {
      const colors = TYPE_COLORS[selectedFeature.type];
      return {
        color: colors.color,
        fillColor: colors.fillColor,
        fillOpacity: 0.8,
        weight: 3,
        opacity: 1,
      };
    }

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
        color: '#64748B',
        weight: 3,
        opacity: 1,
      };
    }

    return {
      color: '#64748B',
      fillColor: '#CBD5E1',
      fillOpacity: 0.7,
      weight: 2,
      opacity: 1,
    };
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
                <span className="font-medium">{t.common.backToHome}</span>
              </Link>
              <div className="h-6 w-px bg-slate-300"></div>
              <h1 className="text-2xl font-bold bg-linear-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
                {t.map.title}
              </h1>
              <LanguageSwitcher />
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
              key={`osm-${location.lat}-${location.lon}-${radius}-${geoJsonKey}`}
              data={osmData}
              style={(feature: unknown) => getFeatureStyle(feature as Feature)}
              onEachFeature={(feature: Feature, layer: L.Layer) => {
                const featureId = getFeatureId(feature);
                const selectedFeature = selectedFeatures.get(featureId);

                const originalStyle = getFeatureStyle(feature);
                const geometryType = feature.geometry?.type;
                const isLine = geometryType === 'LineString' || geometryType === 'MultiLineString';

                // Add tooltip to show status
                const tooltipContent = selectedFeature 
                  ? `${selectedFeature.type === 'Others' && selectedFeature.customType ? selectedFeature.customType : selectedFeature.type} (Click to change)`
                  : 'Click to assign type';
                
                (
                  layer as unknown as { bindTooltip?: (content: string, opts?: unknown) => void }
                ).bindTooltip?.(tooltipContent, { 
                  permanent: false, 
                  direction: 'top',
                  opacity: 0.9 
                });

                layer.on({
                  click: (e: L.LeafletMouseEvent) => {
                    setSelectedFeatureId(featureId);
                    const currentSelection = selectedFeatures.get(featureId);
                    setTempBuildingType(currentSelection?.type || 'Hospital');
                    setTempCustomType(currentSelection?.customType || '');
                    L.DomEvent.stopPropagation(e);
                  },
                  mouseover: (e: L.LeafletMouseEvent) => {
                    // Get fresh data from selectedFeatures Map
                    const currentSelection = selectedFeatures.get(featureId);
                    
                    // Only apply hover effect for unlabeled features
                    if (!currentSelection) {
                      const targetLayer = e.target as unknown as {
                        setStyle?: (s: L.PathOptions) => void;
                        bringToFront?: () => void;
                      };
                      
                      // Default yellow hover for unlabeled features
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
                    }
                    L.DomEvent.stopPropagation(e);
                  },
                  mouseout: (e: L.LeafletMouseEvent) => {
                    // Get fresh data from selectedFeatures Map
                    const currentSelection = selectedFeatures.get(featureId);
                    
                    // Only restore style for unlabeled features
                    if (!currentSelection) {
                      const targetLayer = e.target as unknown as {
                        setStyle?: (s: L.PathOptions) => void;
                      };
                      targetLayer.setStyle?.(originalStyle);
                    }
                    L.DomEvent.stopPropagation(e);
                  },
                });
              }}
              pane="overlayPane"
            />
          )}
        </MapContainer>
      </div>

      {/* Building Type Selection Modal */}
      {selectedFeatureId && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
          onClick={() => setSelectedFeatureId(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              {selectedFeatures.get(selectedFeatureId) ? 'Change' : 'Assign'} Building Type
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {selectedFeatures.get(selectedFeatureId) 
                ? 'Click a different type to change the classification' 
                : 'Select a type to classify this feature'}
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Select Type
              </label>
              <select
                value={tempBuildingType}
                onChange={(e) => setTempBuildingType(e.target.value as BuildingType)}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-900 font-medium"
              >
                {BUILDING_TYPES.map((type) => (
                  <option key={type} value={type} className="text-slate-900 bg-white py-2">
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {tempBuildingType === 'Others' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Custom Type Name
                </label>
                <input
                  type="text"
                  value={tempCustomType}
                  onChange={(e) => setTempCustomType(e.target.value)}
                  placeholder="Enter custom type name..."
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-900 placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Color Preview */}
            <div className="mb-4 p-3 rounded-lg flex items-center gap-3" style={{ 
              backgroundColor: TYPE_COLORS[tempBuildingType].fillColor,
              border: `2px solid ${TYPE_COLORS[tempBuildingType].color}`
            }}>
              <div 
                className="w-6 h-6 rounded-full" 
                style={{ backgroundColor: TYPE_COLORS[tempBuildingType].color }}
              />
              <span className="font-medium text-slate-900">
                Preview: {tempBuildingType === 'Others' && tempCustomType ? tempCustomType : tempBuildingType}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedFeatureId(null)}
                className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignType}
                disabled={tempBuildingType === 'Others' && !tempCustomType.trim()}
                className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {selectedFeatures.get(selectedFeatureId) ? 'Update Type' : 'Assign Type'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-md shadow-lg rounded-xl p-4 z-[999] max-w-xs">
        <h4 className="font-bold text-slate-900 mb-3 text-sm">Building Types</h4>
        <div className="space-y-2">
          {BUILDING_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border-2" 
                style={{ 
                  backgroundColor: TYPE_COLORS[type].fillColor,
                  borderColor: TYPE_COLORS[type].color
                }}
              />
              <span className="text-xs text-slate-700">{type}</span>
            </div>
          ))}
        </div>
        {selectedFeatures.size > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
            {selectedFeatures.size} building{selectedFeatures.size > 1 ? 's' : ''} classified
          </div>
        )}
      </div>

      {/* Submit Button */}
      {selectedFeatures.size > 0 && (
        <div className="absolute bottom-24 left-4 z-[1000]">
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Submit Labeled Features ({selectedFeatures.size})</span>
          </button>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Submission</h3>
                <p className="text-slate-600 text-sm">Are you sure you want to submit {selectedFeatures.size} labeled feature{selectedFeatures.size > 1 ? 's' : ''}?</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Labeled Features:</p>
              <ul className="space-y-3">
                {Array.from(selectedFeatures.values()).map((feature, idx) => (
                  <li key={idx} className="border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div 
                        className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                        style={{ 
                          backgroundColor: TYPE_COLORS[feature.type].fillColor,
                          borderColor: TYPE_COLORS[feature.type].color
                        }}
                      />
                      <span className="font-semibold text-slate-900">
                        {feature.type === 'Others' && feature.customType ? feature.customType : feature.type}
                      </span>
                    </div>
                    <div className="ml-6 text-xs text-slate-600 font-mono">
                      <div>Lat: {feature.lat.toFixed(6)}</div>
                      <div>Lon: {feature.lon.toFixed(6)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitLabels}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Decision Modal */}
      {showAIDecision && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fadeIn">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Submission Successful!</h3>
                <p className="text-slate-600 text-sm">Your labeled data has been submitted.</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 7H7v6h6V7z" />
                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                </svg>
                <h4 className="font-bold text-purple-900">Next Step: AI Decision Making</h4>
              </div>
              <p className="text-sm text-purple-800 leading-relaxed">
                The system will now use <span className="font-semibold">AI-powered decision making</span> to analyze the labeled infrastructure data and determine whether the civil construction application should be <span className="font-semibold text-green-700">approved</span> or <span className="font-semibold text-red-700">rejected</span> based on regulatory compliance, safety standards, and environmental impact assessments.
              </p>
            </div>

            <button
              onClick={() => setShowAIDecision(false)}
              className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
