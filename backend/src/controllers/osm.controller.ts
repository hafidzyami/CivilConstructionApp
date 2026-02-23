import { Request, Response } from 'express';
import axios from 'axios';
import logger from '../lib/logger';

const CONTEXT = 'OSM';

interface OSMRequest {
  lat: number;
  lon: number;
  radius: number;
}

interface OSMElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: Array<{
    type: string;
    ref: number;
    role: string;
  }>;
}

interface OSMResponse {
  elements: OSMElement[];
}

interface GeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export const getOSMData = async (
  req: Request<object, object, OSMRequest>,
  res: Response
): Promise<void> => {
  try {
    const { lat, lon, radius } = req.body;

    // Validate input
    if (!lat || !lon || !radius) {
      logger.warn(CONTEXT, 'getOSMData: missing required parameters', { lat, lon, radius });
      res.status(400).json({
        error: 'Missing required parameters: lat, lon, radius',
      });
      return;
    }

    logger.info(CONTEXT, 'getOSMData: fetching OSM data', { lat, lon, radius });

    // Calculate bounding box
    const latDelta = radius / 111000;
    const lonDelta = radius / (111000 * Math.cos((lat * Math.PI) / 180));

    const bbox = {
      south: lat - latDelta,
      west: lon - lonDelta,
      north: lat + latDelta,
      east: lon + lonDelta,
    };

    // Build Overpass QL query
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["waterway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["waterway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["railway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        relation["railway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out body;
      >;
      out skel qt;
    `;

    // Fetch from Overpass API
    const response = await axios.post<OSMResponse>(
      OVERPASS_URL,
      `data=${encodeURIComponent(overpassQuery)}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      }
    );

    const osmData = response.data;

    // Build node coordinate lookup
    const nodeCoords: Record<number, [number, number]> = {};
    osmData.elements.forEach((el: OSMElement) => {
      if (el.type === 'node' && el.lat && el.lon) {
        nodeCoords[el.id] = [el.lon, el.lat];
      }
    });

    // Convert to GeoJSON
    const features: GeoJSONFeature[] = [];

    osmData.elements.forEach((el: OSMElement) => {
      if (el.type === 'way' && el.nodes) {
        const coords = el.nodes
          .map((nid: number) => nodeCoords[nid])
          .filter((c): c is [number, number] => c !== undefined);

        if (coords.length > 0) {
          const geomType =
            coords.length > 2 &&
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]
              ? 'Polygon'
              : 'LineString';

          features.push({
            type: 'Feature',
            id: `way/${el.id}`,
            geometry: {
              type: geomType,
              coordinates: geomType === 'Polygon' ? [coords] : coords,
            },
            properties: el.tags || {},
          });
        }
      } else if (el.type === 'node' && el.lat && el.lon) {
        if (el.tags && Object.keys(el.tags).length > 0) {
          features.push({
            type: 'Feature',
            id: `node/${el.id}`,
            geometry: {
              type: 'Point',
              coordinates: [el.lon, el.lat],
            },
            properties: el.tags,
          });
        }
      }
    });

    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    logger.info(CONTEXT, 'getOSMData: succeeded', { featureCount: features.length });
    res.json(geojson);
  } catch (error: unknown) {
    logger.error(CONTEXT, 'getOSMData: failed', { error: error instanceof Error ? error.message : String(error) });
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: 'Failed to fetch OSM data',
        message: error.message,
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
