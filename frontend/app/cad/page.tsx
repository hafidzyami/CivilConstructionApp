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

  // Analysis Data
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});

  // Tools
  const [activeMode, setActiveMode] = useState<ActiveMode>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);

  // API Helper
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

      const res = await fetch(`${getApiUrl()}/cad/layers`, {
        method: 'POST',
        body: formData,
      });
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
      formData.append('layers', JSON.stringify(selectedLayers));

      const res = await fetch(`${getApiUrl()}/cad/process`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.polygons) {
        // Pre-calculate Bounding Boxes for fast selection
        const enhancedPolygons = data.polygons.map((p: any) => {
            const xs = p.points.map((pt: number[]) => pt[0]);
            const ys = p.points.map((pt: number[]) => pt[1]);
            return {
                ...p,
                bbox: {
                    min_x: Math.min(...xs),
                    max_x: Math.max(...xs),
                    min_y: Math.min(...ys),
                    max_y: Math.max(...ys),
                }
            };
        });

        setPolygons(enhancedPolygons);
        setBounds(data.bounds);
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
      const current = next[id] 
        ? { ...next[id] } 
        : { isSite: false, isBuilding: false, floors: 1, isFootprint: true };

      if (activeMode === 'site') {
        current.isSite = !current.isSite;
      } else {
        // Apply settings if turning on
        if (!current.isBuilding) {
          current.floors = floorCount;
          current.isFootprint = isFootprint;
        }
        current.isBuilding = !current.isBuilding;
      }

      if (!current.isSite && !current.isBuilding) {
        delete next[id];
      } else {
        next[id] = current;
      }
      return next;
    });
  };

  // --- UPDATED: Toggle Logic for Box Selection ---
  const handleBoxSelect = (box: Bounds) => {
    setSelections(prev => {
        const next = { ...prev };
        let hasChanges = false;

        polygons.forEach(p => {
            const pBox = (p as any).bbox; 
            if (!pBox) return;

            // Check if polygon is inside/intersecting selection box
            const intersects = 
                box.min_x <= pBox.max_x &&
                box.max_x >= pBox.min_x &&
                box.min_y <= pBox.max_y &&
                box.max_y >= pBox.min_y;

            if (intersects) {
                hasChanges = true;
                // Get existing selection or create new default
                const current = next[p.id] 
                    ? { ...next[p.id] } 
                    : { isSite: false, isBuilding: false, floors: 1, isFootprint: true };

                // TOGGLE LOGIC: Invert current state
                if (activeMode === 'site') {
                    current.isSite = !current.isSite;
                } else {
                    // If turning ON, apply current floor/footprint settings
                    if (!current.isBuilding) {
                        current.floors = floorCount;
                        current.isFootprint = isFootprint;
                    }
                    current.isBuilding = !current.isBuilding;
                }

                // Remove key if no longer selected
                if (!current.isSite && !current.isBuilding) {
                    delete next[p.id];
                } else {
                    next[p.id] = current;
                }
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

      if (sel.isSite) {
        siteArea += poly.area_m2;
      }
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
                  onFileSelect={handleFileSelect}
                  onLayerChange={setSelectedLayers}
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