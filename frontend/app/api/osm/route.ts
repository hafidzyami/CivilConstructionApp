import { NextRequest, NextResponse } from 'next/server';

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
  } catch (error: any) {
    console.error('OSM API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch OSM data' },
      { status: 500 }
    );
  }
}

// Convert Overpass JSON to GeoJSON
function convertToGeoJSON(osmData: any): any {
  const features: any[] = [];

  if (!osmData.elements) {
    return { type: 'FeatureCollection', features: [] };
  }

  osmData.elements.forEach((element: any) => {
    let geometry: any = null;
    const properties = { ...element.tags, osm_id: element.id, osm_type: element.type };

    // Handle different element types
    if (element.type === 'node' && element.lat && element.lon) {
      geometry = {
        type: 'Point',
        coordinates: [element.lon, element.lat],
      };
    } else if (element.type === 'way' && element.geometry) {
      const coordinates = element.geometry.map((node: any) => [node.lon, node.lat]);

      // Check if way is closed (polygon)
      const isClosed =
        coordinates.length > 2 &&
        coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
        coordinates[0][1] === coordinates[coordinates.length - 1][1];

      if (isClosed && (element.tags.building || element.tags.natural === 'water')) {
        geometry = {
          type: 'Polygon',
          coordinates: [coordinates],
        };
      } else {
        geometry = {
          type: 'LineString',
          coordinates: coordinates,
        };
      }
    } else if (element.type === 'relation' && element.members) {
      // For relations, try to construct multipolygon
      const outerWays = element.members
        .filter((m: any) => m.role === 'outer' && m.geometry)
        .map((m: any) => m.geometry.map((node: any) => [node.lon, node.lat]));

      if (outerWays.length > 0) {
        geometry = {
          type: 'MultiPolygon',
          coordinates: outerWays.map((way: any) => [way]),
        };
      }
    }

    if (geometry) {
      features.push({
        type: 'Feature',
        geometry: geometry,
        properties: properties,
      });
    }
  });

  // Sort features by z-index (water < roads/railways < buildings)
  features.sort((a, b) => {
    const getZIndex = (feature: any) => {
      const props = feature.properties;
      if (props.natural === 'water' || props.waterway) return 0;
      if (props.highway || props.railway) return 1;
      if (props.building) return 2;
      return 1;
    };
    return getZIndex(a) - getZIndex(b);
  });

  return {
    type: 'FeatureCollection',
    features: features,
  };
}
