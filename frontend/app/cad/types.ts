export interface PolygonData {
  id: number;
  points: number[][];
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
}

export type AppStep = 'upload' | 'layers' | 'analyze';
export type ActiveMode = 'site' | 'building';