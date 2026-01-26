# OSM Geospatial Map System - Technical Document

**Version:** 1.0
**Last Updated:** January 2026
**Application:** Civil Construction App

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Logic & Data Flow](#4-logic--data-flow)
5. [API Reference](#5-api-reference)
6. [Component Details](#6-component-details)
7. [Configuration](#7-configuration)
8. [Error Handling](#8-error-handling)
9. [File Structure](#9-file-structure)

---

## 1. Overview

### 1.1 Purpose

The OSM Geospatial Map System is an interactive mapping module within the Civil Construction Application that enables users to:

- **Explore infrastructure** in any geographic location using OpenStreetMap data
- **Visualize** buildings, roads, railways, and waterways with color-coded styling
- **Classify features** by assigning building types (Hospital, School, Residential, etc.)
- **Submit classified data** for downstream AI-powered decision processing

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| **Location Search** | Search by place name (geocoding) or direct coordinate input |
| **Radius Control** | Adjustable search area from 50m to 1000m |
| **Infrastructure Display** | Renders buildings, roads, railways, and water features |
| **Feature Classification** | Interactive modal for assigning building types |
| **Geolocation** | Auto-centers map on user's current location |
| **Data Submission** | Submits classified features for AI analysis |

### 1.3 Use Cases

1. **Site Analysis** - Survey construction sites and surrounding infrastructure
2. **Urban Planning** - Identify building types and road networks in an area
3. **Environmental Assessment** - Map water bodies and natural features
4. **Infrastructure Mapping** - Document existing buildings for regulatory compliance

---

## 2. Tech Stack

### 2.1 Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.1 | React framework with API routes |
| **React** | 19.2.0 | UI component library |
| **TypeScript** | 5.x | Type-safe JavaScript |
| **Leaflet** | 1.9.4 | Core mapping library |
| **React-Leaflet** | 5.0.0 | React bindings for Leaflet |
| **Tailwind CSS** | 4.x | Utility-first styling |

### 2.2 Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express.js** | 5.1.0 | REST API framework |
| **TypeScript** | 5.5.x | Type-safe JavaScript |
| **Axios** | 1.7.9 | HTTP client for external APIs |
| **Prisma** | 7.0.0 | Database ORM |
| **PostgreSQL** | 16.x | Data persistence |

### 2.3 External Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Overpass API** | `https://overpass-api.de/api/interpreter` | OSM data queries |
| **Nominatim** | `https://nominatim.openstreetmap.org/search` | Geocoding (place → coordinates) |
| **CARTO Tiles** | `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | Base map tiles |

### 2.4 Data Formats

| Format | Usage |
|--------|-------|
| **GeoJSON** | Feature data exchange between API and frontend |
| **Overpass QL** | Query language for OSM data |
| **JSON** | API request/response payloads |

---

## 3. Architecture

### 3.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     MapComponent.tsx (React)                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  Location   │  │   Radius    │  │   Leaflet   │  │Classification│   │  │
│  │  │   Search    │  │   Slider    │  │     Map     │  │    Modal    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐
│   Nominatim API   │  │  Next.js API Route │  │     CARTO Tiles       │
│   (Geocoding)     │  │  /api/osm          │  │   (Base Map)          │
└───────────────────┘  └─────────┬─────────┘  └───────────────────────┘
                                 │
                                 ▼
                      ┌───────────────────┐
                      │   Overpass API    │
                      │  (OSM Data)       │
                      └─────────┬─────────┘
                                │
                                ▼
                      ┌───────────────────┐
                      │  GeoJSON Response │
                      │  → Map Rendering  │
                      └───────────────────┘
```

### 3.2 Component Architecture

```
frontend/app/map/
├── page.tsx                 # Page wrapper (dynamic import)
└── MapComponent.tsx         # Main map component
    ├── State Management
    │   ├── location (lat, lon)
    │   ├── radius (50-1000m)
    │   ├── geoJsonData (features)
    │   ├── selectedFeatures (Map)
    │   └── UI states (modals, loading)
    │
    ├── Sub-Components
    │   ├── MapContainer (react-leaflet)
    │   ├── TileLayer (CARTO)
    │   ├── GeoJSON (features)
    │   ├── Rectangle (bounding box)
    │   └── Custom Modals
    │
    └── Event Handlers
        ├── onSearch()
        ├── onFetchData()
        ├── onFeatureClick()
        └── onSubmit()
```

### 3.3 Data Flow Architecture

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  User   │───▶│ Search  │───▶│ Fetch   │───▶│ Render  │───▶│ Classify│
│  Input  │    │Location │    │  OSM    │    │   Map   │    │Features │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                   │              │              │              │
                   ▼              ▼              ▼              ▼
              Nominatim      Overpass       GeoJSON        Database
                 API           API          Layer          Storage
```

---

## 4. Logic & Data Flow

### 4.1 Location Search Logic

#### 4.1.1 Text-based Search (Geocoding)

```typescript
// Input: "Jakarta, Indonesia"
// Process: Nominatim API query
// Output: { lat: -6.2088, lon: 106.8456, display_name: "Jakarta, Indonesia" }

const searchLocation = async (query: string) => {
  // Check if input is coordinates
  const coordMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);

  if (coordMatch) {
    // Direct coordinate input
    return {
      lat: parseFloat(coordMatch[1]),
      lon: parseFloat(coordMatch[2]),
    };
  }

  // Geocoding via Nominatim
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
  );
  const results = await response.json();

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };
};
```

#### 4.1.2 Coordinate Input Format

```
Supported formats:
- "-6.358, 106.835"      (lat, lon with space)
- "-6.358,106.835"       (lat, lon without space)
- "106.835, -6.358"      (lon, lat - auto-detected)
```

### 4.2 Bounding Box Calculation

```typescript
/**
 * Converts radius (meters) to latitude/longitude deltas
 * and calculates bounding box coordinates
 */
const calculateBoundingBox = (lat: number, lon: number, radius: number) => {
  // Earth's radius approximation: 1 degree latitude ≈ 111,000 meters
  const latDelta = radius / 111000;

  // Longitude delta varies by latitude (cosine correction)
  const lonDelta = radius / (111000 * Math.cos((lat * Math.PI) / 180));

  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lon - lonDelta,
    east: lon + lonDelta,
  };
};

// Example:
// Input: lat=-6.358, lon=106.835, radius=300m
// Output: { south: -6.3607, north: -6.3554, west: 106.8323, east: 106.8377 }
```

### 4.3 Dynamic Zoom Calculation

```typescript
/**
 * Calculates appropriate zoom level based on search radius
 * Larger radius = lower zoom (more zoomed out)
 */
const calculateZoom = (radius: number): number => {
  // Base formula: zoom decreases as radius increases
  // 50m → 19, 100m → 18, 200m → 17, 400m → 16, 800m → 15, 1000m → ~14
  const zoom = 19 - Math.floor(Math.log2(radius / 50));

  // Clamp between 13 (very zoomed out) and 19 (street level)
  return Math.max(13, Math.min(19, zoom));
};
```

### 4.4 Overpass API Query Construction

```typescript
/**
 * Builds Overpass QL query for infrastructure data
 */
const buildOverpassQuery = (bounds: BoundingBox): string => {
  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;

  return `
    [out:json][timeout:25];
    (
      // Buildings (ways and relations)
      way["building"](${bbox});
      relation["building"](${bbox});

      // Waterways (streams, rivers, canals)
      way["waterway"](${bbox});
      relation["waterway"](${bbox});

      // Natural water bodies (lakes, ponds)
      way["natural"="water"](${bbox});
      relation["natural"="water"](${bbox});

      // Roads and highways
      way["highway"](${bbox});

      // Railways
      way["railway"](${bbox});
      relation["railway"](${bbox});
    );
    out geom;
  `;
};
```

### 4.5 OSM to GeoJSON Conversion

```typescript
/**
 * Converts Overpass API response to GeoJSON FeatureCollection
 */
interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string; geometry: any }>;
}

const convertToGeoJSON = (osmData: { elements: OSMElement[] }): GeoJSONFeatureCollection => {
  const features: GeoJSONFeature[] = [];

  for (const element of osmData.elements) {
    // Process WAY elements
    if (element.type === 'way' && element.geometry) {
      const coordinates = element.geometry.map(g => [g.lon, g.lat]);

      // Determine if polygon (closed) or linestring (open)
      const firstCoord = coordinates[0];
      const lastCoord = coordinates[coordinates.length - 1];
      const isClosed = firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1];

      features.push({
        type: 'Feature',
        id: `way/${element.id}`,
        geometry: {
          type: isClosed ? 'Polygon' : 'LineString',
          coordinates: isClosed ? [coordinates] : coordinates,
        },
        properties: {
          ...element.tags,
          osm_id: element.id,
          osm_type: 'way',
        },
      });
    }

    // Process RELATION elements (MultiPolygon)
    if (element.type === 'relation' && element.members) {
      const outerRings = element.members
        .filter(m => m.role === 'outer' && m.geometry)
        .map(m => m.geometry.map((g: any) => [g.lon, g.lat]));

      if (outerRings.length > 0) {
        features.push({
          type: 'Feature',
          id: `relation/${element.id}`,
          geometry: {
            type: 'MultiPolygon',
            coordinates: outerRings.map(ring => [ring]),
          },
          properties: {
            ...element.tags,
            osm_id: element.id,
            osm_type: 'relation',
          },
        });
      }
    }
  }

  // Sort by z-index (water first, then roads, then buildings on top)
  return {
    type: 'FeatureCollection',
    features: sortByZIndex(features),
  };
};
```

### 4.6 Feature Z-Index Sorting

```typescript
/**
 * Sorts features for proper layer ordering on the map
 * Lower z-index rendered first (bottom), higher z-index on top
 */
const getZIndex = (feature: GeoJSONFeature): number => {
  const props = feature.properties;

  if (props.natural === 'water' || props.waterway) return 1;  // Bottom layer
  if (props.highway) return 2;                                 // Middle layer
  if (props.railway) return 3;                                 // Above roads
  if (props.building) return 4;                                // Top layer

  return 0; // Default
};

const sortByZIndex = (features: GeoJSONFeature[]): GeoJSONFeature[] => {
  return features.sort((a, b) => getZIndex(a) - getZIndex(b));
};
```

### 4.7 Feature Styling Logic

```typescript
/**
 * Returns Leaflet style object based on OSM tags
 */
const getFeatureStyle = (feature: GeoJSONFeature): L.PathOptions => {
  const props = feature.properties;

  // Water features (blue tones)
  if (props.natural === 'water') {
    return {
      color: '#1D4ED8',      // Dark blue border
      fillColor: '#93C5FD',  // Light blue fill
      fillOpacity: 0.5,
      weight: 2,
    };
  }

  if (props.waterway) {
    return {
      color: '#3B82F6',      // Blue
      weight: 3,
      fillOpacity: 0,
    };
  }

  // Railways (dashed dark gray)
  if (props.railway) {
    return {
      color: '#1F2937',
      weight: 2,
      dashArray: '5, 5',     // Dashed line
      fillOpacity: 0,
    };
  }

  // Highways (orange, weight varies by importance)
  if (props.highway) {
    const majorRoads = ['motorway', 'trunk', 'primary', 'secondary'];
    const isMajor = majorRoads.includes(props.highway);

    return {
      color: '#EA580C',
      weight: isMajor ? 3 : 2,
      fillOpacity: 0,
    };
  }

  // Buildings (gray)
  if (props.building) {
    return {
      color: '#6B7280',
      fillColor: '#E5E7EB',
      fillOpacity: 0.6,
      weight: 1,
    };
  }

  // Default style
  return {
    color: '#9CA3AF',
    fillColor: '#F3F4F6',
    fillOpacity: 0.3,
    weight: 1,
  };
};
```

### 4.8 Feature Classification Logic

```typescript
/**
 * Building type configuration with colors
 */
const BUILDING_TYPES = [
  'Hospital',
  'School',
  'Residential Housing',
  'River',
  'Lake',
  'Office',
  'Others',  // Allows custom type input
] as const;

const TYPE_COLORS: Record<string, { fill: string; border: string }> = {
  'Hospital':            { fill: '#FCA5A5', border: '#DC2626' },  // Red
  'School':              { fill: '#FCD34D', border: '#D97706' },  // Amber
  'Residential Housing': { fill: '#6EE7B7', border: '#059669' },  // Green
  'River':               { fill: '#7DD3FC', border: '#0284C7' },  // Light blue
  'Lake':                { fill: '#93C5FD', border: '#1D4ED8' },  // Blue
  'Office':              { fill: '#C4B5FD', border: '#7C3AED' },  // Purple
  'Others':              { fill: '#D1D5DB', border: '#6B7280' },  // Gray
};

/**
 * Selected feature data structure
 */
interface SelectedFeature {
  id: string;
  type: string;           // Building type
  customType?: string;    // For "Others" type
  coordinates: [number, number];  // [lat, lon]
  properties: Record<string, any>;
}

/**
 * Extracts centroid coordinates from different geometry types
 */
const getFeatureCoordinates = (feature: GeoJSONFeature): [number, number] => {
  const geom = feature.geometry;

  switch (geom.type) {
    case 'Point':
      return [geom.coordinates[1], geom.coordinates[0]];

    case 'Polygon':
      // Calculate centroid (average of all vertices)
      const coords = geom.coordinates[0];
      const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
      const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
      return [sumLat / coords.length, sumLon / coords.length];

    case 'LineString':
      // Use midpoint
      const midIndex = Math.floor(geom.coordinates.length / 2);
      return [geom.coordinates[midIndex][1], geom.coordinates[midIndex][0]];

    case 'MultiPolygon':
      // Use first polygon's centroid
      const firstPoly = geom.coordinates[0][0];
      const avgLat = firstPoly.reduce((sum, c) => sum + c[1], 0) / firstPoly.length;
      const avgLon = firstPoly.reduce((sum, c) => sum + c[0], 0) / firstPoly.length;
      return [avgLat, avgLon];

    default:
      return [0, 0];
  }
};
```

### 4.9 Feature Interaction Handlers

```typescript
/**
 * Attaches event handlers to each GeoJSON feature
 */
const onEachFeature = (
  feature: GeoJSONFeature,
  layer: L.Layer,
  selectedFeatures: Map<string, SelectedFeature>,
  setSelectedFeature: (f: GeoJSONFeature) => void,
  setShowModal: (show: boolean) => void
) => {
  const featureId = feature.id as string;
  const isLabeled = selectedFeatures.has(featureId);

  // Mouse events
  layer.on({
    // Hover highlight (only for unlabeled features)
    mouseover: (e: L.LeafletMouseEvent) => {
      if (!isLabeled) {
        (e.target as L.Path).setStyle({
          fillColor: '#FEF08A',  // Yellow highlight
          fillOpacity: 0.7,
        });
      }
    },

    // Restore original style on mouse out
    mouseout: (e: L.LeafletMouseEvent) => {
      if (!isLabeled) {
        (e.target as L.Path).setStyle(getFeatureStyle(feature));
      }
    },

    // Open classification modal on click
    click: () => {
      setSelectedFeature(feature);
      setShowModal(true);
    },
  });

  // Tooltip
  const tooltipContent = isLabeled
    ? `Type: ${selectedFeatures.get(featureId)!.type}`
    : 'Click to assign type';

  (layer as L.Path).bindTooltip(tooltipContent, {
    sticky: true,
    direction: 'top',
  });
};
```

### 4.10 Submission Flow

```typescript
/**
 * Prepares and submits classified features
 */
interface SubmissionPayload {
  location: {
    lat: number;
    lon: number;
    address?: string;
  };
  radius: number;
  features: Array<{
    id: string;
    type: string;
    customType?: string;
    coordinates: [number, number];
    osmProperties: Record<string, any>;
  }>;
  submittedAt: string;
}

const handleSubmit = async (
  location: { lat: number; lon: number; address?: string },
  radius: number,
  selectedFeatures: Map<string, SelectedFeature>
) => {
  const payload: SubmissionPayload = {
    location,
    radius,
    features: Array.from(selectedFeatures.values()).map(f => ({
      id: f.id,
      type: f.type,
      customType: f.customType,
      coordinates: f.coordinates,
      osmProperties: f.properties,
    })),
    submittedAt: new Date().toISOString(),
  };

  // Submit to backend
  const response = await fetch('/api/details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.json();
};
```

---

## 5. API Reference

### 5.1 OSM Data Endpoint

#### Request

```http
POST /api/osm
Content-Type: application/json

{
  "lat": -6.358137,
  "lon": 106.835432,
  "radius": 300
}
```

#### Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `lat` | number | Yes | Latitude coordinate | -90 to 90 |
| `lon` | number | Yes | Longitude coordinate | -180 to 180 |
| `radius` | number | Yes | Search radius in meters | 50 to 1000 |

#### Response (Success - 200)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "way/123456789",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[106.835, -6.358], [106.836, -6.358], ...]]
      },
      "properties": {
        "building": "residential",
        "name": "Example Building",
        "osm_id": 123456789,
        "osm_type": "way"
      }
    },
    {
      "type": "Feature",
      "id": "way/987654321",
      "geometry": {
        "type": "LineString",
        "coordinates": [[106.834, -6.357], [106.835, -6.358], ...]
      },
      "properties": {
        "highway": "primary",
        "name": "Main Street",
        "osm_id": 987654321,
        "osm_type": "way"
      }
    }
  ]
}
```

#### Response (Error - 400)

```json
{
  "error": "Missing required parameters: lat, lon, radius"
}
```

#### Response (Error - 500)

```json
{
  "error": "Failed to fetch OSM data",
  "message": "Overpass API timeout"
}
```

### 5.2 Nominatim Geocoding (External)

#### Request

```http
GET https://nominatim.openstreetmap.org/search
    ?format=json
    &q=Jakarta,%20Indonesia
    &limit=1
```

#### Response

```json
[
  {
    "place_id": 282935825,
    "lat": "-6.2087634",
    "lon": "106.845599",
    "display_name": "Jakarta, Special Capital Region of Jakarta, Java, Indonesia",
    "type": "city"
  }
]
```

---

## 6. Component Details

### 6.1 MapComponent Props & State

```typescript
// Component state
interface MapComponentState {
  // Location
  location: { lat: number; lon: number } | null;
  searchQuery: string;
  address: string;

  // Map settings
  radius: number;  // 50-1000
  zoom: number;    // 13-19

  // Data
  geoJsonData: GeoJSONFeatureCollection | null;
  selectedFeatures: Map<string, SelectedFeature>;

  // UI
  isLoading: boolean;
  showClassificationModal: boolean;
  showSubmissionModal: boolean;
  showAIDecisionModal: boolean;
  currentFeature: GeoJSONFeature | null;

  // Classification
  selectedType: string;
  customType: string;
}
```

### 6.2 Key Component Methods

| Method | Purpose |
|--------|---------|
| `handleSearch()` | Geocodes location query and updates map center |
| `handleFetchData()` | Fetches OSM data for current location/radius |
| `handleFeatureClick()` | Opens classification modal for clicked feature |
| `handleClassify()` | Saves feature classification to state |
| `handleSubmit()` | Submits all classified features to backend |
| `getFeatureStyle()` | Returns Leaflet style for a feature |
| `onEachFeature()` | Attaches event handlers to features |

### 6.3 UI Components

```
MapComponent
├── Header
│   ├── Search Input (location query)
│   ├── Search Button
│   └── Geolocation Button
│
├── Controls
│   ├── Radius Slider (50-1000m)
│   ├── Fetch Data Button
│   └── Submit Button
│
├── Map Container
│   ├── TileLayer (CARTO base map)
│   ├── GeoJSON Layer (OSM features)
│   └── Rectangle (bounding box visualization)
│
├── Legend
│   ├── Building Type Colors
│   └── Feature Count
│
└── Modals
    ├── Classification Modal
    │   ├── Type Dropdown
    │   ├── Custom Type Input (for "Others")
    │   └── Confirm/Cancel Buttons
    │
    ├── Submission Modal
    │   ├── Feature Summary List
    │   └── Confirm/Cancel Buttons
    │
    └── AI Decision Modal
        └── Processing Notification
```

---

## 7. Configuration

### 7.1 Default Settings

```typescript
// Default map center (Jakarta, Indonesia)
const DEFAULT_LOCATION = {
  lat: -6.358137,
  lon: 106.835432,
};

// Default zoom level
const DEFAULT_ZOOM = 16;

// Radius constraints
const MIN_RADIUS = 50;    // meters
const MAX_RADIUS = 1000;  // meters
const RADIUS_STEP = 50;   // meters

// Overpass API timeout
const OVERPASS_TIMEOUT = 25;  // seconds
```

### 7.2 Environment Variables

```env
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001

# Backend (.env)
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/civilapp
```

### 7.3 Tile Layer Configuration

```typescript
const TILE_CONFIG = {
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
};
```

---

## 8. Error Handling

### 8.1 Frontend Error Handling

```typescript
// Location search errors
try {
  const result = await searchLocation(query);
  setLocation(result);
} catch (error) {
  if (error.message.includes('No results')) {
    showToast('Location not found. Try a different search term.');
  } else {
    showToast('Failed to search location. Please try again.');
  }
}

// OSM data fetch errors
try {
  const data = await fetchOSMData(location, radius);
  setGeoJsonData(data);
} catch (error) {
  if (error.message.includes('timeout')) {
    showToast('Request timed out. Try a smaller radius.');
  } else {
    showToast('Failed to fetch map data. Please try again.');
  }
}
```

### 8.2 API Error Responses

| Status Code | Condition | Response |
|-------------|-----------|----------|
| 400 | Missing parameters | `{ error: "Missing required parameters: lat, lon, radius" }` |
| 400 | Invalid coordinates | `{ error: "Invalid coordinates" }` |
| 408 | Overpass timeout | `{ error: "Request timeout", message: "Try a smaller radius" }` |
| 500 | Server error | `{ error: "Internal server error", message: "..." }` |
| 503 | Overpass unavailable | `{ error: "OSM service unavailable" }` |

### 8.3 Geolocation Error Handling

```typescript
navigator.geolocation.getCurrentPosition(
  // Success
  (position) => {
    setLocation({
      lat: position.coords.latitude,
      lon: position.coords.longitude,
    });
  },
  // Error
  (error) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        showToast('Location permission denied. Using default location.');
        break;
      case error.POSITION_UNAVAILABLE:
        showToast('Location unavailable. Using default location.');
        break;
      case error.TIMEOUT:
        showToast('Location request timed out. Using default location.');
        break;
    }
    setLocation(DEFAULT_LOCATION);
  }
);
```

---

## 9. File Structure

```
CivilConstructionApp/
├── frontend/
│   ├── app/
│   │   ├── map/
│   │   │   ├── page.tsx              # Dynamic import wrapper
│   │   │   └── MapComponent.tsx      # Main map component (892 lines)
│   │   │
│   │   ├── api/
│   │   │   └── osm/
│   │   │       └── route.ts          # Next.js API route (174 lines)
│   │   │
│   │   └── page.tsx                  # Home page with navigation
│   │
│   ├── public/
│   │   └── marker-icon.png           # Custom map markers
│   │
│   └── package.json                  # Dependencies: leaflet, react-leaflet
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   └── osm.controller.ts     # OSM controller (174 lines)
│   │   │
│   │   ├── routes/
│   │   │   └── osm.routes.ts         # Route definitions (58 lines)
│   │   │
│   │   └── index.ts                  # Express app setup
│   │
│   ├── prisma/
│   │   └── schema.prisma             # Database schema
│   │
│   └── package.json                  # Dependencies: express, axios
│
└── docs/
    └── OSM_GEOSPATIAL_MAP_TECHNICAL_DOCUMENT.md  # This document
```

---

## Appendix A: OSM Tag Reference

### Infrastructure Tags Queried

| Category | OSM Tag | Example Values |
|----------|---------|----------------|
| Buildings | `building` | `yes`, `residential`, `commercial`, `industrial` |
| Roads | `highway` | `motorway`, `primary`, `secondary`, `residential` |
| Railways | `railway` | `rail`, `subway`, `tram`, `light_rail` |
| Waterways | `waterway` | `river`, `stream`, `canal`, `drain` |
| Water Bodies | `natural=water` | `lake`, `pond`, `reservoir` |

### Additional Properties Available

| Property | Description |
|----------|-------------|
| `name` | Feature name (if tagged) |
| `addr:street` | Street address |
| `addr:housenumber` | Building number |
| `building:levels` | Number of floors |
| `height` | Building height |
| `amenity` | Facility type (hospital, school, etc.) |

---

## Appendix B: GeoJSON Specification

### Feature Structure

```typescript
interface GeoJSONFeature {
  type: 'Feature';
  id: string;           // "way/123456" or "relation/789"
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
  properties: {
    osm_id: number;
    osm_type: 'node' | 'way' | 'relation';
    [key: string]: any;  // All OSM tags
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}
```

---

## Appendix C: Leaflet Style Options

```typescript
interface LeafletPathOptions {
  color: string;        // Stroke color
  weight: number;       // Stroke width in pixels
  opacity: number;      // Stroke opacity (0-1)
  fillColor: string;    // Fill color
  fillOpacity: number;  // Fill opacity (0-1)
  dashArray: string;    // Dash pattern (e.g., "5, 5")
  lineCap: string;      // Line cap style
  lineJoin: string;     // Line join style
}
```

---

**Document End**
