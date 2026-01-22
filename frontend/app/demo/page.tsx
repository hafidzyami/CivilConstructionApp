'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Step = 'documents' | 'cad' | 'infrastructure' | 'ocr' | 'complete';

export default function DemoPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('documents');
  const [userId, setUserId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Document upload state
  const [documents, setDocuments] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  // CAD data state
  const [cadData, setCadData] = useState({
    siteArea: '',
    buildingArea: '',
    floorArea: '',
    bcr: '',
    far: '',
  });

  // Infrastructure data state
  const [infraData, setInfraData] = useState({
    latitude: '',
    longitude: '',
    radius: '500',
  });

  // OCR data state
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrEngine, setOcrEngine] = useState('paddleocr');

  // API base URL - use environment variable or fallback to /api
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    initializeDemo();
  }, []);

  const initializeDemo = async () => {
    try {
      setLoading(true);
      // Get next user ID
      const userIdRes = await fetch(`${API_URL}/demo/next-user-id`);
      const userIdData = await userIdRes.json();
      const newUserId = userIdData.data.userId;
      setUserId(newUserId);

      // Create session
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

  const handleDocumentUpload = async () => {
    if (documents.length === 0) {
      setError('Please select at least one document');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const formData = new FormData();
      formData.append('sessionId', sessionId!.toString());
      documents.forEach((doc) => {
        formData.append('documents', doc);
      });

      const res = await fetch(`${API_URL}/demo/upload-documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setUploadedDocs(data.data);
        setCurrentStep('cad');
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError('Failed to upload documents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCadData = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/demo/cad-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ...cadData,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStep('infrastructure');
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError('Failed to save CAD data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInfrastructure = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/demo/infrastructure-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ...infraData,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStep('ocr');
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError('Failed to save infrastructure data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOcr = async () => {
    try {
      setLoading(true);
      setError('');

      const formData = new FormData();
      formData.append('sessionId', sessionId!.toString());
      formData.append('extractedText', ocrText);
      formData.append('engine', ocrEngine);
      if (ocrFile) {
        formData.append('file', ocrFile);
        formData.append('fileName', ocrFile.name);
      }

      const res = await fetch(`${API_URL}/demo/ocr-data`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStep('complete');
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError('Failed to save OCR data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'documents':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 1: Upload Documents</h3>
              <p className="text-slate-600 mb-6">Upload your building documents to get started</p>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
                <input
                  type="file"
                  multiple
                  onChange={(e) => setDocuments(Array.from(e.target.files || []))}
                  className="hidden"
                  id="document-upload"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                />
                <label
                  htmlFor="document-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <svg
                    className="w-16 h-16 text-slate-400 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-lg font-semibold text-slate-700">
                    Click to upload documents
                  </span>
                  <span className="text-sm text-slate-500 mt-2">
                    PDF, DOC, DOCX, PNG, JPG (Max 10 files)
                  </span>
                </label>
              </div>

              {documents.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="font-semibold text-slate-700">Selected files:</p>
                  {documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {doc.name} ({(doc.size / 1024).toFixed(2)} KB)
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleDocumentUpload}
              disabled={loading || documents.length === 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Uploading...' : 'Upload & Continue'}
            </button>
          </div>
        );

      case 'cad':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 2: CAD Analysis</h3>
              <p className="text-slate-600 mb-6">Enter site and building measurements</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Site Area (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cadData.siteArea}
                    onChange={(e) => setCadData({ ...cadData, siteArea: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Building Area (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cadData.buildingArea}
                    onChange={(e) => setCadData({ ...cadData, buildingArea: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Floor Area (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cadData.floorArea}
                    onChange={(e) => setCadData({ ...cadData, floorArea: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    BCR (Building Coverage Ratio)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cadData.bcr}
                    onChange={(e) => setCadData({ ...cadData, bcr: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    FAR (Floor Area Ratio)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cadData.far}
                    onChange={(e) => setCadData({ ...cadData, far: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveCadData}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        );

      case 'infrastructure':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Step 3: Infrastructure Explorer
              </h3>
              <p className="text-slate-600 mb-6">Enter location to explore nearby infrastructure</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={infraData.latitude}
                    onChange={(e) => setInfraData({ ...infraData, latitude: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    placeholder="-7.250445"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={infraData.longitude}
                    onChange={(e) => setInfraData({ ...infraData, longitude: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    placeholder="112.768845"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Radius (meters)
                  </label>
                  <input
                    type="number"
                    value={infraData.radius}
                    onChange={(e) => setInfraData({ ...infraData, radius: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveInfrastructure}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        );

      case 'ocr':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Step 4: Document OCR</h3>
              <p className="text-slate-600 mb-6">Extract text from documents</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Upload Document (Optional)
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setOcrFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                    accept=".pdf,.png,.jpg,.jpeg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    OCR Engine
                  </label>
                  <select
                    value={ocrEngine}
                    onChange={(e) => setOcrEngine(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                  >
                    <option value="paddleocr">PaddleOCR</option>
                    <option value="surya">Surya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Extracted Text
                  </label>
                  <textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                    placeholder="Enter or paste extracted text..."
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveOcr}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Complete Demo'}
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
              Your data has been saved successfully with User ID: <strong>{userId}</strong>
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/"
                className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all"
              >
                Back to Home
              </Link>
              <button
                onClick={() => {
                  setCurrentStep('documents');
                  setDocuments([]);
                  setCadData({ siteArea: '', buildingArea: '', floorArea: '', bcr: '', far: '' });
                  setInfraData({ latitude: '', longitude: '', radius: '500' });
                  setOcrFile(null);
                  setOcrText('');
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
    { id: 'documents', label: 'Documents', icon: '📄' },
    { id: 'cad', label: 'CAD', icon: '📐' },
    { id: 'infrastructure', label: 'Infrastructure', icon: '🗺️' },
    { id: 'ocr', label: 'OCR', icon: '🔍' },
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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 mb-4">
              Demo Workflow
            </h1>
            <p className="text-slate-600 text-lg">
              Complete all steps to demonstrate the full system capabilities
            </p>
            {userId && (
              <p className="text-sm text-slate-500 mt-2">
                User ID: <strong>{userId}</strong> | Session ID: <strong>{sessionId}</strong>
              </p>
            )}
          </div>

          {/* Progress Steps */}
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

          {/* Content */}
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
