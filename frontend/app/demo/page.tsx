'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import CADSection from './components/CADSection';
import ResultSection from './components/ResultSection';
import ResultChatbot from './components/ResultChatbot';
import { useLanguage } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

// Dynamic import InfrastructureSection to avoid SSR issues with Leaflet
const InfrastructureSection = dynamic(
  () => import('./components/InfrastructureSection'),
  { ssr: false }
);

type Step = 'ocr' | 'cad' | 'infrastructure' | 'result' | 'chatbot' | 'complete';



interface OCRResult {
  success: boolean;
  textContent?: string;
  results?: {
    text_lines: Array<{
      text: string;
      bbox: number[];
      confidence: number;
    }>;
  };
  preprocessedImage?: string;
  preprocessingMetadata?: {
    rotation_applied?: number;
  };
  error?: string;
}



export default function DemoPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('ocr');
  const [userId, setUserId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complianceStatus, setComplianceStatus] = useState<'accepted' | 'rejected' | 'review_required'>('review_required');

  // OCR state
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrPreviews, setOcrPreviews] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [ocrEngine, setOcrEngine] = useState<'surya' | 'paddle' | 'hybrid'>('hybrid');
  const [usePreprocessing, setUsePreprocessing] = useState(true);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);



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

    if (e.dataTransfer.files) {
      handleOcrFileSelect(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleOcrFileSelect = (files: File[]) => {
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

    // Create previews for images
    const newPreviews: string[] = [];
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          if (newPreviews.length === validFiles.filter(f => f.type.startsWith('image/')).length) {
            setOcrPreviews(prev => [...prev, ...newPreviews]);
          }
        };
        reader.readAsDataURL(file);
      }
    });

    setOcrFiles(prev => [...prev, ...validFiles]);
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
      // Process each file
      for (const file of ocrFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('preprocessing', usePreprocessing.toString());
        formData.append('engine', ocrEngine);

        const response = await fetch(`${API_URL}/ocr/process`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        results.push(data);
      }

      // Upload all files to MinIO
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
        const uploadedDocs = uploadData.data;
        
        // Save OCR results to database for each document
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const ocrFormData = new FormData();
          ocrFormData.append('sessionId', sessionId!.toString());
          ocrFormData.append('extractedText', result.textContent || '');
          ocrFormData.append('engine', ocrEngine);
          ocrFormData.append('fileName', ocrFiles[i].name);
          ocrFormData.append('fileUrl', uploadedDocs[i]?.fileUrl || '');

          await fetch(`${API_URL}/demo/ocr-data`, {
            method: 'POST',
            body: ocrFormData,
          });
        }

        setOcrResults(results);
      }
    } catch (err: any) {
      setError('Failed to process OCR: ' + err.message);
    } finally {
      setOcrProcessing(false);
    }
  };

  const downloadOCRText = (index: number) => {
    const result = ocrResults[index];
    if (!result?.textContent) return;

    const blob = new Blob([result.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${index + 1}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // CAD Handlers
  // (Handled by CADSection component)

  const renderStepContent = () => {
    switch (currentStep) {
      case 'ocr':
        return (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left: Upload & Options */}
            <div className="space-y-6">
              {/* File Upload */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.demo.ocr.title}</h2>

                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                    dragActive
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-300 hover:border-purple-400 bg-slate-50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {ocrFiles.length > 0 ? (
                    <div className="space-y-4">
                      <p className="font-semibold text-slate-700">{t.demo.ocr.filesSelected.replace('{count}', String(ocrFiles.length))}</p>
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {ocrFiles.map((file, idx) => (
                          <div key={idx} className="text-sm text-slate-600 p-2 bg-white rounded">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-xs">{(file.size / 1024).toFixed(2)} KB</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setOcrFiles([]);
                          setOcrPreviews([]);
                          setOcrResults([]);
                        }}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        {t.demo.ocr.clearAll}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-lg font-medium text-slate-700 mb-2">{t.demo.ocr.dragDrop}</p>
                      <p className="text-sm text-slate-500 mb-4">{t.demo.ocr.orClick}</p>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={(e) => e.target.files && handleOcrFileSelect(Array.from(e.target.files))}
                        className="hidden"
                        id="ocr-file-upload"
                      />
                      <label
                        htmlFor="ocr-file-upload"
                        className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        {t.demo.ocr.selectFiles}
                      </label>
                      <p className="text-xs text-slate-400 mt-4">{t.demo.ocr.supportedFormats}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* OCR Options */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.demo.ocr.options}</h2>

                {/* Preprocessing Toggle */}
                <div className="mb-6">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-lg font-medium text-slate-900">{t.demo.ocr.preprocessing}</span>
                      <p className="text-sm text-slate-500">{t.demo.ocr.preprocessingDesc}</p>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={usePreprocessing}
                        onChange={(e) => setUsePreprocessing(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-8 bg-slate-300 rounded-full peer-checked:bg-purple-600 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                    </div>
                  </label>
                </div>

                {/* OCR Engine */}
                <div>
                  <label className="block text-lg font-medium text-slate-900 mb-3">{t.demo.ocr.engineTitle}</label>
                  <div className="space-y-3">
                    {[
                      { value: 'surya', label: t.demo.ocr.surya, desc: t.demo.ocr.suryaDesc },
                      { value: 'paddle', label: t.demo.ocr.paddle, desc: t.demo.ocr.paddleDesc },
                      { value: 'hybrid', label: t.demo.ocr.hybrid, badge: t.demo.ocr.recommended, desc: t.demo.ocr.hybridDesc },
                    ].map((engine) => (
                      <label key={engine.value} className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                        <input
                          type="radio"
                          name="engine"
                          value={engine.value}
                          checked={ocrEngine === engine.value}
                          onChange={(e) => setOcrEngine(e.target.value as any)}
                          className="mt-1 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="ml-3">
                          <span className="font-medium text-slate-900">
                            {engine.label}
                            {engine.badge && (
                              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                {engine.badge}
                              </span>
                            )}
                          </span>
                          <p className="text-sm text-slate-500">{engine.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={processOCR}
                  disabled={ocrProcessing || ocrFiles.length === 0}
                  className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {ocrProcessing ? t.common.processing : t.demo.ocr.processDocuments}
                </button>
              </div>
            </div>

            {/* Right: Results */}
            <div className="space-y-6">
              {ocrProcessing && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg className="animate-spin w-16 h-16 mx-auto text-purple-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-xl text-slate-700 font-medium">{t.demo.ocr.processingDocuments.replace('{count}', String(ocrFiles.length))}</p>
                </div>
              )}

              {ocrResults.length > 0 && (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h3 className="text-lg font-semibold text-green-900">{t.demo.ocr.completed}</h3>
                        <p className="text-sm text-green-700 mt-1">{t.demo.ocr.processedCount.replace('{count}', String(ocrResults.length))}</p>
                      </div>
                    </div>
                  </div>

                  {ocrResults.map((result, idx) => (
                    <div key={idx} className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg space-y-4">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <h2 className="text-xl font-bold text-slate-900">{t.demo.ocr.document} {idx + 1}: {ocrFiles[idx]?.name}</h2>
                        <span className="text-xs text-slate-500">{(ocrFiles[idx].size / 1024).toFixed(2)} KB</span>
                      </div>
                      
                      {result.success ? (
                        <>
                          {/* Image Preview */}
                          {ocrPreviews[idx] && (
                            <div>
                              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.demo.ocr.originalImage}</h3>
                              <img
                                src={ocrPreviews[idx]}
                                alt={`Preview ${idx + 1}`}
                                className="max-h-48 mx-auto rounded-lg shadow-md border border-slate-200"
                              />
                            </div>
                          )}

                          {/* Preprocessed Image */}
                          {result.preprocessedImage && (
                            <div>
                              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.demo.ocr.preprocessedImage}</h3>
                              <img
                                src={result.preprocessedImage}
                                alt={`Preprocessed ${idx + 1}`}
                                className="max-h-48 mx-auto rounded-lg shadow-md border border-slate-200"
                              />
                              {result.preprocessingMetadata?.rotation_applied !== undefined && (
                                <p className="text-xs text-slate-500 mt-2 text-center">
                                  {t.demo.ocr.rotationApplied.replace('{degrees}', result.preprocessingMetadata.rotation_applied.toFixed(2))}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Extracted Text */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-sm font-semibold text-slate-700">{t.demo.ocr.extractedText}</h3>
                              <button
                                onClick={() => downloadOCRText(idx)}
                                className="px-3 py-1 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors"
                              >
                                {t.demo.ocr.downloadTxt}
                              </button>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-y-auto border border-slate-200">
                              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono">
                                {result.textContent || t.demo.ocr.noTextDetected}
                              </pre>
                            </div>
                            {result.results?.text_lines && (
                              <p className="text-xs text-slate-500 mt-2">
                                {t.demo.ocr.foundLines.replace('{count}', String(result.results.text_lines.length))}
                              </p>
                            )}
                          </div>

                          {/* JSON Results */}
                          {result.results && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold text-slate-700">{t.demo.ocr.jsonResults}</h3>
                                <button
                                  onClick={() => {
                                    const blob = new Blob([JSON.stringify(result.results, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `ocr-result-${idx + 1}-${Date.now()}.json`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="px-3 py-1 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors"
                                >
                                  {t.demo.ocr.downloadJson}
                                </button>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-y-auto border border-slate-200">
                                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                                  {JSON.stringify(result.results, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-semibold text-red-900">{t.demo.ocr.ocrFailed}</p>
                              <p className="text-sm text-red-700 mt-1">{result.error}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Continue to CAD Button */}
                  <button
                    onClick={() => setCurrentStep('cad')}
                    className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    {t.demo.navigation.continueToCAD}
                  </button>
                </>
              )}

              {!ocrProcessing && ocrResults.length === 0 && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg className="w-24 h-24 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-xl text-slate-500">{t.demo.ocr.uploadToSee}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'cad':
        return <CADSection sessionId={sessionId} onComplete={() => setCurrentStep('infrastructure')} />;

      case 'infrastructure':
        return <InfrastructureSection sessionId={sessionId} onComplete={() => setCurrentStep('result')} />;

      case 'result':
        return (
          <ResultSection
            sessionId={sessionId}
            onAskMoreDetails={(status) => {
              setComplianceStatus(status);
              setCurrentStep('chatbot');
            }}
            onStartNew={() => {
              window.location.reload();
            }}
          />
        );

      case 'chatbot':
        return (
          <ResultChatbot
            sessionId={sessionId}
            complianceStatus={complianceStatus}
            onBack={() => setCurrentStep('result')}
          />
        );

      case 'complete':
        return (
          <div className="text-center space-y-6 py-12">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-slate-900">{t.demo.complete.title}</h3>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              {t.demo.complete.message} <strong>{userId}</strong>
            </p>
            
            <div className="bg-slate-50 p-8 rounded-2xl text-left max-w-2xl mx-auto space-y-4">
              <h4 className="font-bold text-slate-900 text-xl mb-4">{t.demo.complete.summary}</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <p className="font-semibold text-slate-900">{t.demo.complete.ocrProcessing}</p>
                    <p className="text-sm text-slate-600">
                      {t.demo.complete.ocrResult.replace('{success}', String(ocrResults.filter(r => r.success).length)).replace('{total}', String(ocrResults.length))}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📐</span>
                  <div>
                    <p className="font-semibold text-slate-900">{t.demo.complete.cadAnalysis}</p>
                    <p className="text-sm text-slate-600">
                      {t.demo.complete.cadResult}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🗺️</span>
                  <div>
                    <p className="font-semibold text-slate-900">{t.demo.complete.infraMapping}</p>
                    <p className="text-sm text-slate-600">
                      {t.demo.complete.infraResult}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center pt-6">
              <Link
                href="/"
                className="px-8 py-4 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all text-lg"
              >
                {t.common.backToHome}
              </Link>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="px-8 py-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all text-lg"
              >
                {t.demo.complete.startNew}
              </button>
            </div>
          </div>
        );
    }
  };

  const steps = [
    { id: 'ocr', label: t.demo.steps.ocr, icon: '🔍' },
    { id: 'cad', label: t.demo.steps.cad, icon: '📐' },
    { id: 'infrastructure', label: t.demo.steps.infrastructure, icon: '🗺️' },
    { id: 'result', label: t.demo?.steps?.result || 'Result', icon: '📋' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const showStepper = !['chatbot', 'complete'].includes(currentStep);

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
          {t.common.backToHome}
        </Link>
      </div>

      <div className="absolute top-8 right-8">
        <LanguageSwitcher />
      </div>

      <div className="container mx-auto px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 mb-4">
              {currentStep === 'chatbot' ? (t.resultChatbot?.pageTitle || 'Ask About Your Result') : t.demo.title}
            </h1>
            <p className="text-slate-600 text-lg">
              {currentStep === 'chatbot' ? (t.resultChatbot?.pageSubtitle || 'Get detailed explanations about your compliance result') : t.demo.subtitle}
            </p>
            {userId && (
              <p className="text-sm text-slate-500 mt-2">
                {t.demo.session.userId}: <strong>{userId}</strong> | {t.demo.session.sessionId}: <strong>{sessionId}</strong>
              </p>
            )}
          </div>

          {showStepper && (
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
