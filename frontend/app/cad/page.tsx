'use client';

import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';

interface PolygonData {
  id: number;
  points: number[][]; // [[x,y], [x,y]]
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
  type: 'site' | 'building';
  floors: number;
  isFootprint: boolean;
}

export default function CADPage() {
  const [file, setFile] = useState<File | null>(null);
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'layers' | 'analyze'>('upload');
  const [loading, setLoading] = useState(false);
  
  // Analysis Data
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});
  
  // Tools
  const [activeMode, setActiveMode] = useState<'site' | 'building'>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);

  // API Helper
  const getApiUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api';
    return 'http://localhost:3001/api'; 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const f = e.target.files[0];
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
      setSelectedLayers(data.layers || []); // Select all by default
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
        setPolygons(data.polygons);
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
    setSelections(prev => {
      const next = { ...prev };
      const current = next[id];

      // If clicking with same mode, deselect
      if (current && current.type === activeMode) {
        delete next[id];
      } else {
        // Assign new mode
        next[id] = {
          type: activeMode,
          floors: activeMode === 'building' ? floorCount : 1,
          isFootprint: activeMode === 'building' ? isFootprint : true
        };
      }
      return next;
    });
  };

  const metrics = useMemo(() => {
    let siteArea = 0;
    let footprintArea = 0;
    let totalFloorArea = 0;

    Object.entries(selections).forEach(([idStr, sel]) => {
      const poly = polygons.find(p => p.id === parseInt(idStr));
      if (!poly) return;

      if (sel.type === 'site') {
        siteArea += poly.area_m2;
      } else if (sel.type === 'building') {
        if (sel.isFootprint) footprintArea += poly.area_m2;
        totalFloorArea += poly.area_m2 * sel.floors;
      }
    });

    const bcr = siteArea > 0 ? (footprintArea / siteArea) * 100 : 0;
    const far = siteArea > 0 ? (totalFloorArea / siteArea) : 0;

    return { siteArea, footprintArea, totalFloorArea, bcr, far };
  }, [selections, polygons]);

  // SVG Calculation
  const viewBox = bounds 
    ? `${bounds.min_x} ${bounds.min_y} ${bounds.max_x - bounds.min_x} ${bounds.max_y - bounds.min_y}`
    : "0 0 100 100";

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
           <Link href="/" className="text-slate-500 hover:text-slate-800 text-sm mb-1 block">← Back to Home</Link>
           <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-red-600">
             AutoCAD Analyzer
           </h1>
        </div>
        {step === 'analyze' && (
           <button onClick={() => window.location.reload()} className="text-sm text-red-500 hover:underline">Reset</button>
        )}
      </div>

      {step !== 'analyze' && (
        <div className="max-w-xl mx-auto w-full bg-white rounded-xl shadow-lg p-8 border border-slate-200">
          {step === 'upload' && (
            <div className="text-center">
              <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Upload DXF File</h2>
              <p className="text-slate-500 mb-6">Select a .dxf file to begin analysis</p>
              <input 
                type="file" 
                accept=".dxf"
                onChange={handleFileUpload}
                disabled={loading}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              {loading && <p className="mt-4 text-sm text-slate-400">Reading layers...</p>}
            </div>
          )}

          {step === 'layers' && (
            <div>
              <h3 className="text-lg font-bold mb-4">Select Layers</h3>
              <div className="max-h-60 overflow-y-auto border rounded p-2 mb-4 bg-slate-50">
                {layers.map(layer => (
                  <label key={layer} className="flex items-center p-2 hover:bg-white rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedLayers.includes(layer)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedLayers([...selectedLayers, layer]);
                        else setSelectedLayers(selectedLayers.filter(l => l !== layer));
                      }}
                      className="mr-3 text-orange-600 focus:ring-orange-500" 
                    />
                    <span className="text-sm font-mono text-slate-700">{layer}</span>
                  </label>
                ))}
              </div>
              <button 
                onClick={processFile}
                disabled={loading}
                className="w-full py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition shadow-lg"
              >
                {loading ? 'Processing Geometry...' : 'Analyze Geometry'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'analyze' && (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
          {/* Controls Sidebar */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            {/* Mode Selector */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Selection Mode</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveMode('site')}
                  className={`py-2 px-3 rounded-lg text-sm font-bold border transition ${
                    activeMode === 'site' 
                      ? 'bg-cyan-100 border-cyan-500 text-cyan-800' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Site Area
                </button>
                <button
                  onClick={() => setActiveMode('building')}
                  className={`py-2 px-3 rounded-lg text-sm font-bold border transition ${
                    activeMode === 'building' 
                      ? 'bg-orange-100 border-orange-500 text-orange-800' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Building
                </button>
              </div>

              {activeMode === 'building' && (
                <div className="mt-4 space-y-3 p-3 bg-slate-50 rounded-lg">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Floors:</span>
                    <input 
                      type="number" 
                      min="1" 
                      value={floorCount} 
                      onChange={(e) => setFloorCount(parseInt(e.target.value) || 1)}
                      className="w-16 p-1 text-right text-sm border rounded"
                    />
                  </label>
                  <label className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={isFootprint}
                      onChange={(e) => setIsFootprint(e.target.checked)}
                      className="mr-2 text-orange-600" 
                    />
                    <span className="text-sm text-slate-600">Is Footprint?</span>
                  </label>
                </div>
              )}
            </div>

            {/* Metrics Panel */}
            <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg flex-1">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Calculated Metrics</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="text-slate-400 text-xs">Site Area</div>
                  <div className="text-2xl font-mono text-cyan-400">{metrics.siteArea.toFixed(2)} m²</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Building Footprint</div>
                  <div className="text-2xl font-mono text-orange-400">{metrics.footprintArea.toFixed(2)} m²</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Total Floor Area</div>
                  <div className="text-2xl font-mono text-white">{metrics.totalFloorArea.toFixed(2)} m²</div>
                </div>
                
                <div className="pt-4 border-t border-slate-700 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-400 text-xs">BCR</div>
                    <div className="text-xl font-bold">{metrics.bcr.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">FAR</div>
                    <div className="text-xl font-bold">{metrics.far.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SVG Viewer */}
          <div className="flex-1 bg-[#1e1e1e] rounded-xl overflow-hidden shadow-inner relative border border-slate-700">
             <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
               Click to toggle selection
             </div>
             <svg 
               viewBox={viewBox} 
               className="w-full h-full touch-pan-x touch-pan-y"
               // Flip Y axis because CAD coords are Y-up, SVG is Y-down
               transform="scale(1, -1)"
               style={{ transformOrigin: 'center' }}
             >
               {polygons.map((poly) => {
                 const selection = selections[poly.id];
                 let fill = '#333333';
                 let stroke = '#555555';
                 let opacity = 0.5;

                 if (selection) {
                   if (selection.type === 'site') {
                     fill = '#06b6d4'; // Cyan
                     stroke = '#ffffff';
                     opacity = 0.4;
                   } else if (selection.type === 'building') {
                     fill = selection.isFootprint ? '#f97316' : '#fbbf24'; // Orange : Amber
                     stroke = '#ffffff';
                     opacity = 0.8;
                   }
                   if (selection.type === 'site' && selections[poly.id]?.type === 'building') {
                     // Hybrid visualization if needed, but simplified here
                   }
                 }

                 const pointsStr = poly.points.map(p => `${p[0]},${p[1]}`).join(' ');

                 return (
                   <polygon
                     key={poly.id}
                     points={pointsStr}
                     fill={fill}
                     stroke={stroke}
                     strokeWidth={selection ? (bounds ? (bounds.max_x - bounds.min_x) * 0.005 : 0.5) : (bounds ? (bounds.max_x - bounds.min_x) * 0.002 : 0.1)}
                     opacity={opacity}
                     className="hover:opacity-100 cursor-pointer transition-colors duration-200"
                     onClick={() => togglePoly(poly.id)}
                   />
                 );
               })}
             </svg>
          </div>
        </div>
      )}
    </div>
  );
}