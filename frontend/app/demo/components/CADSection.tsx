'use client';

import { useState, useMemo } from 'react';
import CADUploader from './CADUploader';
import CADTools from './CADTools';
import CADMetrics from './CADMetrics';
import CADViewer from './CADViewer';

interface PolygonData {
  id: number;
  points: number[][];
  path?: string;
  bbox: {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
  };
  area_raw: number;
  area_m2: number;
}

interface Bounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

interface Selection {
  isSite: boolean;
  isBuilding: boolean;
  floors: number;
  isFootprint: boolean;
}

type AppStep = 'upload' | 'layers' | 'analyze';
type ActiveMode = 'site' | 'building';
type ParserMode = 'manual' | 'python' | 'llm';

interface CADSectionProps {
  sessionId: number | null;
  onComplete: () => void;
}

interface AutoAnalysis {
  site_area: number;
  footprint_area: number;
  total_floor_area: number;
  floors: Record<string, number>;
  btl: number;
  far: number;
  materials_count?: number;
}

export default function CADSection({ sessionId, onComplete }: CADSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [step, setStep] = useState<AppStep>('upload');
  const [loading, setLoading] = useState(false);
  const [parserMode, setParserMode] = useState<ParserMode>('manual');

  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});

  const [activeMode, setActiveMode] = useState<ActiveMode>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);
  const [simplify, setSimplify] = useState(false);
  
  // Auto analysis results from Python parser or LLM
  const [autoAnalysis, setAutoAnalysis] = useState<AutoAnalysis | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  const handleFileSelect = async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.dxf')) {
      alert('Please select a valid .dxf file');
      return;
    }
    setFile(f);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', f);
      const res = await fetch(`${API_URL}/cad/layers`, { method: 'POST', body: formData });
      const data = await res.json();
      setLayers(data.layers || []);
      setSelectedLayers(data.layers || []);
      setStep('layers');
    } catch (err) {
      alert('Failed to load layers');
    } finally {
      setLoading(false);
    }
  };

  const processFile = async () => {
    if (!file) return;
    setLoading(true);
    setAutoAnalysis(null);

    try {
      // Upload DXF file to MinIO first
      if (sessionId && file) {
        const uploadFormData = new FormData();
        uploadFormData.append('sessionId', sessionId.toString());
        uploadFormData.append('dxfFile', file);
        
        try {
          await fetch(`${API_URL}/demo/upload-dxf`, {
            method: 'POST',
            body: uploadFormData,
          });
        } catch (err) {
          console.error('Failed to upload DXF file:', err);
        }
      }

      const formData = new FormData();
      formData.append('file', file);
      
      // Determine endpoint based on parser mode
      let endpoint = '/cad/process';
      if (parserMode === 'python') {
        endpoint = '/cad/process-auto';
      } else if (parserMode === 'llm') {
        endpoint = '/cad/process-llm';
      }
      
      if (parserMode === 'manual') {
        formData.append('layers', JSON.stringify(selectedLayers));
        formData.append('simplify', String(simplify));
      }

      const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.polygons) {
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
        setStep('analyze');

        // Parse auto analysis results for Python or LLM parser
        if ((parserMode === 'python' || parserMode === 'llm') && data.auto_analysis) {
          try {
            const analysis = typeof data.auto_analysis === 'string' 
              ? JSON.parse(data.auto_analysis) 
              : data.auto_analysis;
            setAutoAnalysis(analysis);
            console.log('Auto analysis results:', analysis);
          } catch (e) {
            console.error('Failed to parse auto analysis:', e, data.auto_analysis);
          }
        }

        // Save to database
        if (sessionId) {
          // Use auto analysis values if available, otherwise calculate from polygons
          const siteArea = autoAnalysis?.site_area || data.auto_analysis?.site_area || 
            finalPolys.reduce((sum: number, p: any) => sum + p.area_raw, 0);
          const buildingArea = autoAnalysis?.footprint_area || data.auto_analysis?.footprint_area || 
            (finalPolys[0]?.area_raw || 0);
          const floorArea = autoAnalysis?.total_floor_area || data.auto_analysis?.total_floor_area || 
            siteArea;

          const cadSaveRes = await fetch(`${API_URL}/demo/cad-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              siteArea,
              buildingArea,
              floorArea,
              rawData: data,
            }),
          });

          const cadSaveData = await cadSaveRes.json();
          console.log('CAD data saved:', cadSaveData);
        }
      }
    } catch (err) {
      alert('Failed to process CAD file');
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

  const handleBoxSelect = (box: Bounds) => {
    setSelections(prev => {
      const next = { ...prev };
      let hasChanges = false;
      polygons.forEach(p => {
        const pBox = p.bbox;
        if (!pBox) return;
        const intersects = box.min_x <= pBox.max_x && box.max_x >= pBox.min_x &&
                         box.min_y <= pBox.max_y && box.max_y >= pBox.min_y;
        if (intersects) {
          hasChanges = true;
          const current = next[p.id] ? { ...next[p.id] } : { isSite: false, isBuilding: false, floors: 1, isFootprint: true };
          if (activeMode === 'site') current.isSite = !current.isSite;
          else {
            if (!current.isBuilding) { current.floors = floorCount; current.isFootprint = isFootprint; }
            current.isBuilding = !current.isBuilding;
          }
          if (!current.isSite && !current.isBuilding) delete next[p.id];
          else next[p.id] = current;
        }
      });
      return hasChanges ? next : prev;
    });
  };

  const metrics = useMemo(() => {
    // If we have auto analysis results (from Python or LLM parser), use those
    if (autoAnalysis && (parserMode === 'python' || parserMode === 'llm')) {
      return {
        siteArea: autoAnalysis.site_area || 0,
        footprintArea: autoAnalysis.footprint_area || 0,
        totalFloorArea: autoAnalysis.total_floor_area || 0,
        bcr: autoAnalysis.btl || 0,
        far: autoAnalysis.far || 0,
      };
    }
    
    // Otherwise calculate from manual selections
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
  }, [selections, polygons, autoAnalysis, parserMode]);

  return (
    <div className="space-y-6">
      {step !== 'analyze' ? (
        <CADUploader
          step={step}
          loading={loading}
          layers={layers}
          selectedLayers={selectedLayers}
          parserMode={parserMode}
          onFileSelect={handleFileSelect}
          onLayerChange={setSelectedLayers}
          onParserModeChange={setParserMode}
          onProcess={processFile}
        />
      ) : (
        <>
          <div className="grid lg:grid-cols-12 gap-6">
            <CADTools
              activeMode={activeMode}
              setActiveMode={setActiveMode}
              floorCount={floorCount}
              setFloorCount={setFloorCount}
              isFootprint={isFootprint}
              setIsFootprint={setIsFootprint}
              layers={layers}
              selectedLayers={selectedLayers}
              onLayerChange={setSelectedLayers}
              onUpdateGeometry={processFile}
              loading={loading}
            />
            <CADMetrics metrics={metrics} parserMode={parserMode} />
          </div>
          <CADViewer
            polygons={polygons}
            bounds={bounds}
            selections={selections}
            onTogglePoly={togglePoly}
            onBoxSelect={handleBoxSelect}
          />
          
          <button
            onClick={async () => {
              // Save final metrics before completing
              if (sessionId) {
                try {
                  await fetch(`${API_URL}/demo/cad-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sessionId,
                      siteArea: metrics.siteArea,
                      buildingArea: metrics.footprintArea,
                      floorArea: metrics.totalFloorArea,
                      bcr: metrics.bcr,
                      far: metrics.far,
                    }),
                  });
                } catch (err) {
                  console.error('Failed to save final CAD metrics:', err);
                }
              }
              onComplete();
            }}
            className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
          >
            Continue to Infrastructure →
          </button>
        </>
      )}
    </div>
  );
}
