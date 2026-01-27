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

type DocumentTypeId = 'landScope' | 'saleTransfer' | 'ownershipRights' | 'coOwnerConsent' | 'preDecision' | 'otherPermit' | 'combinedAgreement';

interface DocumentType {
  id: DocumentTypeId;
  labelKey: string;
  required: boolean;
  requiredEither?: DocumentTypeId; // If set, this doc OR the referenced doc is required
  maxFiles: number;
}

interface DocumentTypeState {
  files: File[];
  previews: string[];
  results: OCRResult[];
  processing: boolean;
  processed: boolean;
}

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

  // Document types configuration
  const documentTypes: DocumentType[] = [
    { id: 'landScope', labelKey: 'landScope', required: true, maxFiles: 1 },
    { id: 'saleTransfer', labelKey: 'saleTransfer', required: true, requiredEither: 'ownershipRights', maxFiles: 1 },
    { id: 'ownershipRights', labelKey: 'ownershipRights', required: true, requiredEither: 'saleTransfer', maxFiles: 1 },
    { id: 'coOwnerConsent', labelKey: 'coOwnerConsent', required: false, maxFiles: 3 },
    { id: 'preDecision', labelKey: 'preDecision', required: false, maxFiles: 1 },
    { id: 'otherPermit', labelKey: 'otherPermit', required: false, maxFiles: 5 },
    { id: 'combinedAgreement', labelKey: 'combinedAgreement', required: false, maxFiles: 1 },
  ];

  // OCR state - per document type
  const [documentStates, setDocumentStates] = useState<Record<DocumentTypeId, DocumentTypeState>>(() => {
    const initial: Record<string, DocumentTypeState> = {};
    const docTypeIds: DocumentTypeId[] = ['landScope', 'saleTransfer', 'ownershipRights', 'coOwnerConsent', 'preDecision', 'otherPermit', 'combinedAgreement'];
    docTypeIds.forEach(id => {
      initial[id] = { files: [], previews: [], results: [], processing: false, processed: false };
    });
    return initial as Record<DocumentTypeId, DocumentTypeState>;
  });
  const [expandedDocTypes, setExpandedDocTypes] = useState<Set<DocumentTypeId>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [ocrEngine, setOcrEngine] = useState<'surya' | 'paddle' | 'hybrid'>('hybrid');
  const [usePreprocessing, setUsePreprocessing] = useState(true);



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

  const handleDrop = useCallback((e: React.DragEvent, docTypeId: DocumentTypeId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      handleOcrFileSelect(Array.from(e.dataTransfer.files), docTypeId);
    }
  }, []);

  const handleOcrFileSelect = (files: File[], docTypeId: DocumentTypeId) => {
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

    const docType = documentTypes.find(d => d.id === docTypeId);
    const currentState = documentStates[docTypeId];
    const remainingSlots = (docType?.maxFiles || 1) - currentState.files.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);

    if (filesToAdd.length < validFiles.length) {
      setError(`Maximum ${docType?.maxFiles} file(s) allowed for this document type`);
    }

    // Create previews for images
    const newPreviews: string[] = [];
    let imageCount = 0;
    const totalImages = filesToAdd.filter(f => f.type.startsWith('image/')).length;
    
    filesToAdd.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          imageCount++;
          if (imageCount === totalImages) {
            setDocumentStates(prev => ({
              ...prev,
              [docTypeId]: {
                ...prev[docTypeId],
                previews: [...prev[docTypeId].previews, ...newPreviews],
              }
            }));
          }
        };
        reader.readAsDataURL(file);
      }
    });

    setDocumentStates(prev => ({
      ...prev,
      [docTypeId]: {
        ...prev[docTypeId],
        files: [...prev[docTypeId].files, ...filesToAdd],
      }
    }));
  };

  const processOCRForDocType = async (docTypeId: DocumentTypeId) => {
    const state = documentStates[docTypeId];
    if (state.files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setDocumentStates(prev => ({
      ...prev,
      [docTypeId]: { ...prev[docTypeId], processing: true }
    }));
    setError('');
    const results: OCRResult[] = [];

    try {
      // Process each file
      for (const file of state.files) {
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
      state.files.forEach(file => {
        uploadFormData.append('documents', file);
      });

      const uploadRes = await fetch(`${API_URL}/demo/upload-documents`, {
        method: 'POST',
        body: uploadFormData,
      });

      const uploadData = await uploadRes.json();
      
      if (uploadData.success) {
        const uploadedDocs = uploadData.data;
        
        // Save OCR results to database for each document (only successful ones)
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.success) {
            const ocrFormData = new FormData();
            ocrFormData.append('sessionId', sessionId!.toString());
            ocrFormData.append('extractedText', result.textContent || '');
            ocrFormData.append('engine', ocrEngine);
            ocrFormData.append('fileName', state.files[i].name);
            ocrFormData.append('fileUrl', uploadedDocs[i]?.fileUrl || '');
            ocrFormData.append('documentType', docTypeId);

            await fetch(`${API_URL}/demo/ocr-data`, {
              method: 'POST',
              body: ocrFormData,
            });
          }
        }

        // Check if all results are successful
        const allSuccessful = results.every(r => r.success);
        const hasAnySuccess = results.some(r => r.success);

        setDocumentStates(prev => ({
          ...prev,
          [docTypeId]: {
            ...prev[docTypeId],
            results,
            processing: false,
            processed: allSuccessful, // Only mark as processed if ALL succeeded
          }
        }));

        if (!allSuccessful) {
          const failedCount = results.filter(r => !r.success).length;
          setError(`${failedCount} file(s) failed OCR processing. You can retry or upload different files.`);
        }
      }
    } catch (err: any) {
      setError('Failed to process OCR: ' + err.message);
      setDocumentStates(prev => ({
        ...prev,
        [docTypeId]: { ...prev[docTypeId], processing: false }
      }));
    }
  };

  const clearDocumentType = (docTypeId: DocumentTypeId) => {
    setDocumentStates(prev => ({
      ...prev,
      [docTypeId]: { files: [], previews: [], results: [], processing: false, processed: false }
    }));
  };

  const downloadOCRText = (docTypeId: DocumentTypeId, index: number) => {
    const result = documentStates[docTypeId].results[index];
    if (!result?.textContent) return;

    const blob = new Blob([result.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-${docTypeId}-${index + 1}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOCRJson = (docTypeId: DocumentTypeId, index: number) => {
    const result = documentStates[docTypeId].results[index];
    if (!result?.results) return;

    const blob = new Blob([JSON.stringify(result.results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-${docTypeId}-${index + 1}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Check if OCR requirements are met
  const isOcrRequirementsMet = () => {
    // Check landScope (required)
    if (!documentStates.landScope.processed || documentStates.landScope.files.length === 0) {
      return false;
    }
    // Check either saleTransfer OR ownershipRights is processed
    const hasSaleTransfer = documentStates.saleTransfer.processed && documentStates.saleTransfer.files.length > 0;
    const hasOwnershipRights = documentStates.ownershipRights.processed && documentStates.ownershipRights.files.length > 0;
    if (!hasSaleTransfer && !hasOwnershipRights) {
      return false;
    }
    return true;
  };

  const getDocTypeLabel = (docType: DocumentType) => {
    const labels: Record<DocumentTypeId, string> = {
      landScope: t.demo?.ocr?.docTypes?.landScope || 'Land Scope Documents',
      saleTransfer: t.demo?.ocr?.docTypes?.saleTransfer || 'Sale/Transfer Confirmation',
      ownershipRights: t.demo?.ocr?.docTypes?.ownershipRights || 'Ownership/Rights Proof',
      coOwnerConsent: t.demo?.ocr?.docTypes?.coOwnerConsent || 'Co-owner Consent, Share Verification & Building Overview',
      preDecision: t.demo?.ocr?.docTypes?.preDecision || 'Pre-Decision Document',
      otherPermit: t.demo?.ocr?.docTypes?.otherPermit || 'Other Permit Forms',
      combinedAgreement: t.demo?.ocr?.docTypes?.combinedAgreement || 'Combined Agreement',
    };
    return labels[docType.id];
  };

  const getRequirementBadge = (docType: DocumentType) => {
    if (docType.id === 'landScope') {
      return <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{t.demo?.ocr?.required || 'Required'}</span>;
    }
    if (docType.id === 'saleTransfer' || docType.id === 'ownershipRights') {
      return <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{t.demo?.ocr?.requiredEither || 'Required (Either)'}</span>;
    }
    return <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t.demo?.ocr?.optional || 'Optional'}</span>;
  };

  // CAD Handlers
  // (Handled by CADSection component)

  const renderStepContent = () => {
    switch (currentStep) {
      case 'ocr':
        return (
          <div className="space-y-8">
            {/* Header with OCR Options */}
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.demo.ocr.title}</h2>
              <p className="text-slate-600 mb-6">{t.demo?.ocr?.uploadInstructions || 'Upload documents for each category. Process OCR for each document type individually.'}</p>
              
              {/* OCR Options Row */}
              <div className="flex flex-wrap gap-6 items-center">
                {/* Preprocessing Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-slate-700">{t.demo.ocr.preprocessing}</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={usePreprocessing}
                      onChange={(e) => setUsePreprocessing(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer-checked:bg-purple-600 transition-colors"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                  </div>
                </label>

                {/* OCR Engine Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{t.demo.ocr.engineTitle}:</span>
                  <select
                    value={ocrEngine}
                    onChange={(e) => setOcrEngine(e.target.value as any)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="surya">{t.demo.ocr.surya}</option>
                    <option value="paddle">{t.demo.ocr.paddle}</option>
                    <option value="hybrid">{t.demo.ocr.hybrid} ({t.demo.ocr.recommended})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Document Types List */}
            <div className="space-y-4">
              {documentTypes.map((docType) => {
                const state = documentStates[docType.id];
                const isExpanded = expandedDocTypes.has(docType.id);
                
                return (
                  <div key={docType.id} className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                    {/* Document Type Header */}
                    <button
                      onClick={() => {
                        setExpandedDocTypes(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(docType.id)) {
                            newSet.delete(docType.id);
                          } else {
                            newSet.add(docType.id);
                          }
                          return newSet;
                        });
                      }}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          state.processed 
                            ? 'bg-green-100 text-green-700' 
                            : state.files.length > 0 
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}>
                          {state.processed ? '✓' : state.files.length > 0 ? state.files.length : '—'}
                        </span>
                        <div className="text-left">
                          <div className="flex items-center">
                            <span className="font-semibold text-slate-900">{getDocTypeLabel(docType)}</span>
                            {getRequirementBadge(docType)}
                          </div>
                          <p className="text-xs text-slate-500">
                            {docType.maxFiles > 1 
                              ? (t.demo?.ocr?.maxFiles || 'Max {count} files').replace('{count}', String(docType.maxFiles))
                              : (t.demo?.ocr?.singleFile || '1 file')}
                          </p>
                        </div>
                      </div>
                      <svg 
                        className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-6 pb-6 border-t border-slate-200">
                        <div className="pt-4 grid lg:grid-cols-2 gap-6">
                          {/* Upload Area */}
                          <div>
                            <div
                              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 ${
                                dragActive
                                  ? 'border-purple-500 bg-purple-50'
                                  : 'border-slate-300 hover:border-purple-400 bg-slate-50'
                              }`}
                              onDragEnter={handleDrag}
                              onDragLeave={handleDrag}
                              onDragOver={handleDrag}
                              onDrop={(e) => handleDrop(e, docType.id)}
                            >
                              {state.files.length > 0 ? (
                                <div className="space-y-3">
                                  <p className="font-semibold text-slate-700">
                                    {t.demo.ocr.filesSelected.replace('{count}', String(state.files.length))}
                                  </p>
                                  <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {state.files.map((file, idx) => (
                                      <div key={idx} className="text-sm text-slate-600 p-2 bg-white rounded flex justify-between items-center">
                                        <div>
                                          <p className="font-medium truncate">{file.name}</p>
                                          <p className="text-xs">{(file.size / 1024).toFixed(2)} KB</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {!state.processed && (
                                    <button
                                      onClick={() => clearDocumentType(docType.id)}
                                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                                    >
                                      {t.demo.ocr.clearAll}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <svg className="w-12 h-12 mx-auto text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  <p className="text-sm font-medium text-slate-700 mb-1">{t.demo.ocr.dragDrop}</p>
                                  <p className="text-xs text-slate-500 mb-3">{t.demo.ocr.orClick}</p>
                                  <input
                                    type="file"
                                    multiple={docType.maxFiles > 1}
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={(e) => e.target.files && handleOcrFileSelect(Array.from(e.target.files), docType.id)}
                                    className="hidden"
                                    id={`ocr-file-upload-${docType.id}`}
                                  />
                                  <label
                                    htmlFor={`ocr-file-upload-${docType.id}`}
                                    className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                                  >
                                    {t.demo.ocr.selectFiles}
                                  </label>
                                </div>
                              )}
                            </div>

                            {/* Process Button */}
                            {state.files.length > 0 && !state.processed && (
                              <button
                                onClick={() => processOCRForDocType(docType.id)}
                                disabled={state.processing}
                                className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                              >
                                {state.processing ? t.common.processing : t.demo.ocr.processDocuments}
                              </button>
                            )}
                          </div>

                          {/* Results Area */}
                          <div>
                            {state.processing && (
                              <div className="bg-slate-50 rounded-xl p-8 text-center">
                                <svg className="animate-spin w-10 h-10 mx-auto text-purple-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <p className="text-slate-700 font-medium">{t.demo.ocr.processingDocuments.replace('{count}', String(state.files.length))}</p>
                              </div>
                            )}

                            {state.results.length > 0 && (
                              <div className="space-y-4 max-h-80 overflow-y-auto">
                                {/* Status Banner */}
                                {state.processed ? (
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                    <div className="flex items-center">
                                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-sm font-semibold text-green-900">{t.demo.ocr.completed}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center">
                                        <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-sm font-semibold text-red-900">{t.demo?.ocr?.ocrFailed || 'OCR Failed'}</span>
                                      </div>
                                      <button
                                        onClick={() => clearDocumentType(docType.id)}
                                        className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
                                      >
                                        {t.demo?.ocr?.retryUpload || 'Clear & Retry'}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {state.results.map((result, idx) => (
                                  <div key={idx} className={`rounded-lg p-4 space-y-3 ${result.success ? 'bg-slate-50' : 'bg-red-50/50'}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {result.success ? (
                                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        )}
                                        <span className="font-medium text-slate-900 text-sm">{state.files[idx]?.name}</span>
                                      </div>
                                      {result.success && (
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => downloadOCRText(docType.id, idx)}
                                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700"
                                          >
                                            TXT
                                          </button>
                                          {result.results && (
                                            <button
                                              onClick={() => downloadOCRJson(docType.id, idx)}
                                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                                            >
                                              JSON
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {result.success ? (
                                      <div className="space-y-3">
                                        {/* Image Previews */}
                                        <div className="grid grid-cols-2 gap-2">
                                          {/* Original Image Preview */}
                                          {state.previews[idx] && (
                                            <div>
                                              <p className="text-xs font-medium text-slate-600 mb-1">{t.demo?.ocr?.originalImage || 'Original'}</p>
                                              <img
                                                src={state.previews[idx]}
                                                alt={`Original ${idx + 1}`}
                                                className="w-full h-24 object-contain rounded border border-slate-200 bg-white"
                                              />
                                            </div>
                                          )}
                                          {/* Preprocessed Image */}
                                          {result.preprocessedImage && (
                                            <div>
                                              <p className="text-xs font-medium text-slate-600 mb-1">{t.demo?.ocr?.preprocessedImage || 'Preprocessed'}</p>
                                              <img
                                                src={result.preprocessedImage}
                                                alt={`Preprocessed ${idx + 1}`}
                                                className="w-full h-24 object-contain rounded border border-slate-200 bg-white"
                                              />
                                            </div>
                                          )}
                                        </div>
                                        {result.preprocessingMetadata?.rotation_applied !== undefined && result.preprocessingMetadata.rotation_applied !== 0 && (
                                          <p className="text-xs text-slate-500">
                                            {(t.demo?.ocr?.rotationApplied || 'Rotation applied: {degrees}°').replace('{degrees}', result.preprocessingMetadata.rotation_applied.toFixed(2))}
                                          </p>
                                        )}
                                        {/* Extracted Text */}
                                        <div className="bg-white rounded p-3 max-h-32 overflow-y-auto border border-slate-200">
                                          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                                            {result.textContent?.substring(0, 500) || t.demo.ocr.noTextDetected}
                                            {result.textContent && result.textContent.length > 500 && '...'}
                                          </pre>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="bg-red-100 p-3 rounded border border-red-200">
                                        <p className="text-xs text-red-700 font-medium">{t.demo?.ocr?.ocrFailed || 'OCR Failed'}</p>
                                        <p className="text-xs text-red-600 mt-1">{result.error}</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {!state.processing && state.results.length === 0 && (
                              <div className="bg-slate-50 rounded-xl p-8 text-center">
                                <svg className="w-16 h-16 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-slate-500 text-sm">{t.demo.ocr.uploadToSee}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Validation Message & Continue Button */}
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
              {!isOcrRequirementsMet() && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-900">{t.demo?.ocr?.requirementsNotMet || 'Requirements not met'}</p>
                      <ul className="text-xs text-amber-700 mt-1 list-disc list-inside">
                        {!documentStates.landScope.processed && (
                          <li>{t.demo?.ocr?.docTypes?.landScope || 'Land Scope Documents'} {t.demo?.ocr?.isRequired || 'is required'}</li>
                        )}
                        {!documentStates.saleTransfer.processed && !documentStates.ownershipRights.processed && (
                          <li>{t.demo?.ocr?.eitherRequired || 'Either Sale/Transfer Confirmation or Ownership/Rights Proof is required'}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setCurrentStep('cad')}
                disabled={!isOcrRequirementsMet()}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {t.demo.navigation.continueToCAD}
              </button>
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
                      {(() => {
                        const totalProcessed = Object.values(documentStates).reduce((acc, state) => acc + state.results.filter(r => r.success).length, 0);
                        const totalFiles = Object.values(documentStates).reduce((acc, state) => acc + state.files.length, 0);
                        return t.demo.complete.ocrResult.replace('{success}', String(totalProcessed)).replace('{total}', String(totalFiles));
                      })()}
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
