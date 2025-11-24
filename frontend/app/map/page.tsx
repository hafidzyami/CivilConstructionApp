'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon issue with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);

interface OSMFeature {
  type: string;
  geometry: any;
  properties: any;
}

interface LocationState {
  lat: number;
  lon: number;
  zoom: number;
}

// Default location: Jakarta
const DEFAULT_LOCATION: LocationState = {
  lat: -6.358137,
  lon: 106.835432,
  zoom: 16
};

export default function MapPage() {
  const [location, setLocation] = useState<LocationState>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(300);
  const [searchInput, setSearchInput] = useState<string>('');
  const [osmData, setOsmData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Calculate zoom based on radius (matching Python logic)
  const calculateZoom = (dist: number): number => {
    return Math.max(13, 19 - Math.floor(Math.log2(dist / 50)));
  };

  // Request geolocation on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            zoom: calculateZoom(radius)
          });
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          // Keep default location
        }
      );
    }
  }, []);

  // Fetch OSM data
  const fetchOSMData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/osm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.lat,
          lon: location.lon,
          radius: radius
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OSM data: ${response.statusText}`);
      }

      const data = await response.json();
      setOsmData(data);
    } catch (err: any) {
      setError(err.message);
      console.error('OSM fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle search (coordinates or place name)
  const handleSearch = async () => {
    setError('');
    
    // Try parsing as coordinates first (format: lat,lon)
    const coordMatch = searchInput.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setLocation({ lat, lon, zoom: calculateZoom(radius) });
      return;
    }

    // Otherwise, geocode with Nominatim
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
    } catch (err: any) {
      setError(`Geocoding error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update zoom when radius changes
  useEffect(() => {
    setLocation(prev => ({ ...prev, zoom: calculateZoom(radius) }));
  }, [radius]);

  // Get feature style based on type
  const getFeatureStyle = (feature: any) => {
    const props = feature.properties || {};
    
    // Water features
    if (props.natural === 'water' || props.waterway) {
      return {
        color: '#3388FF',
        fillColor: '#3388FF',
        fillOpacity: 0.4,
        weight: 2
      };
    }
    
    // Railway features
    if (props.railway) {
      return {
        color: '#333333',
        weight: 2,
        dashArray: '5, 5'
      };
    }
    
    // Highway features
    if (props.highway) {
      return {
        color: '#F57F17',
        weight: 3,
        opacity: 0.7
      };
    }
    
    // Building features
    if (props.building) {
      return {
        color: '#A0A0A0',
        fillColor: '#A0A0A0',
        fillOpacity: 0.5,
        weight: 1
      };
    }
    
    // Default
    return {
      color: '#888888',
      weight: 2
    };
  };

  // Generate popup HTML
  const getPopupContent = (feature: any): string => {
    const props = feature.properties || {};
    const priorityKeys = ['name', 'type', 'building', 'highway', 'natural', 'waterway', 'railway'];
    
    let html = '<div style="max-width: 200px;">';
    
    // Priority fields first
    priorityKeys.forEach(key => {
      if (props[key]) {
        html += `<strong>${key}:</strong> ${props[key]}<br/>`;
      }
    });
    
    // Other fields
    Object.entries(props).forEach(([key, value]) => {
      if (!priorityKeys.includes(key) && value) {
        html += `<strong>${key}:</strong> ${value}<br/>`;
      }
    });
    
    html += '</div>';
    return html;
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header Controls */}
      <div className="bg-white shadow-md p-4 z-10">
        <h1 className="text-2xl font-bold mb-4">OSM Infrastructure Explorer</h1>
        
        {/* Search Bar */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter coordinates (lat,lon) or location name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            Search
          </button>
        </div>

        {/* Radius Slider */}
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">
            Radius: {radius}m
          </label>
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Fetch Button */}
        <button
          onClick={fetchOSMData}
          disabled={loading}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {loading ? 'Loading...' : 'Fetch OSM Data'}
        </button>

        {/* Error Display */}
        {error && (
          <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Current Location Display */}
        <div className="mt-2 text-sm text-gray-600">
          Location: {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        {typeof window !== 'undefined' && (
          <MapContainer
            center={[location.lat, location.lon]}
            zoom={location.zoom}
            style={{ height: '100%', width: '100%' }}
            key={`${location.lat}-${location.lon}`} // Force re-render on location change
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            
            {/* Center Marker */}
            <Marker position={[location.lat, location.lon]}>
              <Popup>Search Center</Popup>
            </Marker>

            {/* OSM Features */}
            {osmData && osmData.features && osmData.features.map((feature: any, idx: number) => (
              <GeoJSON
                key={`feature-${idx}`}
                data={feature}
                style={getFeatureStyle(feature)}
                onEachFeature={(feature, layer) => {
                  layer.bindPopup(getPopupContent(feature));
                }}
              />
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
