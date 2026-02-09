'use client';

import { useState } from 'react';
import { useLanguage } from '../i18n';
import Link from 'next/link';
import Image from 'next/image';

export default function RoomSegmentationPage() {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    room_segmentation: string;
    icon_segmentation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setResults(null);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/segmentation/process`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process image');
      }

      const data = await response.json();
      
      if (data.success) {
        setResults(data.data);
      } else {
        throw new Error(data.message || 'Processing failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-teal-50 to-slate-100">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center text-slate-600 hover:text-teal-600 transition-colors mb-8">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-cyan-600 mb-4">
            Room Segmentation
          </h1>
          <p className="text-xl text-slate-600">
            AI-powered floorplan analysis for room and object detection
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Upload Section */}
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Upload Floorplan</h2>
            
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-teal-500 transition-colors bg-slate-50/50">
              {preview ? (
                <div className="space-y-4">
                  <div className="relative h-64 w-full">
                    <Image 
                      src={preview} 
                      alt="Preview" 
                      fill 
                      className="object-contain rounded-lg"
                    />
                  </div>
                  <button 
                    onClick={() => {
                        setFile(null);
                        setPreview(null);
                        setResults(null);
                    }}
                    className="text-red-500 text-sm hover:underline"
                  >
                    Remove Image
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto text-teal-600">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <label className="cursor-pointer bg-teal-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-teal-700 transition-colors inline-block">
                      Select Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  <p className="text-sm text-slate-500">Supported formats: JPG, PNG</p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              className={`w-full mt-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all
                ${!file || loading 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:shadow-xl hover:-translate-y-1'
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : 'Start Segmentation'}
            </button>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
             {results ? (
                <>
                    <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">Room Segmentation</h3>
                        <div className="relative h-64 w-full bg-slate-100 rounded-xl overflow-hidden">
                            <Image 
                                src={`data:image/png;base64,${results.room_segmentation}`} 
                                alt="Room Segmentation" 
                                fill 
                                className="object-contain"
                            />
                        </div>
                    </div>
                    
                    <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">Icon Segmentation</h3>
                        <div className="relative h-64 w-full bg-slate-100 rounded-xl overflow-hidden">
                            <Image 
                                src={`data:image/png;base64,${results.icon_segmentation}`} 
                                alt="Icon Segmentation" 
                                fill 
                                className="object-contain"
                            />
                        </div>
                    </div>
                </>
             ) : (
                <div className="h-full flex items-center justify-center bg-white/40 backdrop-blur-sm border border-slate-200/60 rounded-3xl p-8 border-dashed">
                    <div className="text-center text-slate-400">
                        <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p className="text-lg font-medium">Results will appear here</p>
                        <p className="text-sm">Upload an image to see segmentation analysis</p>
                    </div>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
