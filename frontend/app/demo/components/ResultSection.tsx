'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n';

interface ComplianceCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  actualValue?: string;
  requiredValue?: string;
  regulation?: string;
  articleId?: string;
  message: string;
}

interface RegulationRule {
  articleId: string;
  articleNumber: string;
  title: string;
  regulation: string;
  level: string;
  text: string;
}

interface ComplianceResult {
  status: 'accepted' | 'rejected' | 'review_required';
  overallScore: number;
  checks: ComplianceCheck[];
  summary: string;
  applicableRegulations: RegulationRule[];
  recommendations: string[];
}

interface ResultSectionProps {
  sessionId: number | null;
  onAskMoreDetails: (status: 'accepted' | 'rejected' | 'review_required') => void;
  onStartNew: () => void;
}

export default function ResultSection({ sessionId, onAskMoreDetails, onStartNew }: ResultSectionProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [activeTab, setActiveTab] = useState<'checks' | 'regulations' | 'recommendations'>('checks');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    if (sessionId) {
      checkCompliance();
    }
  }, [sessionId]);

  const checkCompliance = async () => {
    try {
      setLoading(true);
      setError('');

      // First, run the compliance check
      const checkResponse = await fetch(`${API_URL}/demo/check-compliance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const checkData = await checkResponse.json();

      if (!checkData.success) {
        throw new Error(checkData.message || 'Failed to check compliance');
      }

      setResult(checkData.data);
    } catch (err: any) {
      console.error('Error checking compliance:', err);
      setError(err.message || 'Failed to check compliance');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'text-green-600 bg-green-100';
      case 'rejected':
        return 'text-red-600 bg-red-100';
      case 'review_required':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getCheckStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'fail':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        );
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return t.result?.status?.accepted || 'Accepted';
      case 'rejected':
        return t.result?.status?.rejected || 'Rejected';
      case 'review_required':
        return t.result?.status?.reviewRequired || 'Review Required';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="animate-spin w-16 h-16 text-purple-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-xl text-slate-700 font-medium">{t.result?.loading || 'Checking compliance...'}</p>
        <p className="text-sm text-slate-500 mt-2">{t.result?.loadingDesc || 'Analyzing your data against building regulations'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{t.result?.error || 'Error'}</h3>
        <p className="text-slate-600 mb-6">{error}</p>
        <button
          onClick={checkCompliance}
          className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
        >
          {t.common?.retry || 'Try Again'}
        </button>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Header with Status */}
      <div className="text-center">
        <div className={`inline-flex items-center px-6 py-3 rounded-full text-lg font-bold ${getStatusColor(result.status)}`}>
          {result.status === 'accepted' && (
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {result.status === 'rejected' && (
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {result.status === 'review_required' && (
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {getStatusLabel(result.status)}
        </div>

        {/* Overall Score */}
        <div className="mt-6">
          <div className="relative w-32 h-32 mx-auto">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="12"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke={result.overallScore >= 80 ? '#22c55e' : result.overallScore >= 50 ? '#eab308' : '#ef4444'}
                strokeWidth="12"
                strokeDasharray={`${(result.overallScore / 100) * 352} 352`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold text-slate-900">{result.overallScore}%</span>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-2">{t.result?.complianceScore || 'Compliance Score'}</p>
        </div>

        {/* Summary */}
        <p className="mt-6 text-slate-700 max-w-2xl mx-auto">{result.summary}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex space-x-8 justify-center">
          <button
            onClick={() => setActiveTab('checks')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'checks'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.result?.tabs?.checks || 'Compliance Checks'} ({result.checks.length})
          </button>
          <button
            onClick={() => setActiveTab('regulations')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'regulations'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.result?.tabs?.regulations || 'Applicable Regulations'} ({result.applicableRegulations.length})
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'recommendations'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.result?.tabs?.recommendations || 'Recommendations'} ({result.recommendations.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === 'checks' && (
          <div className="space-y-3">
            {result.checks.map((check, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${
                  check.status === 'pass'
                    ? 'bg-green-50 border-green-200'
                    : check.status === 'fail'
                    ? 'bg-red-50 border-red-200'
                    : check.status === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getCheckStatusIcon(check.status)}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-900">{check.name}</h4>
                      {check.regulation && (
                        <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded">
                          {check.regulation}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{check.message}</p>
                    {(check.actualValue || check.requiredValue) && (
                      <div className="flex gap-4 mt-2 text-xs">
                        {check.actualValue && (
                          <span className="text-slate-600">
                            <strong>{t.result?.actual || 'Actual'}:</strong> {check.actualValue}
                          </span>
                        )}
                        {check.requiredValue && (
                          <span className="text-slate-600">
                            <strong>{t.result?.required || 'Required'}:</strong> {check.requiredValue}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'regulations' && (
          <div className="space-y-3">
            {result.applicableRegulations.map((reg, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {reg.title || reg.articleId}
                    </h4>
                    <p className="text-xs text-purple-600 mt-1">
                      {reg.regulation} • {reg.level}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded">
                    {reg.articleId}
                  </span>
                </div>
                {reg.text && (
                  <p className="text-sm text-slate-600 mt-3 line-clamp-3">
                    {reg.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="space-y-3">
            {result.recommendations.map((rec, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-blue-200 bg-blue-50 flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                  {idx + 1}
                </div>
                <p className="text-slate-700">{rec}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 border-t border-slate-200">
        <button
          onClick={() => onAskMoreDetails(result.status)}
          className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
        >
          {t.result?.askMoreDetails || 'Ask for More Details'}
        </button>
        <button
          onClick={onStartNew}
          className="px-8 py-4 bg-slate-200 text-slate-700 rounded-xl font-semibold text-lg hover:bg-slate-300 transition-all"
        >
          {t.result?.startNew || 'Start New Analysis'}
        </button>
      </div>
    </div>
  );
}
