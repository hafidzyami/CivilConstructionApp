'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLanguage } from '../../i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher';

// Dynamic import for SessionMap component to avoid SSR issues
const SessionMap = dynamic(
  () => import('../components/SessionMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    )
  }
);

interface Session {
  id: number;
  userId: number;
  createdAt: string;
  updatedAt: string;
  documents: any[];
  cadData: any;
  infrastructureData: any;
  ocrData: any[];
  complianceResult: any;
  chatHistory: any[];
}

// Document type configuration for display
const DOCUMENT_TYPES: Record<string, { label: string; badge: string; badgeColor: string }> = {
  landScope: { 
    label: 'Land Scope Documents', 
    badge: 'Required', 
    badgeColor: 'bg-red-100 text-red-700' 
  },
  saleTransfer: { 
    label: 'Sale/Transfer Confirmation', 
    badge: 'Required (Either 2 or 3)', 
    badgeColor: 'bg-orange-100 text-orange-700' 
  },
  ownershipRights: { 
    label: 'Ownership/Rights Proof', 
    badge: 'Required (Either 2 or 3)', 
    badgeColor: 'bg-orange-100 text-orange-700' 
  },
  coOwnerConsent: { 
    label: 'Co-owner Consent, Share Verification & Building Overview', 
    badge: 'Optional (max 3)', 
    badgeColor: 'bg-slate-100 text-slate-600' 
  },
  preDecision: { 
    label: 'Pre-Decision Document', 
    badge: 'Optional', 
    badgeColor: 'bg-slate-100 text-slate-600' 
  },
  otherPermit: { 
    label: 'Other Permit Forms', 
    badge: 'Optional (max 5)', 
    badgeColor: 'bg-slate-100 text-slate-600' 
  },
  combinedAgreement: { 
    label: 'Combined Agreement', 
    badge: 'Optional', 
    badgeColor: 'bg-slate-100 text-slate-600' 
  },
};

// Color mapping for building types (read-only)
const TYPE_COLORS: Record<string, { color: string; fillColor: string }> = {
  'Hospital': { color: '#DC2626', fillColor: '#FCA5A5' },
  'School': { color: '#D97706', fillColor: '#FCD34D' },
  'Residential Housing': { color: '#059669', fillColor: '#6EE7B7' },
  'River': { color: '#0284C7', fillColor: '#7DD3FC' },
  'Lake': { color: '#1D4ED8', fillColor: '#93C5FD' },
  'Office': { color: '#7C3AED', fillColor: '#C4B5FD' },
  'Others': { color: '#14B8A6', fillColor: '#5EEAD4' }
};

export default function AdminDashboard() {
  const { t } = useLanguage();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    // Check if admin is logged in
    const isLoggedIn = localStorage.getItem('adminLoggedIn');
    if (!isLoggedIn) {
      router.push('/admin/login');
      return;
    }

    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/demo/sessions`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.data);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    if (!confirm(t.admin.dashboard.deleteConfirm)) {
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/demo/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        // Refresh sessions list
        fetchSessions();
        // Close detail modal if viewing deleted session
        if (selectedSession?.id === sessionId) {
          setShowDetail(false);
          setSelectedSession(null);
        }
      } else {
        alert(t.admin.dashboard.deleteFailed + ': ' + data.message);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert(t.admin.dashboard.deleteFailed);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('adminEmail');
    router.push('/admin/login');
  };

  const viewSessionDetail = (session: Session) => {
    setSelectedSession(session);
    setShowDetail(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-slate-600">{t.admin.dashboard.loadingDashboard}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl -z-10"></div>

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10">
        <div className="container mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t.common.home}
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">{t.admin.dashboard.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
            >
              {t.admin.dashboard.logout}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{t.admin.dashboard.totalSessions}</p>
                <p className="text-3xl font-bold text-slate-900">{sessions.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{t.admin.dashboard.uniqueUsers}</p>
                <p className="text-3xl font-bold text-slate-900">
                  {new Set(sessions.map((s) => s.userId)).size}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{t.admin.dashboard.totalDocuments}</p>
                <p className="text-3xl font-bold text-slate-900">
                  {sessions.reduce((acc, s) => acc + s.documents.length, 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{t.admin.dashboard.ocrRecords}</p>
                <p className="text-3xl font-bold text-slate-900">
                  {sessions.reduce((acc, s) => acc + s.ocrData.length, 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions Table */}
        <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">{t.admin.dashboard.sessionsHistory}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.sessionId}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.userId}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.documents}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.cadData}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.infrastructure}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.ocrRecords}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.createdAt}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t.admin.dashboard.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      #{session.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {t.admin.dashboard.userId} {session.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {session.documents.length} {t.admin.dashboard.files}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {session.cadData ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          ✓ {t.admin.dashboard.saved}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                          - {t.admin.dashboard.none}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {session.infrastructureData ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          ✓ {t.admin.dashboard.saved}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                          - {t.admin.dashboard.none}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {session.ocrData.length} {t.admin.dashboard.records}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => viewSessionDetail(session)}
                          className="text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          {t.admin.dashboard.viewDetails}
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          className="text-red-600 hover:text-red-800 font-semibold"
                        >
                          {t.admin.dashboard.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sessions.length === 0 && (
              <div className="text-center py-12">
                <svg
                  className="w-16 h-16 text-slate-300 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p className="text-slate-600 text-lg">{t.admin.dashboard.noSessionsYet}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetail && selectedSession && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-8 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">
                {t.admin.dashboard.sessionDetails} #{selectedSession.id}
              </h3>
              <button
                onClick={() => setShowDetail(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-2">{t.admin.dashboard.basicInfo}</h4>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
                  <div>
                    <p className="text-sm text-slate-600">{t.admin.dashboard.userId}</p>
                    <p className="font-semibold">{selectedSession.userId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{t.admin.dashboard.sessionId}</p>
                    <p className="font-semibold">{selectedSession.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{t.admin.dashboard.createdAt}</p>
                    <p className="font-semibold">
                      {new Date(selectedSession.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{t.admin.dashboard.lastUpdated}</p>
                    <p className="font-semibold">
                      {new Date(selectedSession.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Compliance Result */}
              {selectedSession.complianceResult && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">{t.admin?.dashboard?.complianceResult || 'Compliance Result'}</h4>
                  <div className="bg-slate-50 p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        selectedSession.complianceResult.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        selectedSession.complianceResult.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {selectedSession.complianceResult.status === 'accepted' ? (t.result?.status?.accepted || 'Accepted') :
                         selectedSession.complianceResult.status === 'rejected' ? (t.result?.status?.rejected || 'Rejected') :
                         (t.result?.status?.reviewRequired || 'Review Required')}
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {selectedSession.complianceResult.overallScore}%
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">{selectedSession.complianceResult.summary}</p>
                    
                    {/* Checks Summary */}
                    {selectedSession.complianceResult.checks && Array.isArray(selectedSession.complianceResult.checks) && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-semibold text-slate-500 mb-2">{t.admin?.dashboard?.checksOverview || 'Checks Overview'}</p>
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                            ✓ {selectedSession.complianceResult.checks.filter((c: any) => c.status === 'pass').length} passed
                          </span>
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                            ✗ {selectedSession.complianceResult.checks.filter((c: any) => c.status === 'fail').length} failed
                          </span>
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
                            ⚠ {selectedSession.complianceResult.checks.filter((c: any) => c.status === 'warning').length} warnings
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chat History */}
              {selectedSession.chatHistory && selectedSession.chatHistory.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    {t.admin?.dashboard?.chatHistory || 'Chat History'} ({selectedSession.chatHistory.length} {t.admin?.dashboard?.messages || 'messages'})
                  </h4>
                  <div className="bg-slate-50 p-4 rounded-xl max-h-80 overflow-y-auto space-y-3">
                    {selectedSession.chatHistory.map((msg: any) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                          msg.role === 'user' 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-white border border-slate-200'
                        }`}>
                          <p className={`text-sm ${msg.role === 'user' ? 'text-white' : 'text-slate-700'}`}>
                            {msg.content}
                          </p>
                          <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-slate-400'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents by Type */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-2">
                  {t.admin.dashboard.documents} ({selectedSession.documents.length})
                </h4>
                <div className="space-y-4">
                  {/* Group documents by type */}
                  {Object.entries(DOCUMENT_TYPES).map(([typeId, typeConfig]) => {
                    const docsOfType = selectedSession.documents.filter((doc: any) => doc.documentType === typeId);
                    const ocrOfType = selectedSession.ocrData.filter((ocr: any) => ocr.documentType === typeId);
                    
                    if (docsOfType.length === 0 && ocrOfType.length === 0) return null;
                    
                    return (
                      <div key={typeId} className="bg-slate-50 p-3 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium text-slate-900">{typeConfig.label}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${typeConfig.badgeColor}`}>
                            {typeConfig.badge}
                          </span>
                        </div>
                        <div className="space-y-2 ml-2">
                          {docsOfType.map((doc: any) => (
                            <div key={doc.id} className="bg-white p-2 rounded-lg flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-700">{doc.fileName}</p>
                                <p className="text-xs text-slate-500">
                                  {(doc.fileSize / 1024).toFixed(2)} KB • {doc.mimeType}
                                </p>
                              </div>
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600 transition-colors"
                              >
                                {t.admin.dashboard.view}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Show documents without type (legacy) */}
                  {(() => {
                    const untypedDocs = selectedSession.documents.filter((doc: any) => !doc.documentType);
                    if (untypedDocs.length === 0) return null;
                    
                    return (
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium text-slate-900">{t.admin?.dashboard?.otherDocuments || 'Other Documents'}</p>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            Legacy
                          </span>
                        </div>
                        <div className="space-y-2 ml-2">
                          {untypedDocs.map((doc: any) => (
                            <div key={doc.id} className="bg-white p-2 rounded-lg flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-700">{doc.fileName}</p>
                                <p className="text-xs text-slate-500">
                                  {(doc.fileSize / 1024).toFixed(2)} KB • {doc.mimeType}
                                </p>
                              </div>
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600 transition-colors"
                              >
                                {t.admin.dashboard.view}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* CAD Data */}
              {selectedSession.cadData && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3 text-lg">{t.admin.dashboard.cadAnalysisData}</h4>
                  
                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                      <p className="text-xs text-blue-600 font-medium mb-1">{t.admin.dashboard.siteArea}</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {selectedSession.cadData.siteArea
                          ? selectedSession.cadData.siteArea.toFixed(2)
                          : '-'}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">m²</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                      <p className="text-xs text-green-600 font-medium mb-1">{t.admin.dashboard.buildingArea}</p>
                      <p className="text-2xl font-bold text-green-900">
                        {selectedSession.cadData.buildingArea
                          ? selectedSession.cadData.buildingArea.toFixed(2)
                          : '-'}
                      </p>
                      <p className="text-xs text-green-600 mt-1">m²</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                      <p className="text-xs text-purple-600 font-medium mb-1">{t.admin.dashboard.floorArea}</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {selectedSession.cadData.floorArea
                          ? selectedSession.cadData.floorArea.toFixed(2)
                          : '-'}
                      </p>
                      <p className="text-xs text-purple-600 mt-1">m²</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-xl border border-indigo-200">
                      <p className="text-xs text-indigo-600 font-medium mb-1">{t.admin?.dashboard?.numFloors || 'Number of Floors'}</p>
                      <p className="text-2xl font-bold text-indigo-900">
                        {selectedSession.cadData.numFloors ?? '-'}
                      </p>
                      <p className="text-xs text-indigo-600 mt-1">{t.admin?.dashboard?.floors || 'floors'}</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-4 rounded-xl border border-cyan-200">
                      <p className="text-xs text-cyan-600 font-medium mb-1">{t.admin?.dashboard?.buildingHeight || 'Building Height'}</p>
                      <p className="text-2xl font-bold text-cyan-900">
                        {selectedSession.cadData.buildingHeight
                          ? selectedSession.cadData.buildingHeight.toFixed(2)
                          : '-'}
                      </p>
                      <p className="text-xs text-cyan-600 mt-1">m</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
                      <p className="text-xs text-orange-600 font-medium mb-1">{t.admin.dashboard.bcrFull}</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {selectedSession.cadData.bcr ? selectedSession.cadData.bcr.toFixed(2) : '-'}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">%</p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-4 rounded-xl border border-pink-200">
                      <p className="text-xs text-pink-600 font-medium mb-1">{t.admin.dashboard.farFull}</p>
                      <p className="text-2xl font-bold text-pink-900">
                        {selectedSession.cadData.far ? selectedSession.cadData.far.toFixed(2) : '-'}
                      </p>
                      <p className="text-xs text-pink-600 mt-1">{t.admin.dashboard.ratio}</p>
                    </div>
                  </div>

                  {/* DXF File Viewer */}
                  {selectedSession.cadData.dxfFileUrl && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-slate-700">{t.admin.dashboard.dxfFile}</p>
                        <div className="flex gap-2">
                          <a
                            href={selectedSession.cadData.dxfFileUrl}
                            download
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {t.admin.dashboard.download}
                          </a>
                          <Link
                            href={`/admin/cad-viewer/${selectedSession.id}`}
                            target="_blank"
                            className="px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {t.admin.dashboard.openViewer}
                          </Link>
                        </div>
                      </div>
                      
                      {/* DXF File Info */}
                      <div className="bg-white p-4 rounded-lg border border-slate-300">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{t.admin.dashboard.cadDrawingFile}</p>
                            <p className="text-xs text-slate-500">{t.admin.dashboard.dxfFormat}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Infrastructure Data */}
              {selectedSession.infrastructureData && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">{t.admin.dashboard.infrastructureData}</h4>
                  <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl mb-3">
                    <div>
                      <p className="text-sm text-slate-600">{t.admin.dashboard.latitude}</p>
                      <p className="font-semibold">
                        {selectedSession.infrastructureData.latitude || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">{t.admin.dashboard.longitude}</p>
                      <p className="font-semibold">
                        {selectedSession.infrastructureData.longitude || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">{t.admin.dashboard.radius}</p>
                      <p className="font-semibold">
                        {selectedSession.infrastructureData.radius
                          ? `${selectedSession.infrastructureData.radius} m`
                          : '-'}
                      </p>
                    </div>
                  </div>
                  
                  {selectedSession.infrastructureData.labeledFeatures && 
                   Array.isArray(selectedSession.infrastructureData.labeledFeatures) && 
                   selectedSession.infrastructureData.labeledFeatures.length > 0 && (
                    <>
                      <div className="bg-slate-50 p-4 rounded-xl mb-4">
                        <p className="text-sm text-slate-600 mb-3 font-semibold">{t.admin.dashboard.labeledFeatures} ({selectedSession.infrastructureData.labeledFeatures.length})</p>
                        <div className="space-y-2">
                          {selectedSession.infrastructureData.labeledFeatures.map((feature: any, idx: number) => {
                            const getTypeColor = (type: string) => {
                              const colors: Record<string, string> = {
                                'Hospital': 'bg-red-50 border-red-200 text-red-700',
                                'School': 'bg-amber-50 border-amber-200 text-amber-700',
                                'Residential Housing': 'bg-green-50 border-green-200 text-green-700',
                                'River': 'bg-cyan-50 border-cyan-200 text-cyan-700',
                                'Lake': 'bg-blue-50 border-blue-200 text-blue-700',
                                'Office': 'bg-purple-50 border-purple-200 text-purple-700',
                                'Others': 'bg-teal-50 border-teal-200 text-teal-700',
                              };
                              return colors[type] || 'bg-teal-50 border-teal-200 text-teal-700';
                            };

                            const displayType = feature.customType || feature.type;
                            return (
                              <div key={idx} className={`px-3 py-2 rounded-lg border ${getTypeColor(feature.type)} flex items-center justify-between`}>
                                <div>
                                  <span className="font-semibold text-sm">{displayType}</span>
                                </div>
                                <div className="text-xs opacity-75 ml-4">
                                  <span className="font-mono">{feature.lat?.toFixed(6)}, {feature.lon?.toFixed(6)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Map Viewer */}
                      {selectedSession.infrastructureData.latitude && 
                       selectedSession.infrastructureData.longitude && (
                        <div className="bg-slate-50 p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-slate-600 font-semibold">{t.admin.dashboard.mapView}</p>
                            <button
                              onClick={() => setMapKey(prev => prev + 1)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {t.admin.dashboard.refreshMap}
                            </button>
                          </div>
                          <div style={{ height: '400px' }} className="rounded-lg overflow-hidden border-2 border-slate-300 relative z-0">
                            <SessionMap
                              key={selectedSession.id + '-' + mapKey}
                              infrastructureData={selectedSession.infrastructureData}
                            />
                          </div>

                          {/* Legend */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(TYPE_COLORS).map(([type, colors]) => {
                              const hasType = selectedSession.infrastructureData.labeledFeatures.some(
                                (f: any) => f.type === type
                              );
                              if (!hasType) return null;
                              
                              return (
                                <div key={type} className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-4 rounded-full border-2" 
                                    style={{ 
                                      backgroundColor: colors.fillColor,
                                      borderColor: colors.color
                                    }}
                                  />
                                  <span className="text-xs text-slate-700">{type}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* OCR Data */}
              {selectedSession.ocrData.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    {t.admin.dashboard.ocrRecords} ({selectedSession.ocrData.length})
                  </h4>
                  <div className="space-y-4">
                    {/* Group OCR data by document type */}
                    {Object.entries(DOCUMENT_TYPES).map(([typeId, typeConfig]) => {
                      const ocrOfType = selectedSession.ocrData.filter((ocr: any) => ocr.documentType === typeId);
                      
                      if (ocrOfType.length === 0) return null;
                      
                      return (
                        <div key={typeId} className="bg-slate-50 p-3 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-slate-900">{typeConfig.label}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${typeConfig.badgeColor}`}>
                              {typeConfig.badge}
                            </span>
                          </div>
                          <div className="space-y-2 ml-2">
                            {ocrOfType.map((ocr: any) => (
                              <div key={ocr.id} className="bg-white p-2 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium text-slate-700">{ocr.fileName}</p>
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                    {ocr.engine}
                                  </span>
                                </div>
                                {ocr.extractedText && (
                                  <p className="text-xs text-slate-600 line-clamp-2">{ocr.extractedText}</p>
                                )}
                                {ocr.fileUrl && (
                                  <a
                                    href={ocr.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                                  >
                                    {t.admin.dashboard.viewFile}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Show OCR without type (legacy) */}
                    {(() => {
                      const untypedOcr = selectedSession.ocrData.filter((ocr: any) => !ocr.documentType);
                      if (untypedOcr.length === 0) return null;
                      
                      return (
                        <div className="bg-slate-50 p-3 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-slate-900">{t.admin?.dashboard?.otherDocuments || 'Other Documents'}</p>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                              Legacy
                            </span>
                          </div>
                          <div className="space-y-2 ml-2">
                            {untypedOcr.map((ocr: any) => (
                              <div key={ocr.id} className="bg-white p-2 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium text-slate-700">{ocr.fileName}</p>
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                    {ocr.engine}
                                  </span>
                                </div>
                                {ocr.extractedText && (
                                  <p className="text-xs text-slate-600 line-clamp-2">{ocr.extractedText}</p>
                                )}
                                {ocr.fileUrl && (
                                  <a
                                    href={ocr.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                                  >
                                    {t.admin.dashboard.viewFile}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
