'use client';

import { useState, useCallback } from 'react';
import { useLanguage } from '../../i18n';

interface RoomInfo {
  pixels: number;
  percentage: number;
}

interface FloorplanResult {
  success: boolean;
  rooms: {
    classes: string[];
    stats: Record<string, RoomInfo>;
    summary: Record<string, RoomInfo>;
  };
  icons: {
    classes: string[];
    stats: Record<string, RoomInfo>;
    summary: Record<string, RoomInfo>;
  };
  imageSize: { height: number; width: number };
  visualizations: {
    roomSegmentation: string;
    iconSegmentation: string;
    vectorizedRooms?: string;
    vectorizedIcons?: string;
  };
}

interface FloorPlanSectionProps {
  sessionId: number | null;
  onComplete: () => void;
}

const ROOM_COLORS: Record<string, string> = {
  Kitchen: '#8dd3c7',
  'Living Room': '#fdb462',
  'Bed Room': '#fccde5',
  Bath: '#80b1d3',
  Entry: '#d9d9d9',
  Storage: '#577a4d',
  Garage: '#fb8072',
  Railing: '#d9d9d9',
};

const ICON_COLORS: Record<string, string> = {
  Window: '#8dd3c7',
  Door: '#b15928',
  Closet: '#fdb462',
  'Electrical Appliance': '#ffff99',
  Toilet: '#fccde5',
  Sink: '#80b1d3',
  'Sauna Bench': '#d9d9d9',
  'Fire Place': '#fb8072',
  Bathtub: '#696969',
  Chimney: '#577a4d',
};

export default function FloorPlanSection({ sessionId, onComplete }: FloorPlanSectionProps) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FloorplanResult | null>(null);
  const [activeTab, setActiveTab] = useState<'rooms' | 'icons' | 'visualization'>('rooms');
  const [dragActive, setDragActive] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (f: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp'];
    if (!validTypes.includes(f.type)) {
      setError(t.demo?.floorplan?.invalidFormat || 'Please select a valid image file (PNG, JPG, BMP)');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const analyzeFloorplan = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/cubicasa/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Analysis failed');
      }

      setResult(data);

      // Save to database
      if (sessionId) {
        try {
          await fetch(`${API_URL}/demo/floorplan-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              roomStats: data.rooms?.stats,
              iconStats: data.icons?.stats,
              roomSummary: data.rooms?.summary,
              iconSummary: data.icons?.summary,
              imageWidth: data.imageSize?.width,
              imageHeight: data.imageSize?.height,
              rawData: data,
            }),
          });
        } catch (err) {
          console.error('Failed to save floorplan data:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze floor plan');
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');
  };

  const roomEntries = result ? Object.entries(result.rooms.summary) : [];
  const iconEntries = result ? Object.entries(result.icons.summary) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {t.demo?.floorplan?.title || 'Floor Plan Analysis'}
            </h2>
            <p className="text-slate-600 text-sm">
              {t.demo?.floorplan?.subtitle || 'Upload a floor plan image to detect rooms, doors, windows, and other elements using AI'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload / Image Preview */}
        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
            <h3 className="text-sm font-bold text-slate-800 mb-4">
              {t.demo?.floorplan?.uploadTitle || 'Floor Plan Image'}
            </h3>

            {!file ? (
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-300 hover:border-emerald-400 bg-slate-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  {t.demo?.floorplan?.dragDrop || 'Drag and drop a floor plan image here'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {t.demo?.floorplan?.supportedFormats || 'Supported: PNG, JPG, BMP'}
                </p>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.bmp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                  id="floorplan-upload"
                />
                <label
                  htmlFor="floorplan-upload"
                  className="inline-block px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  {t.demo?.floorplan?.selectFile || 'Select Image'}
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                  <img
                    src={preview}
                    alt="Floor plan preview"
                    className="w-full h-auto max-h-80 object-contain"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">{file.name}</span>
                    <span className="ml-2 text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  {!result && (
                    <button
                      onClick={clearFile}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      {t.demo?.floorplan?.clearFile || 'Clear'}
                    </button>
                  )}
                </div>

                {!result && (
                  <button
                    onClick={analyzeFloorplan}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t.demo?.floorplan?.analyzing || 'Analyzing floor plan...'}
                      </span>
                    ) : (
                      t.demo?.floorplan?.analyze || 'Analyze Floor Plan'
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {loading && (
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 shadow-lg">
              <div className="flex flex-col items-center justify-center">
                <svg className="animate-spin w-12 h-12 text-emerald-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-lg font-semibold text-slate-700">
                  {t.demo?.floorplan?.analyzing || 'Analyzing floor plan...'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {t.demo?.floorplan?.analyzingDesc || 'Detecting rooms, doors, windows and other elements'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
              {/* Summary Banner */}
              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">
                      {t.demo?.floorplan?.analysisComplete || 'Analysis Complete'}
                    </h3>
                    <p className="text-emerald-100 text-sm">
                      {(t.demo?.floorplan?.detectedSummary || '{rooms} room types, {icons} icon types detected')
                        .replace('{rooms}', String(roomEntries.length))
                        .replace('{icons}', String(iconEntries.length))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-emerald-100">{t.demo?.floorplan?.imageSize || 'Image'}</p>
                      <p className="font-semibold text-sm">{result.imageSize.width} x {result.imageSize.height}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                {(['rooms', 'icons', 'visualization'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                      activeTab === tab
                        ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab === 'rooms' && (t.demo?.floorplan?.tabs?.rooms || 'Rooms')}
                    {tab === 'icons' && (t.demo?.floorplan?.tabs?.icons || 'Icons')}
                    {tab === 'visualization' && (t.demo?.floorplan?.tabs?.visualization || 'Visualization')}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-4 max-h-96 overflow-y-auto">
                {activeTab === 'rooms' && (
                  <div className="space-y-3">
                    {roomEntries.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">
                        {t.demo?.floorplan?.noRooms || 'No rooms detected'}
                      </p>
                    ) : (
                      roomEntries.map(([name, info]) => (
                        <div key={name} className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: ROOM_COLORS[name] || '#999' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-800">{name}</span>
                              <span className="text-sm text-slate-500">{info.percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${Math.min(info.percentage * 2, 100)}%`,
                                  backgroundColor: ROOM_COLORS[name] || '#999',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'icons' && (
                  <div className="space-y-3">
                    {iconEntries.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">
                        {t.demo?.floorplan?.noIcons || 'No icons detected'}
                      </p>
                    ) : (
                      iconEntries.map(([name, info]) => (
                        <div key={name} className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: ICON_COLORS[name] || '#999' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-800">{name}</span>
                              <span className="text-sm text-slate-500">{info.percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${Math.min(info.percentage * 3, 100)}%`,
                                  backgroundColor: ICON_COLORS[name] || '#999',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'visualization' && (
                  <div className="space-y-4">
                    {result.visualizations.roomSegmentation && (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          {t.demo?.floorplan?.roomSegmentation || 'Room Segmentation'}
                        </p>
                        <img
                          src={result.visualizations.roomSegmentation}
                          alt="Room segmentation"
                          className="w-full rounded-lg border border-slate-200"
                        />
                      </div>
                    )}
                    {result.visualizations.iconSegmentation && (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          {t.demo?.floorplan?.iconSegmentation || 'Icon Segmentation'}
                        </p>
                        <img
                          src={result.visualizations.iconSegmentation}
                          alt="Icon segmentation"
                          className="w-full rounded-lg border border-slate-200"
                        />
                      </div>
                    )}
                    {result.visualizations.vectorizedRooms && (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          {t.demo?.floorplan?.vectorizedRooms || 'Vectorized Rooms'}
                        </p>
                        <img
                          src={result.visualizations.vectorizedRooms}
                          alt="Vectorized rooms"
                          className="w-full rounded-lg border border-slate-200"
                        />
                      </div>
                    )}
                    {result.visualizations.vectorizedIcons && (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          {t.demo?.floorplan?.vectorizedIcons || 'Vectorized Icons'}
                        </p>
                        <img
                          src={result.visualizations.vectorizedIcons}
                          alt="Vectorized icons"
                          className="w-full rounded-lg border border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && !result && !error && (
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 shadow-lg">
              <div className="flex flex-col items-center justify-center text-center">
                <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <p className="text-slate-500 text-sm">
                  {t.demo?.floorplan?.uploadToSee || 'Upload a floor plan image and click Analyze to see results'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Continue Button */}
      <button
        onClick={onComplete}
        disabled={!result}
        className="w-full px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {t.demo?.navigation?.continueToInfra || 'Continue to Infrastructure Mapping'}
      </button>
    </div>
  );
}
