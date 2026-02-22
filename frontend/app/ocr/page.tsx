'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useLanguage, interpolate } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

interface OCRResult {
  success: boolean;
  textContent?: string;
  results?: {
    layout: {
      regions: Array<{
        bbox: number[];
        type: string;
      }>;
    };
    tables: Array<{
      bbox: number[];
      confidence: number;
    }>;
    text_lines: Array<{
      text: string;
      bbox: number[];
      confidence: number;
      region_type: string;
    }>;
  };
  preprocessedImage?: string;
  preprocessingMetadata?: {
    steps_completed?: string[];
    rotation_applied?: number;
    original_size?: number[];
    final_size?: number[];
  };
  error?: string;
}

export default function OCRPage() {
  const { t } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [usePreprocessing, setUsePreprocessing] = useState(true);
  const [ocrEngine, setOcrEngine] = useState<'surya' | 'paddle' | 'hybrid' | 'vlm'>('hybrid');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff'];

    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (JPG, PNG, BMP, or TIFF)');
      return;
    }

    setSelectedFile(file);
    setResult(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const processOCR = async () => {
    if (!selectedFile) return;

    setProcessing(true);
    setResult(null);

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('preprocessing', usePreprocessing.toString());
    formData.append('engine', ocrEngine);

    try {
      const getApiUrl = () => {
        if (process.env.NEXT_PUBLIC_API_URL) {
          const envUrl = process.env.NEXT_PUBLIC_API_URL;
          if (typeof window !== 'undefined' &&
              window.location.protocol === 'https:' &&
              envUrl.startsWith('http://')) {
            return '/api';
          }
          return envUrl;
        }

        if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
          return '/api';
        }

        return 'http://localhost:6969/api';
      };

      const apiBaseUrl = getApiUrl();
      const response = await fetch(`${apiBaseUrl}/ocr/process`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process OCR',
      });
    } finally {
      setProcessing(false);
    }
  };

  const downloadText = () => {
    if (!result?.textContent) return;

    const blob = new Blob([result.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!result?.results) return;

    const blob = new Blob([JSON.stringify(result.results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl -z-10"></div>

      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link
                href="/"
                className="inline-flex items-center text-slate-600 hover:text-slate-900 transition-colors mb-4"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t.common.backToHome}
              </Link>
              <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                {t.ocr.title}
              </h1>
              <p className="text-xl text-slate-600 mt-2">
                {t.ocr.subtitle}
              </p>
            </div>
            <LanguageSwitcher />
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left Panel - Upload & Options */}
            <div className="space-y-6">
              {/* File Upload */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.ocr.uploadTitle}</h2>

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
                  {imagePreview ? (
                    <div className="space-y-4">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-h-64 mx-auto rounded-lg shadow-md"
                      />
                      <div className="text-sm text-slate-600">
                        <p className="font-medium">{selectedFile?.name}</p>
                        <p>{(selectedFile!.size / 1024).toFixed(2)} KB</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setImagePreview('');
                          setResult(null);
                        }}
                        className="text-red-600 hover:text-red-700 text-sm font-medium cursor-pointer"
                      >
                        {t.ocr.removeImage}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg
                        className="w-16 h-16 mx-auto text-slate-400 mb-4"
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
                      <p className="text-lg font-medium text-slate-700 mb-2">
                        {t.ocr.dragDrop}
                      </p>
                      <p className="text-sm text-slate-500 mb-4">{t.ocr.orClick}</p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileInput}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        {t.ocr.selectImage}
                      </label>
                      <p className="text-xs text-slate-400 mt-4">
                        {t.ocr.supportedFormats}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* OCR Options */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{t.ocr.options.title}</h2>

                {/* Preprocessing Toggle */}
                <div className="mb-6">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-lg font-medium text-slate-900">{t.ocr.options.preprocessing}</span>
                      <p className="text-sm text-slate-500">
                        {t.ocr.options.preprocessingDesc}
                      </p>
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

                {/* OCR Engine Selection */}
                <div>
                  <label className="block text-lg font-medium text-slate-900 mb-3">
                    {t.ocr.options.engineTitle}
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                      <input
                        type="radio"
                        name="engine"
                        value="surya"
                        checked={ocrEngine === 'surya'}
                        onChange={(e) => setOcrEngine(e.target.value as 'surya')}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="ml-3">
                        <span className="font-medium text-slate-900">{t.ocr.options.surya}</span>
                        <p className="text-sm text-slate-500">
                          {t.ocr.options.suryaDesc}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                      <input
                        type="radio"
                        name="engine"
                        value="paddle"
                        checked={ocrEngine === 'paddle'}
                        onChange={(e) => setOcrEngine(e.target.value as 'paddle')}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="ml-3">
                        <span className="font-medium text-slate-900">{t.ocr.options.paddle}</span>
                        <p className="text-sm text-slate-500">
                          {t.ocr.options.paddleDesc}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                      <input
                        type="radio"
                        name="engine"
                        value="hybrid"
                        checked={ocrEngine === 'hybrid'}
                        onChange={(e) => setOcrEngine(e.target.value as 'hybrid')}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="ml-3">
                        <span className="font-medium text-slate-900">
                          {t.ocr.options.hybrid}
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                            {t.ocr.options.recommended}
                          </span>
                        </span>
                        <p className="text-sm text-slate-500">
                          {t.ocr.options.hybridDesc}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-purple-50 has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50">
                      <input
                        type="radio"
                        name="engine"
                        value="vlm"
                        checked={ocrEngine === 'vlm'}
                        onChange={(e) => setOcrEngine(e.target.value as 'vlm')}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="ml-3">
                        <span className="font-medium text-slate-900">{t.ocr.options.vlm}</span>
                        <p className="text-sm text-slate-500">
                          {t.ocr.options.vlmDesc}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Process Button */}
                <button
                  onClick={processOCR}
                  disabled={!selectedFile || processing}
                  className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-xl"
                >
                  {processing ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      {t.common.processing}
                    </span>
                  ) : (
                    t.ocr.process
                  )}
                </button>
              </div>
            </div>

            {/* Right Panel - Results */}
            <div className="space-y-6">
              {result && (
                <>
                  {/* Success/Error Message */}
                  {result.success ? (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
                      <div className="flex items-start">
                        <svg
                          className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div>
                          <h3 className="text-lg font-semibold text-green-900">
                            {t.ocr.results.success}
                          </h3>
                          <p className="text-sm text-green-700 mt-1">
                            {interpolate(t.ocr.results.foundLines, { count: result.results?.text_lines.length || 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                      <div className="flex items-start">
                        <svg
                          className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div>
                          <h3 className="text-lg font-semibold text-red-900">{t.ocr.results.failed}</h3>
                          <p className="text-sm text-red-700 mt-1">{result.error}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {result.success && (
                    <>
                      {/* Preprocessed Image */}
                      {result.preprocessedImage && (
                        <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                          <h2 className="text-2xl font-bold text-slate-900 mb-4">
                            {t.ocr.results.preprocessedImage}
                          </h2>
                          <img
                            src={result.preprocessedImage}
                            alt="Preprocessed"
                            className="w-full rounded-lg shadow-md"
                          />
                          {result.preprocessingMetadata?.rotation_applied !== undefined && (
                            <p className="text-sm text-slate-600 mt-2">
                              {interpolate(t.ocr.results.rotationApplied, { degrees: result.preprocessingMetadata.rotation_applied.toFixed(2) })}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Extracted Text */}
                      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-2xl font-bold text-slate-900">{t.ocr.results.extractedText}</h2>
                          <button
                            onClick={downloadText}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                          >
                            {t.ocr.results.downloadTxt}
                          </button>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono">
                            {result.textContent || t.ocr.results.noTextDetected}
                          </pre>
                        </div>
                      </div>

                      {/* JSON Results */}
                      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-2xl font-bold text-slate-900">{t.ocr.results.jsonResults}</h2>
                          <button
                            onClick={downloadJSON}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors cursor-pointer"
                          >
                            {t.ocr.results.downloadJson}
                          </button>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                            {JSON.stringify(result.results, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {!result && !processing && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg
                    className="w-24 h-24 mx-auto text-slate-300 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-xl text-slate-500">
                    {t.ocr.results.placeholder}
                  </p>
                </div>
              )}

              {processing && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-12 text-center shadow-lg">
                  <svg
                    className="animate-spin w-16 h-16 mx-auto text-purple-600 mb-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="text-xl text-slate-700 font-medium">{t.ocr.results.processingMessage}</p>
                  <p className="text-sm text-slate-500 mt-2">
                    {t.ocr.results.processingNote}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
