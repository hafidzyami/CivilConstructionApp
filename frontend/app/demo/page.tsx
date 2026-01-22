'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection } from 'geojson';

// Dynamic import for map to avoid SSR
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
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);
const Rectangle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Rectangle),
  { ssr: false }
);

type Step = 'ocr' | 'cad' | 'infrastructure' | 'complete';
type CADStep = 'upload' | 'layers' | 'analyze';
type ActiveMode = 'site' | 'building';
type BuildingType = 'Hospital' | 'School' | 'Residential Housing' | 'River' | 'Lake' | 'Office' | 'Others';

const BUILDING_TYPES: BuildingType[] = [
  'Hospital',
  'School',
  'Residential Housing',
  'River',
  'Lake',
  'Office',
  'Others'
];

const TYPE_COLORS: Record<BuildingType, { color: string; fillColor: string }> = {
  'Hospital': { color: '#DC2626', fillColor: '#FCA5A5' },
  'School': { color: '#D97706', fillColor: '#FCD34D' },
  'Residential Housing': { color: '#059669', fillColor: '#6EE7B7' },
  'River': { color: '#0284C7', fillColor: '#7DD3FC' },
  'Lake': { color: '#1D4ED8', fillColor: '#93C5FD' },
  'Office': { color: '#7C3AED', fillColor: '#C4B5FD' },
  'Others': { color: '#6B7280', fillColor: '#D1D5DB' }
};

interface OCRResult {
  success: boolean;
  textContent?: string;
  results?: {
    text_lines: Array<{
      text: string;
      bbox: number[];
      confidence: number;
    }>;
  };
  preprocessedImage?: string;
  preprocessingMetadata?: {
    rotation_applied?: number;
  };
  error?: string;
}

interface PolygonData {
  id: number;
  area_m2: number;
  area_raw: number;
  points: number[][];
  path: string;
  bbox?: { min_x: number; max_x: number; min_y: number; max_y: number };
}

interface Selection {
  isSite: boolean;
  isBuilding: boolean;
  floors: number;
  isFootprint: boolean;
}

interface SelectedFeature {
  featureId: string;
  type: BuildingType;
  customType?: string;
  lat: number;
  lon: number;
}

interface Bounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

// Map click handler component
function MapClickHandler({ onClick }: { onClick: (e: any) => void }) {
  const map = useMapEvents({
    click: (e) => {
      onClick(e);
    },
  });
  return null;
}

export default function DemoPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('ocr');
  const [userId, setUserId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OCR state
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrPreviews, setOcrPreviews] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [ocrEngine, setOcrEngine] = useState<'surya' | 'paddle' | 'hybrid'>('hybrid');
  const [usePreprocessing, setUsePreprocessing] = useState(true);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  // CAD state
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [cadLayers, setCadLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [cadStep, setCadStep] = useState<CADStep>('upload');
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});
  const [activeMode, setActiveMode] = useState<ActiveMode>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);
  const [simplify, setSimplify] = useState(false);
  const [svgViewBox, setSvgViewBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [svgZoom, setSvgZoom] = useState(1);
  const [svgPan, setSvgPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Infrastructure state
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.358137, 106.835432]);
  const [mapZoom, setMapZoom] = useState(16);
  const [mapRadius, setMapRadius] = useState(300);
  const [searchInput, setSearchInput] = useState('');
  const [osmData, setOsmData] = useState<FeatureCollection | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Map<string, SelectedFeature>>(new Map());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [tempBuildingType, setTempBuildingType] = useState<BuildingType>('Hospital');
  const [tempCustomType, setTempCustomType] = useState('');
  const [geoJsonKey, setGeoJsonKey] = useState(0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    initializeDemo();
    
    // Fix Leaflet icon issues on client-side only
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
      });
    }
  }, []);

  const initializeDemo = async () => {
    try {
      setLoading(true);
      const userIdRes = await fetch(`${API_URL}/demo/next-user-id`);
      const userIdData = await userIdRes.json();
      const newUserId = userIdData.data.userId;
      setUserId(newUserId);

      const sessionRes = await fetch(`${API_URL}/demo/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUserId }),
      });
      const sessionData = await sessionRes.json();
      setSessionId(sessionData.data.id);
    } catch (err: any) {
      setError('Failed to initialize demo session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // OCR Handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      handleOcrFileSelect(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleOcrFileSelect = (files: File[]) => {
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    const validFiles = files.filter(f => validTypes.includes(f.type));
    if (validFiles.length !== files.length) {
      setError('Some files were skipped. Only PDF, DOC, DOCX, and images are allowed');
    }

    // Create previews for images
    const newPreviews: string[] = [];
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          if (newPreviews.length === validFiles.filter(f => f.type.startsWith('image/')).length) {
            setOcrPreviews(prev => [...prev, ...newPreviews]);
          }
        };
        reader.readAsDataURL(file);
      }
    });

    setOcrFiles(prev => [...prev, ...validFiles]);
  };

  const processOCR = async () => {
    if (ocrFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setOcrProcessing(true);
    setError('');
    const results: OCRResult[] = [];

    try {
      // Process each file
      for (const file of ocrFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('preprocessing', usePreprocessing.toString());
        formData.append('engine', ocrEngine);

        const response = await fetch(`${API_URL}/ocr/process`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        results.push(data);
      }

      // Upload all files to MinIO
      const uploadFormData = new FormData();
      uploadFormData.append('sessionId', sessionId!.toString());
      ocrFiles.forEach(file => {
        uploadFormData.append('documents', file);
      });

      const uploadRes = await fetch(`${API_URL}/demo/upload-documents`, {
        method: 'POST',
        body: uploadFormData,
      });

      const uploadData = await uploadRes.json();
      
      if (uploadData.success) {
        const uploadedDocs = uploadData.data;
        
        // Save OCR results to database for each document
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const ocrFormData = new FormData();
          ocrFormData.append('sessionId', sessionId!.toString());
          ocrFormData.append('extractedText', result.textContent || '');
          ocrFormData.append('engine', ocrEngine);
          ocrFormData.append('fileName', ocrFiles[i].name);
          ocrFormData.append('fileUrl', uploadedDocs[i]?.fileUrl || '');

          await fetch(`${API_URL}/demo/ocr-data`, {
            method: 'POST',
            body: ocrFormData,
          });
        }

        setOcrResults(results);
      }
    } catch (err: any) {
      setError('Failed to process OCR: ' + err.message);
    } finally {
      setOcrProcessing(false);
    }
  };

  const downloadOCRText = (index: number) => {
    const result = ocrResults[index];
    if (!result?.textContent) return;

    const blob = new Blob([result.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${index + 1}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // CAD Handlers
  const handleCadFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Please select a valid .dxf file');
      return;
    }

    setCadFile(file);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/cad/layers`, { method: 'POST', body: formData });
      const data = await res.json();
      setCadLayers(data.layers || []);
      setSelectedLayers(data.layers || []);
      setCadStep('layers');
    } catch (err) {
      setError('Failed to load CAD layers');
    } finally {
      setLoading(false);
    }
  };

  const processCad = async () => {
    if (!cadFile) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', cadFile);
      formData.append('layers', JSON.stringify(selectedLayers));
      formData.append('simplify', String(simplify));

      const res = await fetch(`${API_URL}/cad/process`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.polygons) {
        // Process polygons with bbox and hole detection
        let processed = data.polygons.map((p: any) => {
          const xs = p.points.map((pt: number[]) => pt[0]);
          const ys = p.points.map((pt: number[]) => pt[1]);
          return {
            ...p,
            bbox: { 
              min_x: Math.min(...xs), max_x: Math.max(...xs), 
              min_y: Math.min(...ys), max_y: Math.max(...ys) 
            }
          };
        });

        processed.sort((a: any, b: any) => b.area_raw - a.area_raw);

        const isPointInPoly = (pt: number[], polyPts: number[][]) => {
          const x = pt[0], y = pt[1];
          let inside = false;
          for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) {
            const xi = polyPts[i][0], yi = polyPts[i][1];
            const xj = polyPts[j][0], yj = polyPts[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        };

        const finalPolys = processed.map((outer: any, i: number) => {
          const holePaths: string[] = [];

          for (let j = i + 1; j < processed.length; j++) {
            const inner = processed[j];
            
            if (inner.bbox.min_x < outer.bbox.min_x || 
                inner.bbox.max_x > outer.bbox.max_x ||
                inner.bbox.min_y < outer.bbox.min_y || 
                inner.bbox.max_y > outer.bbox.max_y) {
              continue;
            }

            if (isPointInPoly(inner.points[0], outer.points)) {
              const midIdx = Math.floor(inner.points.length / 2);
              if (isPointInPoly(inner.points[midIdx], outer.points)) {
                const pts = inner.points;
                const d = `M ${pts[0][0]} ${pts[0][1]} ` + 
                          pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + "Z";
                holePaths.push(d);
              }
            }
          }

          const pts = outer.points;
          let pathString = `M ${pts[0][0]} ${pts[0][1]} ` + 
                           pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + "Z";
          
          if (holePaths.length > 0) {
            pathString += " " + holePaths.join(" ");
          }

          return { ...outer, path: pathString };
        });

        setPolygons(finalPolys);
        setBounds(data.bounds);
        setCadStep('analyze');

        // Initialize SVG viewBox
        const width = data.bounds.max_x - data.bounds.min_x;
        const height = data.bounds.max_y - data.bounds.min_y;
        setSvgViewBox({ x: data.bounds.min_x, y: data.bounds.min_y, width, height });
        setSvgZoom(1);
        setSvgPan({ x: 0, y: 0 });

        // Save to database
        const areas = finalPolys.map((p: any) => p.area_raw);
        const totalArea = areas.reduce((a: number, b: number) => a + b, 0);

        const cadSaveRes = await fetch(`${API_URL}/demo/cad-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            siteArea: totalArea,
            buildingArea: finalPolys[0]?.area_raw || 0,
            floorArea: totalArea,
            rawData: data,
          }),
        });

        const cadSaveData = await cadSaveRes.json();
        console.log('CAD data saved:', cadSaveData);
        
        if (!cadSaveData.success) {
          console.error('CAD save failed:', cadSaveData);
          setError('Warning: CAD data may not have been saved properly');
        }
      }
    } catch (err) {
      setError('Failed to process CAD file');
    } finally {
      setLoading(false);
    }
  };

  const togglePoly = (id: number) => {
    setSelections((prev) => {
      const next = { ...prev };
      const current = next[id] ? { ...next[id] } : { isSite: false, isBuilding: false, floors: 1, isFootprint: true };

      if (activeMode === 'site') current.isSite = !current.isSite;
      else {
        if (!current.isBuilding) { current.floors = floorCount; current.isFootprint = isFootprint; }
        current.isBuilding = !current.isBuilding;
      }

      if (!current.isSite && !current.isBuilding) delete next[id];
      else next[id] = current;
      return next;
    });
  };

  const cadMetrics = useMemo(() => {
    let siteArea = 0;
    let footprintArea = 0;
    let totalFloorArea = 0;
    Object.entries(selections).forEach(([idStr, sel]) => {
      const poly = polygons.find((p) => p.id === parseInt(idStr));
      if (!poly) return;
      if (sel.isSite) siteArea += poly.area_m2;
      if (sel.isBuilding) {
        if (sel.isFootprint) footprintArea += poly.area_m2;
        totalFloorArea += poly.area_m2 * sel.floors;
      }
    });
    const bcr = siteArea > 0 ? (footprintArea / siteArea) * 100 : 0;
    const far = siteArea > 0 ? (totalFloorArea / siteArea) : 0;
    return { siteArea, footprintArea, totalFloorArea, bcr, far };
  }, [selections, polygons]);

  const handleSvgWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    setSvgZoom(prev => Math.max(0.1, Math.min(10, prev * zoomFactor)));
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.shiftKey) { // Middle mouse or Shift+Click
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - svgPan.x, y: e.clientY - svgPan.y });
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      e.preventDefault();
      setSvgPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleSvgMouseUp = () => {
    setIsPanning(false);
  };

  const resetSvgView = () => {
    setSvgZoom(1);
    setSvgPan({ x: 0, y: 0 });
  };

  const currentViewBox = useMemo(() => {
    const centerX = svgViewBox.x + svgViewBox.width / 2;
    const centerY = svgViewBox.y + svgViewBox.height / 2;
    const newWidth = svgViewBox.width / svgZoom;
    const newHeight = svgViewBox.height / svgZoom;
    const panOffsetX = (svgPan.x / 100) * newWidth;
    const panOffsetY = (svgPan.y / 100) * newHeight;
    return {
      x: centerX - newWidth / 2 - panOffsetX,
      y: centerY - newHeight / 2 - panOffsetY,
      width: newWidth,
      height: newHeight
    };
  }, [svgViewBox, svgZoom, svgPan]);

  // Infrastructure Handlers
  const calculateZoom = (dist: number): number => {
    return Math.max(13, 19 - Math.floor(Math.log2(dist / 50)));
  };

  const fetchOSMData = useCallback(async () => {
    setLoading(true);
    setOsmData(null);
    setError('');

    try {
      const response = await fetch(`${API_URL}/osm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: mapCenter[0],
          lon: mapCenter[1],
          radius: mapRadius,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OSM data: ${response.statusText}`);
      }

      const data = (await response.json()) as FeatureCollection;
      setOsmData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [mapCenter, mapRadius, API_URL]);

  const handleSearchLocation = async () => {
    setError('');

    const coordMatch = searchInput.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setMapCenter([lat, lon]);
      setMapZoom(calculateZoom(mapRadius));
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
        setMapCenter([lat, lon]);
        setMapZoom(calculateZoom(mapRadius));
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

  const getFeatureId = (feature: Feature): string => {
    const props = feature.properties as Record<string, unknown>;
    return props.osm_id ? String(props.osm_id) : JSON.stringify(feature.geometry);
  };

  const getFeatureCoordinates = (feature: Feature): { lat: number; lon: number } => {
    if (feature.geometry.type === 'Point') {
      const coords = (feature.geometry as any).coordinates;
      return { lat: coords[1], lon: coords[0] };
    } else if (feature.geometry.type === 'Polygon') {
      const coords = (feature.geometry as any).coordinates[0];
      const lats = coords.map((c: number[]) => c[1]);
      const lons = coords.map((c: number[]) => c[0]);
      return {
        lat: lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
        lon: lons.reduce((a: number, b: number) => a + b, 0) / lons.length,
      };
    }
    return { lat: mapCenter[0], lon: mapCenter[1] };
  };

  const assignFeatureType = () => {
    if (!selectedFeatureId) return;
    if (tempBuildingType === 'Others' && !tempCustomType.trim()) {
      setError('Please enter a custom type name');
      return;
    }

    const feature = osmData?.features.find(f => getFeatureId(f) === selectedFeatureId);
    if (!feature) return;

    const coords = getFeatureCoordinates(feature);
    
    setSelectedFeatures(prev => {
      const newMap = new Map(prev);
      newMap.set(selectedFeatureId, {
        featureId: selectedFeatureId,
        type: tempBuildingType,
        customType: tempBuildingType === 'Others' ? tempCustomType : undefined,
        lat: coords.lat,
        lon: coords.lon,
      });
      return newMap;
    });

    setGeoJsonKey(prev => prev + 1);
    setSelectedFeatureId(null);
    setTempCustomType('');
  };

  const submitInfrastructureData = async () => {
    const featuresArray = Array.from(selectedFeatures.values());
    
    try {
      const infraRes = await fetch(`${API_URL}/demo/infrastructure-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          radius: mapRadius,
          results: {
            features: osmData?.features || [],
            labeled: featuresArray,
          },
        }),
      });

      const infraData = await infraRes.json();
      console.log('Infrastructure data saved:', infraData);
      
      if (!infraData.success) {
        console.error('Infrastructure save failed:', infraData);
        setError('Warning: Infrastructure data may not have been saved properly');
        return;
      }

      setCurrentStep('complete');
    } catch (err: any) {
      console.error('Infrastructure save error:', err);
      setError('Failed to submit infrastructure data: ' + err.message);
    }
  };

  const geoJsonStyle = (feature: any) => {
    const featureId = getFeatureId(feature);
    const selectedFeature = selectedFeatures.get(featureId);

    if (selectedFeature) {
      const colors = TYPE_COLORS[selectedFeature.type];
      return {
        color: colors.color,
        fillColor: colors.fillColor,
        weight: 2,
        fillOpacity: 0.5,
      };
    }

    return {
      color: '#3B82F6',
      fillColor: '#93C5FD',
      weight: 2,
      fillOpacity: 0.3,
    };
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'ocr':
        return (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left: Upload & Options */}
            <div className="space-y-6">
              {/* File Upload */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Upload Documents</h2>

                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                    dragActive
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-300 hover:border-purple-400 bg-slate-50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {ocrFiles.length > 0 ? (
                    <div className="space-y-4">
                      <p className="font-semibold text-slate-700">{ocrFiles.length} file(s) selected:</p>
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {ocrFiles.map((file, idx) => (
                          <div key={idx} className="text-sm text-slate-600 p-2 bg-white rounded">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-xs">{(file.size / 1024).toFixed(2)} KB</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setOcrFiles([]);
                          setOcrPreviews([]);
                          setOcrResults([]);
                        }}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Clear All
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-lg font-medium text-slate-700 mb-2">Drag and drop files here</p>
                      <p className="text-sm text-slate-500 mb-4">or click to browse</p>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={(e) => e.target.files && handleOcrFileSelect(Array.from(e.target.files))}
                        className="hidden"
                        id="ocr-file-upload"
                      />
                      <label
                        htmlFor="ocr-file-upload"
                        className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        Select Files
                      </label>
                      <p className="text-xs text-slate-400 mt-4">Supported: PDF, DOC, DOCX, JPG, PNG</p>
                    </div>
                  )}
                </div>
              </div>

              {/* OCR Options */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">OCR Options</h2>

                {/* Preprocessing Toggle */}
                <div className="mb-6">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-lg font-medium text-slate-900">Preprocessing</span>
                      <p className="text-sm text-slate-500">Apply rotation and skew correction</p>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={usePreprocessing}
                        onChange={(e) => setUsePreprocessing(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-8 bg-slate-300 rounded-full peer-checked:bg-purple-600 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                    </div>
                  </label>
                </div>

                {/* OCR Engine */}
                <div>
                  <label className="block text-lg font-medium text-slate-900 mb-3">OCR Engine</label>
                  <div className="space-y-3">
                    {[
                      { value: 'surya', label: 'Surya OCR', desc: 'Full layout + tables + text (all languages)' },
                      { value: 'paddle', label: 'PaddleOCR', desc: 'Text recognition (Korean + Latin only)' },
                      { value: 'hybrid', label: 'Hybrid Mode', badge: 'RECOMMENDED', desc: 'Surya layout + PaddleOCR text' },
                    ].map((engine) => (
                      <label key={engine.value} className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                        <input
                          type="radio"
                          name="engine"
                          value={engine.value}
                          checked={ocrEngine === engine.value}
                          onChange={(e) => setOcrEngine(e.target.value as any)}
                          className="mt-1 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="ml-3">
                          <span className="font-medium text-slate-900">
                            {engine.label}
                            {engine.badge && (
                              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                {engine.badge}
                              </span>
                            )}
                          </span>
                          <p className="text-sm text-slate-500">{engine.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={processOCR}
                  disabled={ocrProcessing || ocrFiles.length === 0}
                  className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {ocrProcessing ? 'Processing...' : 'Process Documents'}
                </button>
              </div>
            </div>

            {/* Right: Results */}
            <div className="space-y-6">
              {ocrProcessing && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg className="animate-spin w-16 h-16 mx-auto text-purple-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-xl text-slate-700 font-medium">Processing {ocrFiles.length} document(s)...</p>
                </div>
              )}

              {ocrResults.length > 0 && (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h3 className="text-lg font-semibold text-green-900">OCR Completed Successfully</h3>
                        <p className="text-sm text-green-700 mt-1">Processed {ocrResults.length} document(s)</p>
                      </div>
                    </div>
                  </div>

                  {ocrResults.map((result, idx) => (
                    <div key={idx} className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-slate-900">Document {idx + 1}: {ocrFiles[idx]?.name}</h2>
                        {result.success && (
                          <button
                            onClick={() => downloadOCRText(idx)}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                          >
                            Download TXT
                          </button>
                        )}
                      </div>
                      {result.success ? (
                        <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono">
                            {result.textContent || 'No text detected'}
                          </pre>
                        </div>
                      ) : (
                        <div className="bg-red-50 p-4 rounded-lg">
                          <p className="text-red-700">{result.error}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Continue to CAD Button */}
                  <button
                    onClick={() => setCurrentStep('cad')}
                    className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    Continue to CAD Analysis →
                  </button>
                </>
              )}

              {!ocrProcessing && ocrResults.length === 0 && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg className="w-24 h-24 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-xl text-slate-500">Upload documents to see results</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'cad':
        return (
          <div className="space-y-6">
            {cadStep === 'upload' && (
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Upload CAD File</h2>
                <input
                  type="file"
                  accept=".dxf"
                  onChange={handleCadFileSelect}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all outline-none"
                />
                <p className="text-sm text-slate-500 mt-4">Supported format: DXF files only</p>
              </div>
            )}

            {cadStep === 'layers' && (
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Select Layers</h2>
                <p className="text-sm text-slate-600 mb-4">Found {cadLayers.length} layers. Select layers to process:</p>
                
                <div className="max-h-96 overflow-y-auto bg-slate-50 p-4 rounded-xl space-y-2 mb-6">
                  {cadLayers.map((layer) => (
                    <label key={layer} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded">
                      <input
                        type="checkbox"
                        checked={selectedLayers.includes(layer)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLayers([...selectedLayers, layer]);
                          } else {
                            setSelectedLayers(selectedLayers.filter(l => l !== layer));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-slate-700">{layer}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <input
                    type="checkbox"
                    checked={simplify}
                    onChange={(e) => setSimplify(e.target.checked)}
                    className="rounded"
                  />
                  <label className="text-sm text-slate-700">Simplify geometry (faster but less accurate)</label>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={processCad}
                    disabled={loading || selectedLayers.length === 0}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Process & Analyze'}
                  </button>
                  <button
                    onClick={() => {
                      setCadFile(null);
                      setCadLayers([]);
                      setCadStep('upload');
                    }}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {cadStep === 'analyze' && (
              <>
                <div className="grid lg:grid-cols-12 gap-6">
                  {/* Tools */}
                  <div className="lg:col-span-4 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">Selection Tools</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Mode</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setActiveMode('site')}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                              activeMode === 'site'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Site
                          </button>
                          <button
                            onClick={() => setActiveMode('building')}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                              activeMode === 'building'
                                ? 'bg-green-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Building
                          </button>
                        </div>
                      </div>

                      {activeMode === 'building' && (
                        <>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Floors: {floorCount}</label>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              value={floorCount}
                              onChange={(e) => setFloorCount(parseInt(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isFootprint}
                              onChange={(e) => setIsFootprint(e.target.checked)}
                              className="rounded"
                            />
                            <label className="text-sm text-slate-700">Count as footprint</label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="lg:col-span-8 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">Metrics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 rounded-xl p-4">
                        <p className="text-xs text-blue-600 font-semibold mb-1">Site Area</p>
                        <p className="text-2xl font-bold text-blue-900">{cadMetrics.siteArea.toFixed(2)} m²</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4">
                        <p className="text-xs text-green-600 font-semibold mb-1">Footprint</p>
                        <p className="text-2xl font-bold text-green-900">{cadMetrics.footprintArea.toFixed(2)} m²</p>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-4">
                        <p className="text-xs text-purple-600 font-semibold mb-1">BCR</p>
                        <p className="text-2xl font-bold text-purple-900">{cadMetrics.bcr.toFixed(2)}%</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl p-4">
                        <p className="text-xs text-orange-600 font-semibold mb-1">FAR</p>
                        <p className="text-2xl font-bold text-orange-900">{cadMetrics.far.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SVG Viewer */}
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Geometry Viewer</h3>
                      <p className="text-sm text-slate-600">Click polygons to select • Scroll to zoom • Shift+Drag to pan</p>
                    </div>
                    <button
                      onClick={resetSvgView}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors"
                    >
                      Reset View
                    </button>
                  </div>
                  
                  {bounds && (
                    <div className="relative">
                      <div className="absolute top-2 right-2 bg-white/90 px-3 py-1 rounded-lg text-xs font-medium text-slate-700 shadow">
                        Zoom: {(svgZoom * 100).toFixed(0)}%
                      </div>
                      <svg
                        viewBox={`${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`}
                        className="w-full h-[600px] border rounded-xl bg-slate-50"
                        style={{ 
                          transform: 'scale(1, -1)',
                          cursor: isPanning ? 'grabbing' : 'grab'
                        }}
                        onWheel={handleSvgWheel}
                        onMouseDown={handleSvgMouseDown}
                        onMouseMove={handleSvgMouseMove}
                        onMouseUp={handleSvgMouseUp}
                        onMouseLeave={handleSvgMouseUp}
                      >
                        {polygons.map((poly) => {
                          const sel = selections[poly.id];
                          let fill = '#E5E7EB';
                          if (sel?.isSite && sel?.isBuilding) fill = '#A78BFA';
                          else if (sel?.isSite) fill = '#60A5FA';
                          else if (sel?.isBuilding) fill = '#34D399';

                          return (
                            <path
                              key={poly.id}
                              d={poly.path}
                              fill={fill}
                              stroke="#1F2937"
                              strokeWidth={(bounds.max_x - bounds.min_x) * 0.001}
                              className="cursor-pointer hover:opacity-70 transition-opacity"
                              onClick={(e) => {
                                if (!isPanning) {
                                  e.stopPropagation();
                                  togglePoly(poly.id);
                                }
                              }}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setCurrentStep('infrastructure')}
                  className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                >
                  Continue to Infrastructure
                </button>
              </>
            )}
          </div>
        );

      case 'infrastructure':
        return (
          <div className="space-y-6">
            {/* Search Controls */}
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Location & Search</h2>
              
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchLocation()}
                  placeholder="Search location or lat,lon"
                  className="md:col-span-2 px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                />
                <button
                  onClick={handleSearchLocation}
                  disabled={loading || !searchInput}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Search
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={mapCenter[0]}
                    onChange={(e) => setMapCenter([parseFloat(e.target.value), mapCenter[1]])}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={mapCenter[1]}
                    onChange={(e) => setMapCenter([mapCenter[0], parseFloat(e.target.value)])}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Radius: {mapRadius}m
                </label>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={mapRadius}
                  onChange={(e) => {
                    setMapRadius(parseInt(e.target.value));
                    setMapZoom(calculateZoom(parseInt(e.target.value)));
                  }}
                  className="w-full"
                />
              </div>

              <button
                onClick={fetchOSMData}
                disabled={loading}
                className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Fetch OSM Data'}
              </button>
            </div>

            {/* Map */}
            {typeof window !== 'undefined' && (
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">
                  Map Viewer
                  {osmData && (
                    <span className="ml-3 text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                      {osmData.features.length} features
                    </span>
                  )}
                </h2>
                
                <div className="h-[600px] rounded-xl overflow-hidden border-2 border-slate-300">
                  <MapContainer
                    center={mapCenter}
                    zoom={mapZoom}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; CARTO'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    <Marker position={mapCenter} />
                    <Rectangle
                      bounds={[
                        [mapCenter[0] - mapRadius / 111000, mapCenter[1] - mapRadius / (111000 * Math.cos(mapCenter[0] * Math.PI / 180))],
                        [mapCenter[0] + mapRadius / 111000, mapCenter[1] + mapRadius / (111000 * Math.cos(mapCenter[0] * Math.PI / 180))],
                      ]}
                      pathOptions={{ color: '#3B82F6', weight: 2, fillOpacity: 0.1, dashArray: '5, 5' }}
                    />
                    {osmData && (
                      <GeoJSON
                        key={geoJsonKey}
                        data={osmData}
                        style={geoJsonStyle}
                        onEachFeature={(feature, layer) => {
                          const featureId = getFeatureId(feature);
                          const selectedFeature = selectedFeatures.get(featureId);
                          
                          layer.on('click', () => {
                            setSelectedFeatureId(featureId);
                            setTempBuildingType(selectedFeature?.type || 'Hospital');
                            setTempCustomType(selectedFeature?.customType || '');
                          });

                          if (selectedFeature) {
                            layer.bindPopup(
                              selectedFeature.customType || selectedFeature.type
                            );
                          }
                        }}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>
            )}

            {/* Feature Type Assignment Modal */}
            {selectedFeatureId && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">Assign Building Type</h3>
                  
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
                      <select
                        value={tempBuildingType}
                        onChange={(e) => setTempBuildingType(e.target.value as BuildingType)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      >
                        {BUILDING_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {tempBuildingType === 'Others' && (
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Custom Type Name</label>
                        <input
                          type="text"
                          value={tempCustomType}
                          onChange={(e) => setTempCustomType(e.target.value)}
                          placeholder="Enter custom type"
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                        />
                      </div>
                    )}

                    <div className="p-4 rounded-xl" style={{ backgroundColor: TYPE_COLORS[tempBuildingType].fillColor }}>
                      <p className="text-sm font-medium" style={{ color: TYPE_COLORS[tempBuildingType].color }}>
                        Color Preview
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedFeatureId(null)}
                      className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={assignFeatureType}
                      disabled={tempBuildingType === 'Others' && !tempCustomType.trim()}
                      className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assign Type
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            {selectedFeatures.size > 0 && (
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-slate-900 mb-4">
                  Labeled Features ({selectedFeatures.size})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {BUILDING_TYPES.map((type) => {
                    const count = Array.from(selectedFeatures.values()).filter(f => f.type === type).length;
                    if (count === 0) return null;
                    return (
                      <div
                        key={type}
                        className="flex items-center gap-2 p-3 rounded-lg"
                        style={{ backgroundColor: TYPE_COLORS[type].fillColor }}
                      >
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: TYPE_COLORS[type].color }}
                        ></div>
                        <span className="text-sm font-medium text-slate-900">
                          {type} ({count})
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={submitInfrastructureData}
                  className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                >
                  Complete Demo ({selectedFeatures.size} features labeled)
                </button>
              </div>
            )}
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-6 py-12">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-slate-900">Demo Completed!</h3>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              All workflow steps completed successfully. Your data has been saved with User ID: <strong>{userId}</strong>
            </p>
            
            <div className="bg-slate-50 p-8 rounded-2xl text-left max-w-2xl mx-auto space-y-4">
              <h4 className="font-bold text-slate-900 text-xl mb-4">Summary</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <p className="font-semibold text-slate-900">OCR Processing</p>
                    <p className="text-sm text-slate-600">
                      {ocrResults.filter(r => r.success).length} of {ocrResults.length} document(s) processed successfully
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📐</span>
                  <div>
                    <p className="font-semibold text-slate-900">CAD Analysis</p>
                    <p className="text-sm text-slate-600">
                      Site: {cadMetrics.siteArea.toFixed(2)} m² | BCR: {cadMetrics.bcr.toFixed(2)}% | FAR: {cadMetrics.far.toFixed(2)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🗺️</span>
                  <div>
                    <p className="font-semibold text-slate-900">Infrastructure Mapping</p>
                    <p className="text-sm text-slate-600">
                      {selectedFeatures.size} feature(s) labeled from {osmData?.features.length || 0} total features
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center pt-6">
              <Link
                href="/"
                className="px-8 py-4 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all text-lg"
              >
                Back to Home
              </Link>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="px-8 py-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all text-lg"
              >
                Start New Demo
              </button>
            </div>
          </div>
        );
    }
  };

  const steps = [
    { id: 'ocr', label: 'OCR', icon: '🔍' },
    { id: 'cad', label: 'CAD', icon: '📐' },
    { id: 'infrastructure', label: 'Infrastructure', icon: '🗺️' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-200/30 rounded-full blur-3xl -z-10"></div>

      <div className="absolute top-8 left-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 mb-4">
              Complete Demo Workflow
            </h1>
            <p className="text-slate-600 text-lg">
              Experience the full system: Document OCR → CAD Analysis → Infrastructure Mapping
            </p>
            {userId && (
              <p className="text-sm text-slate-500 mt-2">
                User ID: <strong>{userId}</strong> | Session ID: <strong>{sessionId}</strong>
              </p>
            )}
          </div>

          {currentStep !== 'complete' && (
            <div className="mb-12">
              <div className="flex items-center justify-between">
                {steps.map((step, idx) => (
                  <div key={step.id} className="flex-1 flex items-center">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                          idx <= currentStepIndex
                            ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {step.icon}
                      </div>
                      <span
                        className={`text-sm mt-2 font-semibold ${
                          idx <= currentStepIndex ? 'text-pink-600' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div
                        className={`h-1 flex-1 mx-2 ${
                          idx < currentStepIndex
                            ? 'bg-gradient-to-r from-pink-500 to-rose-600'
                            : 'bg-slate-200'
                        }`}
                      ></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-10 shadow-2xl">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
                {error}
              </div>
            )}

            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
