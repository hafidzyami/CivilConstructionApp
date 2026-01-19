'use client';

import { useState, useMemo } from 'react';
import { PolygonData, Bounds, Selection, AppStep, ActiveMode } from './types';
import CADHeader from './components/CADHeader';
import CADUploader from './components/CADUploader';
import CADTools from './components/CADTools';
import CADMetrics from './components/CADMetrics';
import CADViewer from './components/CADViewer';

export default function CADPage() {
  const [file, setFile] = useState<File | null>(null);
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [step, setStep] = useState<AppStep>('upload');
  const [loading, setLoading] = useState(false);
  const [parserMode, setParserMode] = useState<'manual' | 'auto'>('manual');

  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});

  const [activeMode, setActiveMode] = useState<ActiveMode>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);

  const getApiUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api';
    return 'http://localhost:3001/api';
  };

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
      const res = await fetch(`${getApiUrl()}/cad/layers`, { method: 'POST', body: formData });
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

    try {
      const formData = new FormData();
      formData.append('file', file);
      const endpoint = parserMode === 'manual' ? '/cad/process' : '/cad/process-auto';
      
      if (parserMode === 'manual') {
        formData.append('layers', JSON.stringify(selectedLayers));
      }

      const res = await fetch(`${getApiUrl()}${endpoint}`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.polygons) {
        // --- START HOLE DETECTION LOGIC ---
        
        // 1. Pre-calculate BBoxes
        let processed = data.polygons.map((p: any) => {
            const xs = p.points.map((pt: number[]) => pt[0]);
            const ys = p.points.map((pt: number[]) => pt[1]);
            return {
                ...p,
                bbox: { 
                  min_x: Math.min(...xs), max_x: Math.max(...xs), 
                  min_y: Math.min(...ys), max_y: Math.max(...ys) 
                },
                holes: [] // Store indices of inner polygons
            };
        });

        // 2. Sort by Area Descending (Largest First) to find parents easily
        processed.sort((a: any, b: any) => b.area_raw - a.area_raw);

        // 3. Helper: Ray-Casting Point-in-Polygon Check
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

        // 4. Assign Holes to Immediate Parents
        // We iterate and assign each polygon to the *smallest* parent that contains it
        // But since we sorted Descending, if we find the first (largest) container, 
        // we might nesting issues. 
        // Better strategy: For each polygon, check if it's inside any other.
        // Actually, simplified approach:
        // For every polygon, find ALL smaller polygons inside it and treat them as holes.
        // SVG 'evenodd' rule handles nested holes (holes inside holes) automatically by toggling fill.
        
        const finalPolys = processed.map((outer: any, i: number) => {
            const holePaths: string[] = [];

            // Check against all smaller polygons (j > i because sorted descending)
            for (let j = i + 1; j < processed.length; j++) {
                const inner = processed[j];
                
                // Fast BBox Check: Is inner strictly inside outer?
                if (inner.bbox.max_x <= outer.bbox.min_x || inner.bbox.min_x >= outer.bbox.max_x ||
                    inner.bbox.max_y <= outer.bbox.min_y || inner.bbox.min_y >= outer.bbox.max_y) {
                    continue;
                }

                // Detailed Check: Is the first point of inner inside outer?
                if (isPointInPoly(inner.points[0], outer.points)) {
                    // It's a hole!
                    // Convert hole points to SVG path string L ...
                    const pts = inner.points;
                    const d = `M ${pts[0][0]} ${pts[0][1]} ` + 
                              pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + "Z";
                    holePaths.push(d);
                }
            }

            // Construct Main Path
            const pts = outer.points;
            let pathString = `M ${pts[0][0]} ${pts[0][1]} ` + 
                             pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + "Z";
            
            // Append holes to the same path string
            if (holePaths.length > 0) {
                pathString += " " + holePaths.join(" ");
            }

            return { ...outer, path: pathString };
        });

        // --- END HOLE DETECTION LOGIC ---

        setPolygons(finalPolys);
        setBounds(data.bounds);
        
        if (parserMode === 'auto' && data.auto_analysis) {
           // ... (keep existing auto-analysis alert logic) ...
        }
        setStep('analyze');
      }
    } catch (err) {
      alert('Failed to process DXF');
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

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-orange-50 to-slate-100 flex flex-col">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-200/30 rounded-full blur-3xl -z-10"></div>

      <div className="flex-1 p-8 flex flex-col min-h-0">
        <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
          <CADHeader step={step} onReset={() => window.location.reload()} />
          <div className="flex-1 min-h-0 flex flex-col">
            {step !== 'analyze' ? (
              <div className="flex-1 flex flex-col">
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
              </div>
            ) : (
              <div className="flex flex-col h-full gap-6">
                <div className="grid lg:grid-cols-12 gap-6 shrink-0 relative z-50">
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
                  <CADMetrics metrics={metrics} />
                </div>
                <CADViewer
                  polygons={polygons}
                  bounds={bounds}
                  selections={selections}
                  onTogglePoly={togglePoly}
                  onBoxSelect={handleBoxSelect}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}