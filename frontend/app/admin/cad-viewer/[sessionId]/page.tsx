'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

interface CADData {
  siteArea: number;
  buildingArea: number;
  floorArea: number;
  bcr: number;
  far: number;
  numFloors: number;
  buildingHeight: number;
  dxfFileUrl: string;
}

export default function CADViewerPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [processingDXF, setProcessingDXF] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cadData, setCadData] = useState<CADData | null>(null);
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [dxfError, setDxfError] = useState<string | null>(null);

  // Viewer state
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    // Check if admin is logged in
    const isLoggedIn = localStorage.getItem('adminLoggedIn');
    if (!isLoggedIn) {
      router.push('/admin/login');
      return;
    }

    fetchSessionData();
  }, [sessionId]);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      
      // Fetch session data
      const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/demo/sessions`);
      const sessionData = await sessionRes.json();
      
      if (sessionData.success) {
        const session = sessionData.data.find((s: any) => s.id === parseInt(sessionId));
        if (session && session.cadData) {
          setCadData(session.cadData);
          
          // If we have a DXF file URL, process it
          if (session.cadData.dxfFileUrl) {
            await processDXF(session.cadData.dxfFileUrl);
          }
        } else {
          setError('CAD data not found for this session');
        }
      }
    } catch (err) {
      console.error('Error fetching session:', err);
      setError('Failed to load session data');
    } finally {
      setLoading(false);
    }
  };

  const processDXF = async (dxfUrl: string) => {
    try {
      setProcessingDXF(true);
      setDxfError(null);
      console.log('Processing DXF from URL:', dxfUrl);
      
      // Use backend proxy to avoid CORS issues
      const processRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/cad/process-from-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileUrl: dxfUrl }),
      });

      const processData = await processRes.json();
      console.log('CAD process response:', processData);

      // Handle both response formats:
      // 1. Direct format: {polygons, bounds, scale}
      // 2. Wrapped format: {success, data: {polygons, bounds, scale}}
      const data = processData.data || processData;
      
      if (data.polygons && data.polygons.length > 0) {
        // Process polygons - generate SVG paths and detect holes
        const processedPolygons = processPolygonsWithHoles(data.polygons);
        setPolygons(processedPolygons);
        setBounds(data.bounds || null);
        console.log('Loaded polygons:', processedPolygons.length);
      } else if (processData.success === false) {
        setDxfError(processData.message || 'Failed to process DXF file');
      } else {
        setDxfError('No polygons found in DXF file');
      }
    } catch (err: any) {
      console.error('Error processing DXF:', err);
      setDxfError(err.message || 'Failed to load DXF visualization');
    } finally {
      setProcessingDXF(false);
    }
  };

  // Process polygons to generate SVG paths and detect holes
  const processPolygonsWithHoles = (rawPolygons: any[]): PolygonData[] => {
    // 1. Pre-calculate bboxes
    let processed = rawPolygons.map((p: any) => {
      const xs = p.points.map((pt: number[]) => pt[0]);
      const ys = p.points.map((pt: number[]) => pt[1]);
      return {
        ...p,
        bbox: {
          min_x: Math.min(...xs),
          max_x: Math.max(...xs),
          min_y: Math.min(...ys),
          max_y: Math.max(...ys),
        },
      };
    });

    // 2. Sort by area descending (parent candidates first)
    processed.sort((a: any, b: any) => b.area_raw - a.area_raw);

    // Helper: Check if point is inside poly (Ray Casting)
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

    // 3. Robust hole detection
    const finalPolys = processed.map((outer: any, i: number) => {
      const holePaths: string[] = [];

      // Check against smaller polygons
      for (let j = i + 1; j < processed.length; j++) {
        const inner = processed[j];

        // CHECK 1: Strict bbox containment
        if (
          inner.bbox.min_x < outer.bbox.min_x ||
          inner.bbox.max_x > outer.bbox.max_x ||
          inner.bbox.min_y < outer.bbox.min_y ||
          inner.bbox.max_y > outer.bbox.max_y
        ) {
          continue;
        }

        // CHECK 2: Geometric containment
        if (isPointInPoly(inner.points[0], outer.points)) {
          const midIdx = Math.floor(inner.points.length / 2);
          if (isPointInPoly(inner.points[midIdx], outer.points)) {
            const pts = inner.points;
            const d = `M ${pts[0][0]} ${pts[0][1]} ` +
              pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + 'Z';
            holePaths.push(d);
          }
        }
      }

      // Construct main path
      const pts = outer.points;
      let pathString = `M ${pts[0][0]} ${pts[0][1]} ` +
        pts.slice(1).map((p: any) => `L ${p[0]} ${p[1]} `).join('') + 'Z';

      // Append holes
      if (holePaths.length > 0) {
        pathString += ' ' + holePaths.join(' ');
      }

      return { ...outer, path: pathString };
    });

    return finalPolys;
  };

  // Zoom wheel handler
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.85 : 1.15;
      setZoom(prevZoom => {
        const newZoom = prevZoom * delta;
        return Math.max(0.1, Math.min(50, newZoom));
      });
    };

    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', onWheel);
    };
  }, [polygons.length]);

  const viewBox = useMemo(() => {
    if (!bounds) return "0 0 100 100";
    const width = (bounds.max_x - bounds.min_x) / zoom;
    const height = (bounds.max_y - bounds.min_y) / zoom;
    const centerX = bounds.min_x + (bounds.max_x - bounds.min_x) / 2;
    const centerY = bounds.min_y + (bounds.max_y - bounds.min_y) / 2;
    return `${centerX - width / 2 + panOffset.x} ${centerY - height / 2 + panOffset.y} ${width} ${height}`;
  }, [bounds, zoom, panOffset]);

  // Use refs for pan state to avoid re-renders during panning
  const panStartRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPanOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Allow pan with middle mouse, left mouse + shift, or just left mouse drag
    if (e.button === 1 || e.button === 0) {
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      lastPanOffset.current = { ...panOffset };
      e.preventDefault();
    }
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanningRef.current || !svgRef.current || !bounds) return;
    
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = (bounds.max_x - bounds.min_x) / (rect.width * zoom);
    const scaleY = (bounds.max_y - bounds.min_y) / (rect.height * zoom);

    setPanOffset({
      x: lastPanOffset.current.x - dx * scaleX,
      y: lastPanOffset.current.y + dy * scaleY,
    });
  }, [bounds, zoom]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-slate-300">Loading CAD data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-red-400 mb-4">{error}</p>
          <Link
            href="/admin/dashboard"
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
            <div className="h-6 w-px bg-slate-600"></div>
            <h1 className="text-xl font-bold text-white">
              CAD Viewer - Session #{sessionId}
            </h1>
          </div>
          
          {cadData?.dxfFileUrl && (
            <a
              href={cadData.dxfFileUrl}
              download
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download DXF
            </a>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* CAD Viewer */}
        <div className="flex-1 relative">
          {/* Controls */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-lg p-3 shadow-lg text-xs text-slate-300">
              <div className="text-[11px] space-y-1">
                <div className="flex items-center gap-2"><span className="w-4 text-center">🖱️</span> Scroll to Zoom</div>
                <div className="flex items-center gap-2"><span className="w-4 text-center">✋</span> Drag to Pan</div>
              </div>
            </div>
            <button
              onClick={resetView}
              className="bg-slate-800/90 backdrop-blur-sm hover:bg-slate-700 border border-slate-600 text-white p-2 rounded-lg shadow-lg transition-all hover:shadow-xl w-fit ml-auto"
              title="Reset View"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-4 left-4 z-10 bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300">
            Zoom: {(zoom * 100).toFixed(0)}%
          </div>

          {/* SVG Viewer */}
          <div className="absolute inset-0 bg-[#1a1a2e] overflow-hidden">
            {processingDXF ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-lg">Processing DXF file...</p>
                  <p className="text-sm mt-1 text-slate-500">This may take a moment</p>
                </div>
              </div>
            ) : polygons.length > 0 ? (
              <svg
                ref={svgRef}
                viewBox={viewBox}
                className="w-full h-full block select-none"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  transform: 'scaleY(-1)',
                  transformOrigin: 'center',
                  cursor: isPanning ? 'grabbing' : 'grab',
                  willChange: 'transform',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <g style={{ willChange: 'transform' }}>
                  {polygons.map((poly) => (
                    <path
                      key={poly.id}
                      d={poly.path || ''}
                      fill="#4f46e5"
                      fillRule="evenodd"
                      stroke="#818cf8"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.6}
                    />
                  ))}
                </g>
              </svg>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-slate-500 max-w-md px-4">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  <p className="text-lg">No geometry data to display</p>
                  {dxfError ? (
                    <div className="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                      <p className="text-sm text-red-400">{dxfError}</p>
                    </div>
                  ) : (
                    <p className="text-sm mt-1">The DXF file might not contain processable polygons</p>
                  )}
                  {cadData?.dxfFileUrl && (
                    <button
                      onClick={() => processDXF(cadData.dxfFileUrl)}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Retry Processing
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Metrics */}
        <div className="w-80 bg-slate-800/50 backdrop-blur-sm border-l border-slate-700 p-6 overflow-y-auto">
          <h2 className="text-lg font-bold text-white mb-4">CAD Analysis</h2>
          
          {cadData && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 p-4 rounded-xl border border-blue-700/50">
                <p className="text-xs text-blue-400 font-medium mb-1">Site Area</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.siteArea ? cadData.siteArea.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-blue-400 mt-1">m²</p>
              </div>

              <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 p-4 rounded-xl border border-green-700/50">
                <p className="text-xs text-green-400 font-medium mb-1">Building Area</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.buildingArea ? cadData.buildingArea.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-green-400 mt-1">m²</p>
              </div>

              <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 p-4 rounded-xl border border-purple-700/50">
                <p className="text-xs text-purple-400 font-medium mb-1">Floor Area</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.floorArea ? cadData.floorArea.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-purple-400 mt-1">m²</p>
              </div>

              <div className="bg-gradient-to-br from-indigo-900/50 to-indigo-800/30 p-4 rounded-xl border border-indigo-700/50">
                <p className="text-xs text-indigo-400 font-medium mb-1">Number of Floors</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.numFloors ?? '-'}
                </p>
                <p className="text-xs text-indigo-400 mt-1">floors</p>
              </div>

              <div className="bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 p-4 rounded-xl border border-cyan-700/50">
                <p className="text-xs text-cyan-400 font-medium mb-1">Building Height</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.buildingHeight ? cadData.buildingHeight.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-cyan-400 mt-1">m</p>
              </div>

              <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 p-4 rounded-xl border border-orange-700/50">
                <p className="text-xs text-orange-400 font-medium mb-1">BCR (Building Coverage Ratio)</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.bcr ? cadData.bcr.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-orange-400 mt-1">%</p>
              </div>

              <div className="bg-gradient-to-br from-pink-900/50 to-pink-800/30 p-4 rounded-xl border border-pink-700/50">
                <p className="text-xs text-pink-400 font-medium mb-1">FAR (Floor Area Ratio)</p>
                <p className="text-2xl font-bold text-white">
                  {cadData.far ? cadData.far.toFixed(2) : '-'}
                </p>
                <p className="text-xs text-pink-400 mt-1">ratio</p>
              </div>
            </div>
          )}

          {/* Polygons Info */}
          {polygons.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Geometry Info</h3>
              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-300">
                <div className="flex justify-between mb-2">
                  <span>Total Polygons:</span>
                  <span className="font-semibold">{polygons.length}</span>
                </div>
                {bounds && (
                  <>
                    <div className="flex justify-between mb-2">
                      <span>Width:</span>
                      <span className="font-mono">{((bounds.max_x - bounds.min_x) / 1000).toFixed(2)} m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Height:</span>
                      <span className="font-mono">{((bounds.max_y - bounds.min_y) / 1000).toFixed(2)} m</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
