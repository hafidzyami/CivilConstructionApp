import { useState } from 'react';
import { ActiveMode } from '../types';

interface CADToolsProps {
  activeMode: ActiveMode;
  setActiveMode: (m: ActiveMode) => void;
  floorCount: number;
  setFloorCount: (n: number) => void;
  isFootprint: boolean;
  setIsFootprint: (b: boolean) => void;
  layers: string[];
  selectedLayers: string[];
  onLayerChange: (l: string[]) => void;
  onUpdateGeometry: () => void;
  loading: boolean;
}

export default function CADTools({
  activeMode,
  setActiveMode,
  floorCount,
  setFloorCount,
  isFootprint,
  setIsFootprint,
  layers,
  selectedLayers,
  onLayerChange,
  onUpdateGeometry,
  loading
}: CADToolsProps) {
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  return (
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
              {layers.map((layer) => (
                <label key={layer} className="flex cursor-pointer items-center p-2 hover:bg-slate-50 rounded-md">
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer)}
                    onChange={(e) => {
                      if (e.target.checked) onLayerChange([...selectedLayers, layer]);
                      else onLayerChange(selectedLayers.filter((l) => l !== layer));
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="ml-2 truncate font-mono text-xs text-slate-600">{layer}</span>
                </label>
              ))}
            </div>
            <button onClick={onUpdateGeometry} disabled={loading} className="w-full bg-slate-900 text-white font-bold py-2 rounded-lg hover:bg-slate-800">
              {loading ? 'Processing...' : 'Update Geometry'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}