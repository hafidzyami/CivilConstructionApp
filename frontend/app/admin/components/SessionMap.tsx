'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Rectangle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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

      {/* Labeled Features - CircleMarkers dengan warna building */}
      {labeledFeatures && labeledFeatures.map((feature: any, idx: number) => {
        if (feature.lat && feature.lon) {
          const colors = TYPE_COLORS[feature.type] || TYPE_COLORS['Others'];
          return (
            <CircleMarker
              key={idx}
              center={[feature.lat, feature.lon]}
              radius={12}
              pathOptions={{
                color: colors.color,
                fillColor: colors.fillColor,
                fillOpacity: 0.8,
                weight: 3,
                opacity: 1,
              }}
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
            </CircleMarker>
          );
        }
        return null;
      })}
    </MapContainer>
  );
}
