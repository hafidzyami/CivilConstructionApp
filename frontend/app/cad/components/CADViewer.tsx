import { useState, useRef, useMemo } from 'react';
import { PolygonData, Bounds, Selection } from '../types';

interface CADViewerProps {
  polygons: PolygonData[];
  bounds: Bounds | null;
  selections: Record<number, Selection>;
  onTogglePoly: (id: number) => void;
  onBoxSelect: (box: Bounds) => void;
}

export default function CADViewer({ 
  polygons, 
  bounds, 
  selections, 
  onTogglePoly, 
  onBoxSelect 
}: CADViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Selection Box State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState({ x: 0, y: 0 });
  const [selectCurrent, setSelectCurrent] = useState({ x: 0, y: 0 });

  const viewBox = useMemo(() => {
    if (!bounds) return "0 0 100 100";
    const width = (bounds.max_x - bounds.min_x) / zoom;
    const height = (bounds.max_y - bounds.min_y) / zoom;
    const centerX = bounds.min_x + (bounds.max_x - bounds.min_x) / 2;
    const centerY = bounds.min_y + (bounds.max_y - bounds.min_y) / 2;
    return `${centerX - width / 2 + panOffset.x} ${centerY - height / 2 + panOffset.y} ${width} ${height}`;
  }, [bounds, zoom, panOffset]);

  // Helper: Convert screen coordinates to SVG coordinates
  const getSvgPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return {
      x: (clientX - CTM.e) / CTM.a,
      y: (clientY - CTM.f) / CTM.d
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // CTRL + Left Click = Start Box Select
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      setIsSelecting(true);
      const pt = getSvgPoint(e.clientX, e.clientY);
      setSelectStart(pt);
      setSelectCurrent(pt);
      e.stopPropagation();
      return;
    }

    // Middle Mouse OR Shift+Left = Pan
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
      
      if (dist > 0.5) {
         onBoxSelect(box);
      }
    }
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.5, Math.min(50, zoom * delta));
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Base stroke width relative to model size (not screen pixels)
  // This ensures lines scale up/down naturally with the building
  const baseStrokeWidth = bounds ? (bounds.max_x - bounds.min_x) * 0.002 : 0.1;

  return (
    <div className="flex-1 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl overflow-hidden shadow-lg relative min-h-[400px] z-0">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-slate-300 rounded-lg p-2 shadow-lg text-xs text-slate-600 pointer-events-auto">
          <div className="text-[10px] text-slate-500 font-medium space-y-1">
            <div className="flex items-center gap-2"><span className="w-4 text-center">🖱️</span> Scroll to Zoom</div>
            <div className="flex items-center gap-2"><span className="w-4 text-center">✋</span> Shift+Drag to Pan</div>
            <div className="flex items-center gap-2 text-purple-700 font-bold"><span className="w-4 text-center">✨</span> Ctrl+Drag to Select</div>
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
          onWheel={handleWheel}
        >
          <g>
            {polygons.map((poly) => {
              const selection = selections[poly.id];
              let fill = '#333333';
              let stroke = '#555555';
              let opacity = 0.5;

              if (selection) {
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

              const pointsStr = poly.points.map((p) => `${p[0]},${p[1]}`).join(' ');

              return (
                <polygon
                  key={poly.id}
                  points={pointsStr}
                  fill={fill}
                  stroke={stroke}
                  // FIX 1: Removed vectorEffect from polygons
                  // FIX 2: Use Model-Relative stroke width
                  strokeWidth={selection ? baseStrokeWidth * 2.5 : baseStrokeWidth}
                  opacity={opacity}
                  className="hover:opacity-100 transition-colors duration-200"
                  onClick={() => !isSelecting && onTogglePoly(poly.id)}
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
              // FIX 3: Keep vectorEffect on Selection Box so it stays crisp (2px)
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