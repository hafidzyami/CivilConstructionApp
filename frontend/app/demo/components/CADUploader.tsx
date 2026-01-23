import { useState } from 'react';

type AppStep = 'upload' | 'layers' | 'analyze';

interface CADUploaderProps {
  step: AppStep;
  loading: boolean;
  layers: string[];
  selectedLayers: string[];
  parserMode: 'manual' | 'auto';
  onFileSelect: (f: File) => void;
  onLayerChange: (layers: string[]) => void;
  onParserModeChange: (mode: 'manual' | 'auto') => void;
  onProcess: () => void;
}

export default function CADUploader({
  step,
  loading,
  layers,
  selectedLayers,
  parserMode,
  onFileSelect,
  onLayerChange,
  onParserModeChange,
  onProcess
}: CADUploaderProps) {
  const [dragActive, setDragActive] = useState(false);

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
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  if (step === 'upload') {
    return (
      <div className="w-full bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-xl flex-1 flex flex-col">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Upload Project File</h2>
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
              <svg className="animate-spin w-12 h-12 mx-auto text-orange-600 mb-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-slate-600 font-medium text-lg">Scanning DXF Geometry...</p>
            </div>
          ) : (
            <div>
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-600">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-xl font-medium text-slate-700 mb-2">Drag & Drop DXF File</p>
              <p className="text-slate-500 mb-6">Supported formats: .dxf</p>
              <input
                type="file"
                accept=".dxf"
                onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
                className="hidden"
                id="file-upload-cad"
              />
              <label
                htmlFor="file-upload-cad"
                className="inline-block px-8 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
              >
                Browse Files
              </label>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-xl flex-1 flex flex-col min-h-0">
      <h2 className="text-2xl font-bold text-slate-900 mb-6 shrink-0">Select Layers to Import</h2>
      
      <div className="mb-6 shrink-0">
        <label className="block text-sm font-bold text-slate-700 mb-3">Parser Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onParserModeChange('manual')}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              parserMode === 'manual'
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-start">
              <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center ${
                parserMode === 'manual' ? 'border-orange-500' : 'border-slate-300'
              }`}>
                {parserMode === 'manual' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>}
              </div>
              <div>
                <div className="font-bold text-slate-900">Manual Parser</div>
                <div className="text-xs text-slate-600 mt-1">Select polygons manually for site and building areas</div>
              </div>
            </div>
          </button>
          
          <button
            onClick={() => onParserModeChange('auto')}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              parserMode === 'auto'
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-start">
              <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center ${
                parserMode === 'auto' ? 'border-green-500' : 'border-slate-300'
              }`}>
                {parserMode === 'auto' && <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>}
              </div>
              <div>
                <div className="font-bold text-slate-900">Automated Parser</div>
                <div className="text-xs text-slate-600 mt-1">AI-powered auto-detection of site and building areas</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex-1 overflow-y-auto custom-scrollbar min-h-0 max-h-[calc(100vh-500px)]">
        {layers.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No recognizable layers found.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {layers.map((layer) => (
              <label
                key={layer}
                className="flex items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-orange-300 transition-colors cursor-pointer group select-none"
              >
                <div className="relative flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer)}
                    onChange={(e) => {
                      if (e.target.checked) onLayerChange([...selectedLayers, layer]);
                      else onLayerChange(selectedLayers.filter((l) => l !== layer));
                    }}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-orange-500 checked:bg-orange-500 hover:border-orange-400"
                  />
                  <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none">
                    <path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="ml-3 font-mono text-sm text-slate-700 group-hover:text-slate-900 truncate" title={layer}>
                  {layer}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onProcess}
        disabled={loading || (parserMode === 'manual' && selectedLayers.length === 0)}
        className="w-full px-6 py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-bold text-lg hover:from-orange-700 hover:to-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center shrink-0"
      >
        {loading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          parserMode === 'auto' ? 'Auto-Analyze & Load Geometry' : 'Load Geometry'
        )}
      </button>
    </div>
  );
}
