'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PolygonData, Bounds, Selection, AppStep, ActiveMode, ParserMode, AutoAnalysis, MetricsData } from './types';
import CADUploader from './components/CADUploader';
import CADTools from './components/CADTools';
import CADMetrics from './components/CADMetrics';
import CADViewer from './components/CADViewer';
import { useLanguage } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function CADPage() {
  const { t } = useLanguage();
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
    setAutoAnalysis(null);

    try {
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

      const res = await fetch(`${getApiUrl()}${endpoint}`, { method: 'POST', body: formData });
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

  const metrics: MetricsData = useMemo(() => {
    // If we have auto analysis results (from Python or LLM parser), use those
    if (autoAnalysis && (parserMode === 'python' || parserMode === 'llm')) {
      // Calculate num_floors from floors object if not provided directly
      const numFloors = autoAnalysis.num_floors || 
        (autoAnalysis.floors ? Object.keys(autoAnalysis.floors).length : null);
      
      // Get building height from either property (LLM uses building_height_m, Python uses building_height)
      const buildingHeight = autoAnalysis.building_height_m || autoAnalysis.building_height || null;
      
      return {
        siteArea: autoAnalysis.site_area || 0,
        footprintArea: autoAnalysis.footprint_area || 0,
        totalFloorArea: autoAnalysis.total_floor_area || 0,
        bcr: autoAnalysis.btl || 0,
        far: autoAnalysis.far || 0,
        numFloors: numFloors,
        buildingHeight: buildingHeight,
      };
    }
    
    // Otherwise calculate from manual selections
    let siteArea = 0;
    let footprintArea = 0;
    let totalFloorArea = 0;
    let maxFloors = 0;
    Object.entries(selections).forEach(([idStr, sel]) => {
      const poly = polygons.find((p) => p.id === parseInt(idStr));
      if (!poly) return;
      if (sel.isSite) siteArea += poly.area_m2;
      if (sel.isBuilding) {
        if (sel.isFootprint) footprintArea += poly.area_m2;
        totalFloorArea += poly.area_m2 * sel.floors;
        maxFloors = Math.max(maxFloors, sel.floors);
      }
    });
    const bcr = siteArea > 0 ? (footprintArea / siteArea) * 100 : 0;
    const far = siteArea > 0 ? (totalFloorArea / siteArea) * 100 : 0;
    return { 
      siteArea, 
      footprintArea, 
      totalFloorArea, 
      bcr, 
      far,
      numFloors: maxFloors > 0 ? maxFloors : null,
      buildingHeight: null, // Manual mode doesn't calculate height
    };
  }, [selections, polygons, autoAnalysis, parserMode]);

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-orange-50 to-slate-100 flex flex-col">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-200/30 rounded-full blur-3xl -z-10"></div>

      {/* Header */}
      <div className="shrink-0 px-8 pt-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t.common.backToHome}
        </Link>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {step === 'analyze' && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
            >
              {t.cad.resetAnalysis}
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="shrink-0 text-center py-4">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-red-600 to-orange-600">
          {t.cad.title}
        </h1>
        <p className="text-slate-600 mt-1">{t.cad.subtitle}</p>
      </div>

      <div className="flex-1 px-8 pb-8 flex flex-col min-h-0">
        <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
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
                  <CADMetrics metrics={metrics} parserMode={parserMode} />
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
