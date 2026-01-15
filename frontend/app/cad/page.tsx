'use client';

import { useState, useMemo, useRef } from 'react';
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

// UPDATED: Split flags to allow simultaneous selection
interface Selection {
  isSite: boolean;
  isBuilding: boolean;
  floors: number;
  isFootprint: boolean;
}

export default function CADPage() {
  const [file, setFile] = useState<File | null>(null);
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'layers' | 'analyze'>('upload');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // Analysis Data
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});
  
  // Tools
  const [activeMode, setActiveMode] = useState<'site' | 'building'>('site');
  const [floorCount, setFloorCount] = useState(1);
  const [isFootprint, setIsFootprint] = useState(true);
  
  // Layer Panel Toggle
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  
  // Pan & Zoom for Viewer
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // API Helper
  const getApiUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api';
    return 'http://localhost:3001/api'; 
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
       handleFileSelect(e.dataTransfer.files[0]);
    }
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
        setShowLayerPanel(false);
      }
    } catch (err) {
      alert('Failed to process DXF');
    } finally {
      setLoading(false);
    }
  };

  // UPDATED: Independent toggling logic
  const togglePoly = (id: number) => {
    setSelections(prev => {
      const next = { ...prev };
      
      // Initialize if selection doesn't exist yet
      if (!next[id]) {
        next[id] = { isSite: false, isBuilding: false, floors: 1, isFootprint: true };
      }

      if (activeMode === 'site') {
        // Just toggle site flag
        next[id].isSite = !next[id].isSite;
      } else {
        // If turning on, update with current building params
        if (!next[id].isBuilding) {
            next[id].floors = floorCount;
            next[id].isFootprint = isFootprint;
        }
        next[id].isBuilding = !next[id].isBuilding;
      }

      // Cleanup if nothing selected
      if (!next[id].isSite && !next[id].isBuilding) {
          delete next[id];
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

      // Independent checks
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

  const viewBox = bounds 
    ? `${bounds.min_x} ${bounds.min_y} ${bounds.max_x - bounds.min_x} ${bounds.max_y - bounds.min_y}`
    : "0 0 100 100";

  // Pan & Zoom handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle mouse or Shift+Left
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewTransform.x, y: e.clientY - viewTransform.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setViewTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(10, prev.scale * delta))
    }));
  };

  const resetView = () => {
    setViewTransform({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-orange-50 to-slate-100 flex flex-col">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-200/30 rounded-full blur-3xl -z-10"></div>

      {/* Main Container */}
      <div className="flex-1 p-8 flex flex-col min-h-0">
        <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <Link
                href="/"
                className="inline-flex items-center text-slate-600 hover:text-slate-900 transition-colors mb-2 text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Home
              </Link>
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-red-600">
                AutoCAD Analyzer
              </h1>
              {step !== 'analyze' && (
                <p className="text-xl text-slate-600 mt-2">
                    Automated geometry extraction and BCR/FAR calculation
                </p>
              )}
            </div>
            {step === 'analyze' && (
               <button 
                 onClick={() => window.location.reload()} 
                 className="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm font-medium"
               >
                 Reset Analysis
               </button>
            )}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 min-h-0 flex flex-col">
            
            {/* 1. UPLOAD & LAYERS VIEW */}
            {step !== 'analyze' && (
               <div className="flex-1 flex flex-col">
                    <div className="w-full bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-xl flex-1 flex flex-col">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6">
                            {step === 'upload' ? 'Upload Project File' : 'Select Layers to Import'}
                        </h2>

                        {step === 'upload' ? (
                            <div
                                className={`flex-1 relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 flex flex-col items-center justify-center ${
                                    dragActive
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-slate-300 hover:border-orange-400 bg-slate-50'
                                }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                {loading ? (
                                    <div className="py-4">
                                        <svg className="animate-spin w-12 h-12 mx-auto text-orange-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <p className="text-slate-600 font-medium text-lg">Scanning DXF Geometry...</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-600">
                                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        </div>
                                        <p className="text-xl font-medium text-slate-700 mb-2">
                                            Drag & Drop DXF File
                                        </p>
                                        <p className="text-slate-500 mb-6">Supported formats: .dxf</p>
                                        <input
                                            type="file"
                                            accept=".dxf"
                                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                                            className="hidden"
                                            id="file-upload"
                                        />
                                        <label
                                            htmlFor="file-upload"
                                            className="inline-block px-8 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
                                        >
                                            Browse Files
                                        </label>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="animate-in fade-in zoom-in duration-300 flex-1 flex flex-col min-h-0">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex-1 overflow-y-auto custom-scrollbar min-h-0 max-h-[calc(100vh-400px)]">
                                    {layers.length === 0 ? (
                                        <p className="text-slate-500 text-center py-8">No recognizable layers found.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {layers.map(layer => (
                                                <label key={layer} className="flex items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-orange-300 transition-colors cursor-pointer group select-none">
                                                    <div className="relative flex items-center shrink-0">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedLayers.includes(layer)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedLayers([...selectedLayers, layer]);
                                                                else setSelectedLayers(selectedLayers.filter(l => l !== layer));
                                                            }}
                                                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-orange-500 checked:bg-orange-500 hover:border-orange-400" 
                                                        />
                                                        <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none">
                                                            <path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </div>
                                                    <span className="ml-3 font-mono text-sm text-slate-700 group-hover:text-slate-900 truncate" title={layer}>{layer}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={processFile}
                                    disabled={loading || selectedLayers.length === 0}
                                    className="w-full px-6 py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-bold text-lg hover:from-orange-700 hover:to-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center shrink-0"
                                >
                                    {loading ? 'Processing...' : 'Load Geometry'}
                                </button>
                            </div>
                        )}
                    </div>
               </div>
            )}

            {/* 2. ANALYZE VIEW */}
            {step === 'analyze' && (
                <div className="flex flex-col h-full gap-6">
                    
                    {/* TOP ROW: TOOLS & METRICS */}
                    <div className="grid lg:grid-cols-12 gap-6 shrink-0 relative z-50">
                        {/* Tools Panel */}
                        <div className="lg:col-span-5 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-lg flex flex-col justify-center">
                            <div className="flex gap-3 mb-4">
                                <button
                                    onClick={() => setActiveMode('site')}
                                    className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                                    activeMode === 'site' 
                                        ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-200' 
                                        : 'border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <div className={`text-xs font-bold uppercase mb-0.5 ${activeMode === 'site' ? 'text-cyan-700' : 'text-slate-500'}`}>Mode</div>
                                    <div className={`font-bold ${activeMode === 'site' ? 'text-cyan-900' : 'text-slate-700'}`}>Site Area</div>
                                </button>
                                
                                <button
                                    onClick={() => setActiveMode('building')}
                                    className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                                    activeMode === 'building' 
                                        ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-200' 
                                        : 'border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <div className={`text-xs font-bold uppercase mb-0.5 ${activeMode === 'building' ? 'text-orange-700' : 'text-slate-500'}`}>Mode</div>
                                    <div className={`font-bold ${activeMode === 'building' ? 'text-orange-900' : 'text-slate-700'}`}>Building</div>
                                </button>
                            </div>

                            {activeMode === 'building' && (
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-500 uppercase">Floors:</span>
                                        <div className="flex items-center bg-white rounded border border-slate-300">
                                            <button onClick={() => setFloorCount(Math.max(1, floorCount - 1))} className="px-2 py-1 hover:bg-slate-100 text-slate-600 font-bold">-</button>
                                            <span className="w-8 text-center text-sm font-bold border-x border-slate-300">{floorCount}</span>
                                            <button onClick={() => setFloorCount(floorCount + 1)} className="px-2 py-1 hover:bg-slate-100 text-slate-600 font-bold">+</button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-500 uppercase">Type:</span>
                                        <button 
                                            onClick={() => setIsFootprint(!isFootprint)}
                                            className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${isFootprint ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-slate-600 border-slate-300'}`}
                                        >
                                            {isFootprint ? 'Footprint' : 'Upper Floor'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Layer Toggler */}
                            <div className="mt-3 pt-3 border-t border-slate-200 relative">
                                <button 
                                    onClick={() => setShowLayerPanel(!showLayerPanel)}
                                    className="flex w-full items-center justify-between text-left group"
                                >
                                    <span className="font-bold text-sm text-slate-700 group-hover:text-slate-900">Active Layers ({selectedLayers.length})</span>
                                    <svg className={`h-4 w-4 text-slate-500 transition-transform ${showLayerPanel ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showLayerPanel && (
                                    <div className="absolute top-full left-0 right-0 z-50 mt-2 p-4 bg-white rounded-xl shadow-2xl border border-slate-200 animate-in slide-in-from-top-2">
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2 mb-4">
                                            {layers.map(layer => (
                                            <label key={layer} className="flex cursor-pointer items-center p-2 hover:bg-slate-50 rounded-md">
                                                <input 
                                                type="checkbox"
                                                checked={selectedLayers.includes(layer)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedLayers([...selectedLayers, layer]);
                                                    else setSelectedLayers(selectedLayers.filter(l => l !== layer));
                                                }}
                                                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                                />
                                                <span className="ml-2 truncate font-mono text-xs text-slate-600">{layer}</span>
                                            </label>
                                            ))}
                                        </div>
                                        <button onClick={processFile} disabled={loading} className="w-full bg-slate-900 text-white font-bold py-2 rounded-lg hover:bg-slate-800">
                                            {loading ? 'Processing...' : 'Update Geometry'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Metrics Panel */}
                        <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-700 text-white flex flex-col justify-center relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none"></div>
                            <div className="grid grid-cols-4 gap-8 relative z-10">
                                <div>
                                    <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">Site Area</div>
                                    <div className="text-2xl font-mono text-cyan-400 truncate" title={`${metrics.siteArea} m²`}>{metrics.siteArea.toFixed(1)} <span className="text-sm opacity-50">m²</span></div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">Total Floor</div>
                                    <div className="text-2xl font-mono text-white truncate" title={`${metrics.totalFloorArea} m²`}>{metrics.totalFloorArea.toFixed(1)} <span className="text-sm opacity-50">m²</span></div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">BCR</div>
                                    <div className="text-3xl font-bold text-orange-500">{metrics.bcr.toFixed(1)}<span className="text-lg">%</span></div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">FAR</div>
                                    <div className="text-3xl font-bold text-orange-500">{metrics.far.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BOTTOM ROW: FULL VIEWER (Added z-0 to sit behind layer dropdown) */}
                    <div className="flex-1 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl overflow-hidden shadow-lg relative min-h-[400px] z-0">
                        {/* Viewer Controls */}
                        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                            <button
                                onClick={resetView}
                                className="bg-white/90 backdrop-blur-sm hover:bg-white border border-slate-300 text-slate-700 p-2 rounded-lg shadow-lg transition-all hover:shadow-xl"
                                title="Reset View (Fit to Screen)"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </button>
                            <div className="bg-white/90 backdrop-blur-sm border border-slate-300 rounded-lg p-2 shadow-lg text-xs text-slate-600">
                                <div className="font-mono">Zoom: {viewTransform.scale.toFixed(2)}x</div>
                                <div className="text-[10px] mt-1 text-slate-500">
                                    Scroll: Zoom<br/>
                                    Shift+Drag: Pan
                                </div>
                            </div>
                        </div>
                        
                        <div className="absolute inset-0 bg-[#1e1e1e] overflow-hidden">
                            <svg 
                                ref={svgRef}
                                viewBox={viewBox} 
                                className="w-full h-full block select-none"
                                preserveAspectRatio="xMidYMid meet"
                                transform="scale(1, -1)"
                                style={{ 
                                    transformOrigin: 'center',
                                    cursor: isPanning ? 'grabbing' : 'default'
                                }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                onWheel={handleWheel}
                            >
                                <g transform={`translate(${viewTransform.x / viewTransform.scale}, ${viewTransform.y / viewTransform.scale}) scale(${1 / viewTransform.scale})`}>
                                {polygons.map((poly) => {
                                    const selection = selections[poly.id];
                                    let fill = '#333333';
                                    let stroke = '#555555';
                                    let opacity = 0.5;

                                    if (selection) {
                                        // UPDATED VISUAL LOGIC: Purple if both are selected
                                        if (selection.isSite && selection.isBuilding) {
                                            fill = '#9333ea'; // Purple
                                            stroke = '#ffffff';
                                            opacity = 0.8;
                                        } else if (selection.isSite) {
                                            fill = '#06b6d4'; // Cyan
                                            stroke = '#ffffff';
                                            opacity = 0.4;
                                        } else if (selection.isBuilding) {
                                            fill = selection.isFootprint ? '#f97316' : '#fbbf24'; // Orange
                                            stroke = '#ffffff';
                                            opacity = 0.8;
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
                                </g>
                            </svg>
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}