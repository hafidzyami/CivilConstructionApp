import { useState, useRef, useMemo, useEffect } from 'react';
import { useLanguage } from '../../i18n';

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

interface CADViewerProps {
  polygons: PolygonData[];
  bounds: Bounds | null;
  selections: Record<number, Selection>;
  onTogglePoly: (id: number) => void;
  onBoxSelect: (box: Bounds) => void;
  readOnly?: boolean; // When true, disable selection but allow zoom/pan
}

export default function CADViewer({ 
  polygons, 
  bounds, 
  selections, 
  onTogglePoly, 
  onBoxSelect,
  readOnly = false
}: CADViewerProps) {
  const { t } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState({ x: 0, y: 0 });
  const [selectCurrent, setSelectCurrent] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); 
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prevZoom => Math.max(0.1, Math.min(200, prevZoom * delta)));
    };

    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', onWheel);
    };
  }, []);

  const viewBox = useMemo(() => {
    if (!bounds) return "0 0 100 100";
    const width = (bounds.max_x - bounds.min_x) / zoom;
    const height = (bounds.max_y - bounds.min_y) / zoom;
    const centerX = bounds.min_x + (bounds.max_x - bounds.min_x) / 2;
    const centerY = bounds.min_y + (bounds.max_y - bounds.min_y) / 2;
    return `${centerX - width / 2 + panOffset.x} ${centerY - height / 2 + panOffset.y} ${width} ${height}`;
  }, [bounds, zoom, panOffset]);

  const getSvgPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY);
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Disable selection in readOnly mode, but allow panning
    if (e.button === 0 && (e.ctrlKey || e.metaKey) && !readOnly) {
      setIsSelecting(true);
      const pt = getSvgPoint(e.clientX, e.clientY);
      setSelectStart(pt);
      setSelectCurrent(pt);
      e.stopPropagation();
      return;
    }
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isSelecting) {
      const pt = getSvgPoint(e.clientX, e.clientY);
      setSelectCurrent(pt);
    } else if (isPanning && svgRef.current && bounds) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = (bounds.max_x - bounds.min_x) / (rect.width * zoom);
      const scaleY = (bounds.max_y - bounds.min_y) / (rect.height * zoom);
      
      setPanOffset((prev) => ({
        x: prev.x - dx * scaleX,
        y: prev.y + dy * scaleY, 
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if (isSelecting) {
      setIsSelecting(false);
      const box: Bounds = {
        min_x: Math.min(selectStart.x, selectCurrent.x),
        max_x: Math.max(selectStart.x, selectCurrent.x),
        min_y: Math.min(selectStart.y, selectCurrent.y),
        max_y: Math.max(selectStart.y, selectCurrent.y),
      };
      const dist = Math.sqrt(
        Math.pow(selectStart.x - selectCurrent.x, 2) + 
        Math.pow(selectStart.y - selectCurrent.y, 2)
      );
      if (dist > 0.05) {
         onBoxSelect(box);
      }
    }
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex-1 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl overflow-hidden shadow-lg relative min-h-[400px] z-0">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-slate-300 rounded-lg p-2 shadow-lg text-xs text-slate-600 pointer-events-auto">
          <div className="text-[10px] text-slate-500 font-medium space-y-1">
            <div className="flex items-center gap-2"><span className="w-4 text-center">🖱️</span> Scroll to Zoom</div>
            <div className="flex items-center gap-2"><span className="w-4 text-center">✋</span> Shift+Drag to Pan</div>
            {!readOnly && (
              <div className="flex items-center gap-2 text-purple-700 font-bold"><span className="w-4 text-center">✨</span> Ctrl+Drag to Select</div>
            )}
            {readOnly && (
              <div className="flex items-center gap-2 text-green-600 font-medium"><span className="w-4 text-center">👁️</span> View Only Mode</div>
            )}
          </div>
        </div>
        <button
          onClick={resetView}
          className="bg-white/90 backdrop-blur-sm hover:bg-white border border-slate-300 text-slate-700 p-2 rounded-lg shadow-lg transition-all hover:shadow-xl pointer-events-auto w-fit ml-auto"
          title="Reset View"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      <div className="absolute inset-0 bg-[#1e1e1e] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-full block select-none"
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: 'scaleY(-1)',
            transformOrigin: 'center',
            cursor: isSelecting ? 'crosshair' : (isPanning ? 'grabbing' : 'default'),
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g>
            {polygons.map((poly) => {
              const selection = selections[poly.id];
              let fill = '#333333';
              let stroke = '#555555';
              let opacity = 0.5;

              if (selection) {
                if (selection.isSite && selection.isBuilding) {
                  fill = '#9333ea';
                  stroke = '#ffffff';
                  opacity = 0.8;
                } else if (selection.isSite) {
                  fill = '#06b6d4';
                  stroke = '#ffffff';
                  opacity = 0.4;
                } else if (selection.isBuilding) {
                  fill = selection.isFootprint ? '#f97316' : '#fbbf24';
                  stroke = '#ffffff';
                  opacity = 0.8;
                }
              }

              return (
                <path
                  key={poly.id}
                  d={poly.path || ''}
                  fill={fill}
                  fillRule="evenodd"
                  stroke={stroke}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  opacity={opacity}
                  className={`transition-colors duration-200 ${!readOnly ? 'hover:opacity-100 cursor-pointer' : ''}`}
                  onClick={() => !isSelecting && !readOnly && onTogglePoly(poly.id)}
                  style={{ pointerEvents: readOnly ? 'none' : 'auto' }}
                />
              );
            })}
          </g>

          {isSelecting && (
            <rect
              x={Math.min(selectStart.x, selectCurrent.x)}
              y={Math.min(selectStart.y, selectCurrent.y)}
              width={Math.abs(selectCurrent.x - selectStart.x)}
              height={Math.abs(selectCurrent.y - selectStart.y)}
              fill="rgba(255, 255, 255, 0.1)"
              stroke="white"
              strokeWidth="2" 
              strokeDasharray="5,5" 
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
