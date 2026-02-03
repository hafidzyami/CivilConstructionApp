export interface PolygonData {
  id: number;
  points: number[][]; // Keep points for raw data
  path?: string;      // NEW: SVG Path string for rendering with holes
  bbox: {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
  };
  area_raw: number;
  area_m2: number;
}

export interface Bounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export interface Selection {
  isSite: boolean;
  isBuilding: boolean;
  floors: number;
  isFootprint: boolean;
}

export interface MetricsData {
  siteArea: number;
  footprintArea: number;
  totalFloorArea: number;
  bcr: number;
  far: number;
  numFloors?: number | null;
  buildingHeight?: number | null;
}

export interface AutoAnalysis {
  site_area: number;
  footprint_area: number;
  total_floor_area: number;
  floors: Record<string, number>;
  btl: number;
  far: number;
  materials_count?: number;
  num_floors?: number;
  building_height_m?: number;
}

export type AppStep = 'upload' | 'layers' | 'analyze';
export type ActiveMode = 'site' | 'building';
export type ParserMode = 'manual' | 'python' | 'llm';