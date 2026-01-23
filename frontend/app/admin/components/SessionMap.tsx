'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Komponen untuk memperbaiki ukuran peta setelah modal terbuka
const MapUpdater = () => {
  const map = useMap();

  useEffect(() => {
    // Tunggu animasi modal selesai, lalu refresh ukuran peta
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
};

// Color mapping untuk building types
const TYPE_COLORS: Record<string, { color: string; fillColor: string }> = {
  'Hospital': { color: '#DC2626', fillColor: '#FCA5A5' },
  'School': { color: '#D97706', fillColor: '#FCD34D' },
  'Residential Housing': { color: '#059669', fillColor: '#6EE7B7' },
  'River': { color: '#0284C7', fillColor: '#7DD3FC' },
  'Lake': { color: '#1D4ED8', fillColor: '#93C5FD' },
  'Office': { color: '#7C3AED', fillColor: '#C4B5FD' },
  'Others': { color: '#14B8A6', fillColor: '#5EEAD4' }
};

interface SessionMapProps {
  infrastructureData: any;
}

export default function SessionMap({ infrastructureData }: SessionMapProps) {
  const { latitude, longitude, radius, labeledFeatures } = infrastructureData;

  // Fungsi untuk membuat icon custom berdasarkan tipe building
  const createColoredIcon = (type: string) => {
    const colors = TYPE_COLORS[type] || TYPE_COLORS['Others'];
    return new L.Icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
          <path fill="${colors.color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z"/>
          <circle fill="white" cx="12" cy="8" r="3"/>
        </svg>
      `)}`,
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36],
    });
  };

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={16}
      style={{ height: '100%', width: '100%' }}
      dragging={true}
      scrollWheelZoom={false}
      doubleClickZoom={true}
    >
      {/* KUNCI UTAMA: MapUpdater akan fix ukuran peta */}
      <MapUpdater />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      {/* Center Marker */}
      <Marker position={[latitude, longitude]} />

      {/* Search Radius Rectangle */}
      {radius && (
        <Rectangle
          bounds={[
            [
              latitude - radius / 111000,
              longitude - radius / (111000 * Math.cos((latitude * Math.PI) / 180)),
            ],
            [
              latitude + radius / 111000,
              longitude + radius / (111000 * Math.cos((latitude * Math.PI) / 180)),
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
      )}

      {/* Labeled Features Markers */}
      {labeledFeatures && labeledFeatures.map((feature: any, idx: number) => {
        if (feature.lat && feature.lon) {
          return (
            <Marker
              key={idx}
              position={[feature.lat, feature.lon]}
              icon={createColoredIcon(feature.type)}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' }}>
                    {feature.customType || feature.type}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    <strong>Latitude:</strong> {feature.lat.toFixed(6)}<br />
                    <strong>Longitude:</strong> {feature.lon.toFixed(6)}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        }
        return null;
      })}
    </MapContainer>
  );
}
