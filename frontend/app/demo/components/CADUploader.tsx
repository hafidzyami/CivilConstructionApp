'use client';

import { useState } from 'react';

type AppStep = 'upload' | 'layers' | 'analyze';
export type ParserMode = 'manual' | 'python' | 'llm';

interface CADUploaderProps {
  step: AppStep;
  loading: boolean;
  layers: string[];
  selectedLayers: string[];
  parserMode: ParserMode;
  onFileSelect: (f: File) => void;
  onLayerChange: (layers: string[]) => void;
  onParserModeChange: (mode: ParserMode) => void;
  onProcess: () => void;
}

// Standardization Dialog Component
function StandardizationDialog({ 
  isOpen, 
  onAccept, 
  onCancel 
}: { 
  isOpen: boolean; 
  onAccept: () => void; 
  onCancel: () => void;
}) {
  const [checklist, setChecklist] = useState({
    units: false,
    polylines: false,
    siteBoundary: false,
    footprint: false,
    floorLayers: false
  });

  const allChecked = Object.values(checklist).every(v => v);

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            CAD Document Standardization Requirements
          </h2>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 text-sm">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-800 font-medium">
              ⚠️ To ensure the Python Parser correctly interprets geometry and units, your DWG/DXF file must follow these standards.
            </p>
          </div>

          {/* Global Settings */}
          <div className="mb-6">
            <h3 className="font-bold text-slate-900 mb-3 text-base">📐 Global Settings</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <span className="font-medium">Drawing Units:</span> Millimeters (mm)
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <span className="font-medium">System Variable:</span> Set <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs">INSUNITS</code> to <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs">4</code> (Millimeters)
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <span className="font-medium">Geometry Type:</span> All areas must be drawn using <strong>Closed Polylines (LWPOLYLINE)</strong>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">✗</span>
                <div>
                  <span className="font-medium">Prohibited Layer Names:</span> Do not use single digits (1, 2, 3...8) as layer names
                </div>
              </div>
            </div>
          </div>

          {/* Layer Naming Convention */}
          <div className="mb-6">
            <h3 className="font-bold text-slate-900 mb-3 text-base">🏷️ Mandatory Layer Naming Convention</h3>
            
            {/* Site Boundary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <div className="font-medium text-blue-900 mb-1">A. Site Boundary (대지경계)</div>
              <div className="text-blue-800 text-xs space-y-1">
                <p><strong>Required Keywords:</strong> <code className="bg-blue-100 px-1 rounded">SITE</code>, <code className="bg-blue-100 px-1 rounded">BOUNDARY</code>, <code className="bg-blue-100 px-1 rounded">LND</code>, <code className="bg-blue-100 px-1 rounded">대지</code>, <code className="bg-blue-100 px-1 rounded">지적</code></p>
                <p><strong>Recommended:</strong> <code className="bg-blue-100 px-1 rounded">A-SITE-BNDY</code></p>
              </div>
            </div>

            {/* Building Footprint */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <div className="font-medium text-green-900 mb-1">B. Building Footprint (건축면적)</div>
              <div className="text-green-800 text-xs space-y-1">
                <p><strong>Required Keywords:</strong> <code className="bg-green-100 px-1 rounded">FOOTPRINT</code>, <code className="bg-green-100 px-1 rounded">HH</code>, <code className="bg-green-100 px-1 rounded">건축면적</code></p>
                <p><strong>Recommended:</strong> <code className="bg-green-100 px-1 rounded">A-AREA-FOOTPRINT</code> or <code className="bg-green-100 px-1 rounded">A-HH-FOOTPRINT</code></p>
              </div>
            </div>

            {/* Floor Area Layers */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
              <div className="font-medium text-purple-900 mb-1">C. Floor Area Layers (층별면적)</div>
              <div className="text-purple-800 text-xs space-y-1">
                <p><strong>Naming Pattern:</strong> <code className="bg-purple-100 px-1 rounded">[Prefix]-[Number][Suffix]</code></p>
                <p><strong>Allowed Suffixes:</strong> <code className="bg-purple-100 px-1 rounded">F</code>, <code className="bg-purple-100 px-1 rounded">FLR</code>, <code className="bg-purple-100 px-1 rounded">FLOOR</code>, <code className="bg-purple-100 px-1 rounded">층</code></p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                <div className="bg-purple-100 rounded p-1.5 text-center">
                  <div className="font-medium">1st Floor</div>
                  <code>A-AREA-01F</code>
                </div>
                <div className="bg-purple-100 rounded p-1.5 text-center">
                  <div className="font-medium">2nd Floor</div>
                  <code>A-AREA-02F</code>
                </div>
                <div className="bg-purple-100 rounded p-1.5 text-center">
                  <div className="font-medium">Basement</div>
                  <code>A-AREA-B1F</code>
                </div>
              </div>
            </div>

            {/* Material Specifications */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="font-medium text-amber-900 mb-1">D. Material Specifications (재료명세)</div>
              <div className="text-amber-800 text-xs space-y-1">
                <p><strong>Recommended Layer:</strong> <code className="bg-amber-100 px-1 rounded">A-ANNO-MATL</code></p>
                <p><strong>Text Keywords:</strong> <code className="bg-amber-100 px-1 rounded">THK</code>, <code className="bg-amber-100 px-1 rounded">유리</code>, <code className="bg-amber-100 px-1 rounded">콘크리트</code>, <code className="bg-amber-100 px-1 rounded">마감</code>, <code className="bg-amber-100 px-1 rounded">단열재</code>, <code className="bg-amber-100 px-1 rounded">방수</code></p>
              </div>
            </div>
          </div>

          {/* Quick Reference Table */}
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 mb-3 text-base">📋 Quick Reference</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Element</th>
                    <th className="px-3 py-2 text-left font-semibold">Standard Layer</th>
                    <th className="px-3 py-2 text-left font-semibold">Trigger Keyword</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-white">
                    <td className="px-3 py-2">Site Boundary</td>
                    <td className="px-3 py-2 font-mono">A-SITE-BNDY</td>
                    <td className="px-3 py-2 font-mono">SITE</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2">Building Footprint</td>
                    <td className="px-3 py-2 font-mono">A-AREA-FOOTPRINT</td>
                    <td className="px-3 py-2 font-mono">FOOTPRINT</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2">1st Floor Area</td>
                    <td className="px-3 py-2 font-mono">A-AREA-01F</td>
                    <td className="px-3 py-2 font-mono">1F (Regex)</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2">2nd Floor Area</td>
                    <td className="px-3 py-2 font-mono">A-AREA-02F</td>
                    <td className="px-3 py-2 font-mono">2F (Regex)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Checklist Section */}
        <div className="border-t border-slate-200 bg-gradient-to-r from-orange-50 to-red-50 px-6 py-4">
          <h3 className="font-bold text-slate-900 mb-3 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Please confirm you have checked the following:
          </h3>
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.units}
                onChange={() => toggleCheck('units')}
                className="mt-1 w-4 h-4 text-orange-600 border-orange-300 rounded focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-slate-700 group-hover:text-slate-900 transition-colors text-sm">
                My DXF file uses <strong>millimeters (mm)</strong> as drawing units (INSUNITS = 4)
              </span>
            </label>
            
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.polylines}
                onChange={() => toggleCheck('polylines')}
                className="mt-1 w-4 h-4 text-orange-600 border-orange-300 rounded focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-slate-700 group-hover:text-slate-900 transition-colors text-sm">
                All areas are drawn using <strong>closed polylines (LWPOLYLINE)</strong>
              </span>
            </label>
            
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.siteBoundary}
                onChange={() => toggleCheck('siteBoundary')}
                className="mt-1 w-4 h-4 text-orange-600 border-orange-300 rounded focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-slate-700 group-hover:text-slate-900 transition-colors text-sm">
                Site boundary layer includes keywords: <strong>SITE, BOUNDARY, LND, 대지, or 지적</strong>
              </span>
            </label>
            
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.footprint}
                onChange={() => toggleCheck('footprint')}
                className="mt-1 w-4 h-4 text-orange-600 border-orange-300 rounded focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-slate-700 group-hover:text-slate-900 transition-colors text-sm">
                Building footprint layer includes keywords: <strong>FOOTPRINT, HH, or 건축면적</strong>
              </span>
            </label>
            
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.floorLayers}
                onChange={() => toggleCheck('floorLayers')}
                className="mt-1 w-4 h-4 text-orange-600 border-orange-300 rounded focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-slate-700 group-hover:text-slate-900 transition-colors text-sm">
                Floor layers follow naming pattern: <strong>1F, 2F, B1F</strong> (or similar with FLR/FLOOR/층)
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            {allChecked ? (
              <span className="text-green-600 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                All requirements checked
              </span>
            ) : (
              <span>Please check all items to continue</span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={!allChecked}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              I Understand & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [showStandardDialog, setShowStandardDialog] = useState(false);

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

  const handleParserModeChange = (mode: ParserMode) => {
    if (mode === 'python') {
      // Always show dialog when switching to Python mode
      setShowStandardDialog(true);
      // Don't change mode yet, wait for acceptance
    } else {
      onParserModeChange(mode);
    }
  };

  const handleAcceptStandards = () => {
    setShowStandardDialog(false);
    onParserModeChange('python');
  };

  const handleCancelStandards = () => {
    setShowStandardDialog(false);
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
    <>
      <StandardizationDialog
        isOpen={showStandardDialog}
        onAccept={handleAcceptStandards}
        onCancel={handleCancelStandards}
      />
      
      <div className="w-full bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-8 shadow-xl flex-1 flex flex-col min-h-0">
        <h2 className="text-2xl font-bold text-slate-900 mb-6 shrink-0">Select Layers to Import</h2>
        
        <div className="mb-6 shrink-0">
          <label className="block text-sm font-bold text-slate-700 mb-3">Parser Mode</label>
          <div className="grid grid-cols-3 gap-3">
            {/* Manual Parser */}
            <button
              onClick={() => handleParserModeChange('manual')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                parserMode === 'manual'
                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start">
                <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center shrink-0 ${
                  parserMode === 'manual' ? 'border-orange-500' : 'border-slate-300'
                }`}>
                  {parserMode === 'manual' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Manual Parser</div>
                  <div className="text-xs text-slate-600 mt-1">Select polygons manually for site and building areas</div>
                </div>
              </div>
            </button>
            
            {/* Python Parser */}
            <button
              onClick={() => handleParserModeChange('python')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                parserMode === 'python'
                  ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start">
                <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center shrink-0 ${
                  parserMode === 'python' ? 'border-green-500' : 'border-slate-300'
                }`}>
                  {parserMode === 'python' && <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    Python Parser
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">SCRIPT</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">Auto-detect using predefined layer keywords</div>
                </div>
              </div>
            </button>

            {/* LLM Parser */}
            <button
              onClick={() => handleParserModeChange('llm')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                parserMode === 'llm'
                  ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start">
                <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center shrink-0 ${
                  parserMode === 'llm' ? 'border-purple-500' : 'border-slate-300'
                }`}>
                  {parserMode === 'llm' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    LLM Parser
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">AI</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">Multimodal AI analysis using Large Language Models</div>
                </div>
              </div>
            </button>
          </div>
          
          {/* Info box for selected mode */}
          {parserMode === 'python' && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
              <strong>Python Parser:</strong> Uses predefined keywords to detect SITE, FOOTPRINT, and FLOOR layers automatically. 
              Requires standardized layer naming.
            </div>
          )}
          {parserMode === 'llm' && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">
              <strong>LLM Parser:</strong> Uses LLM to analyze DXF image and text content. 
              Works with any layer naming convention but requires API processing time.
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex-1 overflow-y-auto custom-scrollbar min-h-0 max-h-[calc(100vh-550px)]">
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
          className={`w-full px-6 py-4 text-white rounded-xl font-bold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center shrink-0 ${
            parserMode === 'llm' 
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
              : parserMode === 'python'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
              : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700'
          }`}
        >
          {loading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {parserMode === 'llm' ? 'Analyzing with AI...' : 'Processing...'}
            </span>
          ) : (
            parserMode === 'llm' 
              ? '🤖 Analyze with Multimodal LLM' 
              : parserMode === 'python' 
              ? '🐍 Auto-Analyze with Python Script' 
              : 'Load Geometry'
          )}
        </button>
      </div>
    </>
  );
}
