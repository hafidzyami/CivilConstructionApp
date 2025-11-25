import { NextRequest, NextResponse } from 'next/server';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

interface OSMRequest {
  lat: number;
  lon: number;
  radius: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: OSMRequest = await request.json();
    const { lat, lon, radius } = body;

    // Validate input
    if (!lat || !lon || !radius) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat, lon, radius' },
        { status: 400 }
      );
    }

    // Calculate bounding box
    // Approximate: 1 degree ≈ 111km, convert radius from meters
    const latDelta = radius / 111000;
    const lonDelta = radius / (111000 * Math.cos((lat * Math.PI) / 180));

    const bbox = {
      south: lat - latDelta,
      west: lon - lonDelta,
      north: lat + latDelta,
      east: lon + lonDelta,
    };

    // Build Overpass QL query
    // Match Python app.py tags: building, waterway, natural:water, highway, railway
    const overpassQuery = `
      [out:json][timeout:25];
      (
        // Buildings
        way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        
        // Waterways
        way["waterway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["waterway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        
        // Natural water
        way["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        
        // Highways
        way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        
        // Railways
        way["railway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out geom;
    `;

    // Query Overpass API
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.statusText}`);
    }

    const osmData = await response.json();

    // Convert to GeoJSON
    const geojson = convertToGeoJSON(osmData);

    return NextResponse.json(geojson);
  } catch (error: unknown) {
    console.error('OSM API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || 'Failed to fetch OSM data' }, { status: 500 });
  }
}

// Convert Overpass JSON to GeoJSON
function convertToGeoJSON(osmData: unknown): FeatureCollection {
  const features: Feature[] = [];

  const elements = (osmData as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) {
    return { type: 'FeatureCollection', features };
  }

  elements.forEach((element) => {
    if (!element || typeof element !== 'object') return;
    const el = element as Record<string, unknown>;

    let geometry: Geometry | null = null;
    const tags = (el.tags as Record<string, unknown>) ?? {};
    const properties = { ...tags, osm_id: el.id, osm_type: el.type } as Record<string, unknown>;

    const elType = typeof el.type === 'string' ? el.type : undefined;

    if (elType === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const lat = Number(el.lat);
      const lon = Number(el.lon);
      geometry = { type: 'Point', coordinates: [lon, lat] };
    } else if (elType === 'way' && Array.isArray(el.geometry)) {
      const coords = (el.geometry as unknown[]).map((node) => {
        const n = node as Record<string, unknown>;
        return [Number(n.lon), Number(n.lat)];
      });

      const isClosed =
        coords.length > 2 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      const hasBuilding = Boolean((tags as Record<string, unknown>)['building']);
      const isNaturalWater = (tags as Record<string, unknown>)['natural'] === 'water';

      if (isClosed && (hasBuilding || isNaturalWater)) {
        geometry = { type: 'Polygon', coordinates: [coords as [number, number][]] } as Geometry;
      } else {
        geometry = { type: 'LineString', coordinates: coords as [number, number][] } as Geometry;
      }
    } else if (elType === 'relation' && Array.isArray(el.members)) {
      const outerWays = (el.members as unknown[])
        .filter(
          (m) =>
            m &&
            typeof m === 'object' &&
            (m as Record<string, unknown>).role === 'outer' &&
            Array.isArray((m as Record<string, unknown>).geometry)
        )
        .map((m) => (m as Record<string, unknown>).geometry as unknown[])
        .map((way) =>
          (way as unknown[]).map((node) => {
            const n = node as Record<string, unknown>;
            return [Number(n.lon), Number(n.lat)];
          })
        );

      if (outerWays.length > 0) {
        geometry = {
          type: 'MultiPolygon',
          coordinates: outerWays.map((w) => [w as [number, number][]]),
        } as Geometry;
      }
    }

    if (geometry) {
      features.push({ type: 'Feature', geometry, properties } as Feature);
    }
  });

  // Sort features by z-index (water < roads/railways < buildings)
  features.sort((a, b) => {
    const getZIndex = (feature: Feature) => {
      const props = (feature.properties || {}) as Record<string, unknown>;
      if (props.natural === 'water' || props.waterway) return 0;
      if (props.highway || props.railway) return 1;
      if (props.building) return 2;
      return 1;
    };
    return getZIndex(a) - getZIndex(b);
  });

  return { type: 'FeatureCollection', features };
}
