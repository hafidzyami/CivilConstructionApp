'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Dynamic import for map to avoid SSR
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);

type Step = 'ocr' | 'cad' | 'infrastructure' | 'complete';

interface OCRResult {
  fileName: string;
  textContent: string;
  fileUrl: string;
}

// Map click handler component
function MapClickHandler({ onClick }: { onClick: (e: any) => void }) {
  const map = useMapEvents({
    click: (e) => {
      onClick(e);
    },
  });
  return null;
}

export default function DemoPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('ocr');
  const [userId, setUserId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OCR state
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrEngine, setOcrEngine] = useState<'surya' | 'paddle' | 'hybrid'>('hybrid');
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  // CAD state
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [cadLayers, setCadLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [cadStep, setCadStep] = useState<'upload' | 'layers' | 'process'>('upload');
  const [cadResult, setCadResult] = useState<any>(null);

  // Infrastructure state
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.358137, 106.835432]);
  const [mapRadius, setMapRadius] = useState(500);
  const [infraData, setInfraData] = useState<any>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    initializeDemo();
  }, []);

  const initializeDemo = async () => {
    try {
      setLoading(true);
      const userIdRes = await fetch(`${API_URL}/demo/next-user-id`);
      const userIdData = await userIdRes.json();
      const newUserId = userIdData.data.userId;
      setUserId(newUserId);

      const sessionRes = await fetch(`${API_URL}/demo/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUserId }),
      });
      const sessionData = await sessionRes.json();
      setSessionId(sessionData.data.id);
    } catch (err: any) {
      setError('Failed to initialize demo session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // OCR Handlers
  const handleOcrFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      
      const validFiles = files.filter(f => validTypes.includes(f.type));
      if (validFiles.length !== files.length) {
        setError('Some files were skipped. Only PDF, DOC, DOCX, and images are allowed');
      }
      setOcrFiles(validFiles);
    }
  };

  const processOCR = async () => {
    if (ocrFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setOcrProcessing(true);
    setError('');
    const results: OCRResult[] = [];

    try {
      for (const file of ocrFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('preprocessing', 'true');
        formData.append('engine', ocrEngine);

        const response = await fetch(`${API_URL}/ocr/process`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        
        if (data.success && data.textContent) {
          results.push({
            fileName: file.name,
            textContent: data.textContent,
            fileUrl: '', // Will be set after upload
          });
        }
      }

      // Upload to MinIO and save to database
      const uploadFormData = new FormData();
      uploadFormData.append('sessionId', sessionId!.toString());
      ocrFiles.forEach(file => {
        uploadFormData.append('documents', file);
      });

      const uploadRes = await fetch(`${API_URL}/demo/upload-documents`, {
        method: 'POST',
        body: uploadFormData,
      });

      const uploadData = await uploadRes.json();
      
      if (uploadData.success) {
        // Update results with file URLs
        const uploadedDocs = uploadData.data;
        results.forEach((result, idx) => {
          result.fileUrl = uploadedDocs[idx]?.fileUrl || '';
        });

        // Save OCR results to database
        for (const result of results) {
          const ocrFormData = new FormData();
          ocrFormData.append('sessionId', sessionId!.toString());
          ocrFormData.append('extractedText', result.textContent);
          ocrFormData.append('engine', ocrEngine);
          ocrFormData.append('fileName', result.fileName);
          ocrFormData.append('fileUrl', result.fileUrl);

          await fetch(`${API_URL}/demo/ocr-data`, {
            method: 'POST',
            body: ocrFormData,
          });
        }

        setOcrResults(results);
        setCurrentStep('cad');
      }
    } catch (err: any) {
      setError('Failed to process OCR: ' + err.message);
    } finally {
      setOcrProcessing(false);
    }
  };

  // CAD Handlers
  const handleCadFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Please select a valid .dxf file');
      return;
    }

    setCadFile(file);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/cad/layers`, { method: 'POST', body: formData });
      const data = await res.json();
      setCadLayers(data.layers || []);
      setSelectedLayers(data.layers || []);
      setCadStep('layers');
    } catch (err) {
      setError('Failed to load CAD layers');
    } finally {
      setLoading(false);
    }
  };

  const processCad = async () => {
    if (!cadFile) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', cadFile);
      formData.append('layers', JSON.stringify(selectedLayers));
      formData.append('simplify', 'false');

      const res = await fetch(`${API_URL}/cad/process`, { method: 'POST', body: formData });
      const data = await res.json();

      setCadResult(data);

      // Save to database
      if (data.polygons && data.polygons.length > 0) {
        const areas = data.polygons.map((p: any) => p.area_raw);
        const totalArea = areas.reduce((a: number, b: number) => a + b, 0);

        await fetch(`${API_URL}/demo/cad-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            siteArea: totalArea,
            buildingArea: data.polygons[0]?.area_raw || 0,
            floorArea: totalArea,
            rawData: data,
          }),
        });
      }

      setCurrentStep('infrastructure');
    } catch (err) {
      setError('Failed to process CAD file');
    } finally {
      setLoading(false);
    }
  };

  // Infrastructure Handlers
  const handleMapClick = useCallback((e: any) => {
    if (e?.latlng) {
      setMapCenter([e.latlng.lat, e.latlng.lng]);
    }
  }, []);

  const queryInfrastructure = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/osm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: mapCenter[0],
          lon: mapCenter[1],
          radius: mapRadius,
        }),
      });

      const data = await response.json();
      setInfraData(data);

      // Save to database
      await fetch(`${API_URL}/demo/infrastructure-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          radius: mapRadius,
          results: data,
        }),
      });

      setCurrentStep('complete');
    } catch (err: any) {
      setError('Failed to query infrastructure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'ocr':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 1: Document OCR</h3>
              <p className="text-slate-600 mb-6">Upload documents and extract text automatically</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Documents (PDF, DOC, DOCX, Images)
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={handleOcrFileSelect}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                  />
                </div>

                {ocrFiles.length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-xl">
                    <p className="font-semibold text-slate-700 mb-2">{ocrFiles.length} file(s) selected:</p>
                    {ocrFiles.map((file, idx) => (
                      <div key={idx} className="text-sm text-slate-600">
                        • {file.name} ({(file.size / 1024).toFixed(2)} KB)
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    OCR Engine
                  </label>
                  <select
                    value={ocrEngine}
                    onChange={(e) => setOcrEngine(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                  >
                    <option value="hybrid">Hybrid (Best)</option>
                    <option value="surya">Surya</option>
                    <option value="paddle">PaddleOCR</option>
                  </select>
                </div>

                {ocrResults.length > 0 && (
                  <div className="bg-green-50 p-4 rounded-xl">
                    <p className="font-semibold text-green-700 mb-2">✓ OCR Complete!</p>
                    <p className="text-sm text-green-600">Processed {ocrResults.length} document(s)</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={processOCR}
              disabled={ocrProcessing || ocrFiles.length === 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ocrProcessing ? 'Processing OCR...' : 'Process & Continue'}
            </button>
          </div>
        );

      case 'cad':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 2: CAD Analysis</h3>
              <p className="text-slate-600 mb-6">Upload DXF file for building analysis</p>

              {cadStep === 'upload' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select DXF File
                  </label>
                  <input
                    type="file"
                    onChange={handleCadFileSelect}
                    accept=".dxf"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all outline-none"
                  />
                </div>
              )}

              {cadStep === 'layers' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Found {cadLayers.length} layers. Select layers to process:</p>
                  <div className="max-h-60 overflow-y-auto bg-slate-50 p-4 rounded-xl space-y-2">
                    {cadLayers.map((layer) => (
                      <label key={layer} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLayers.includes(layer)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLayers([...selectedLayers, layer]);
                            } else {
                              setSelectedLayers(selectedLayers.filter(l => l !== layer));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-slate-700">{layer}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={processCad}
                    disabled={loading || selectedLayers.length === 0}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Process CAD & Continue'}
                  </button>
                </div>
              )}

              {cadResult && (
                <div className="bg-green-50 p-4 rounded-xl">
                  <p className="font-semibold text-green-700 mb-2">✓ CAD Analysis Complete!</p>
                  <p className="text-sm text-green-600">Found {cadResult.polygons?.length || 0} polygon(s)</p>
                </div>
              )}
            </div>

            {cadStep === 'upload' && (
              <button
                onClick={() => setCurrentStep('infrastructure')}
                className="w-full px-6 py-3 bg-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-400 transition-all"
              >
                Skip CAD Analysis
              </button>
            )}
          </div>
        );

      case 'infrastructure':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 3: Infrastructure Explorer</h3>
              <p className="text-slate-600 mb-6">Select location and query nearby infrastructure</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={mapCenter[0]}
                      onChange={(e) => setMapCenter([parseFloat(e.target.value), mapCenter[1]])}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={mapCenter[1]}
                      onChange={(e) => setMapCenter([mapCenter[0], parseFloat(e.target.value)])}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Radius (meters): {mapRadius}m
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="100"
                    value={mapRadius}
                    onChange={(e) => setMapRadius(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                {typeof window !== 'undefined' && (
                  <div className="h-96 rounded-xl overflow-hidden border-2 border-slate-300">
                    <MapContainer
                      center={mapCenter}
                      zoom={15}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <MapClickHandler onClick={handleMapClick} />
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={mapCenter} />
                      <Circle center={mapCenter} radius={mapRadius} />
                    </MapContainer>
                  </div>
                )}

                {infraData && (
                  <div className="bg-green-50 p-4 rounded-xl">
                    <p className="font-semibold text-green-700 mb-2">✓ Infrastructure Query Complete!</p>
                    <p className="text-sm text-green-600">
                      Found {infraData.features?.length || 0} infrastructure feature(s)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={queryInfrastructure}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Querying...' : 'Query & Complete Demo'}
            </button>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-slate-900">Demo Completed!</h3>
            <p className="text-slate-600 text-lg">
              All data has been saved successfully with User ID: <strong>{userId}</strong>
            </p>
            <div className="bg-slate-50 p-6 rounded-xl text-left space-y-2">
              <p className="text-sm text-slate-600">
                <strong>OCR:</strong> {ocrResults.length} document(s) processed
              </p>
              <p className="text-sm text-slate-600">
                <strong>CAD:</strong> {cadResult ? `${cadResult.polygons?.length || 0} polygon(s) analyzed` : 'Skipped'}
              </p>
              <p className="text-sm text-slate-600">
                <strong>Infrastructure:</strong> {infraData?.features?.length || 0} feature(s) found
              </p>
            </div>
            <div className="flex gap-4 justify-center">
              <Link
                href="/"
                className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all"
              >
                Back to Home
              </Link>
              <button
                onClick={() => {
                  setCurrentStep('ocr');
                  setOcrFiles([]);
                  setOcrResults([]);
                  setCadFile(null);
                  setCadResult(null);
                  setInfraData(null);
                  initializeDemo();
                }}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Start New Demo
              </button>
            </div>
          </div>
        );
    }
  };

  const steps = [
    { id: 'ocr', label: 'OCR', icon: '🔍' },
    { id: 'cad', label: 'CAD', icon: '📐' },
    { id: 'infrastructure', label: 'Map', icon: '🗺️' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-200/30 rounded-full blur-3xl -z-10"></div>

      <div className="absolute top-8 left-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-8 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 mb-4">
              Integrated Demo Workflow
            </h1>
            <p className="text-slate-600 text-lg">
              Experience the complete system: OCR → CAD → Infrastructure
            </p>
            {userId && (
              <p className="text-sm text-slate-500 mt-2">
                User ID: <strong>{userId}</strong> | Session ID: <strong>{sessionId}</strong>
              </p>
            )}
          </div>

          {currentStep !== 'complete' && (
            <div className="mb-12">
              <div className="flex items-center justify-between">
                {steps.map((step, idx) => (
                  <div key={step.id} className="flex-1 flex items-center">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                          idx <= currentStepIndex
                            ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {step.icon}
                      </div>
                      <span
                        className={`text-sm mt-2 font-semibold ${
                          idx <= currentStepIndex ? 'text-pink-600' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div
                        className={`h-1 flex-1 mx-2 ${
                          idx < currentStepIndex
                            ? 'bg-gradient-to-r from-pink-500 to-rose-600'
                            : 'bg-slate-200'
                        }`}
                      ></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-10 shadow-2xl">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
                {error}
              </div>
            )}

            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
