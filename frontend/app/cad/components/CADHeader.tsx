'use client';

import Link from 'next/link';
import { AppStep } from '../types';
import { useLanguage } from '../../i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher';

interface CADHeaderProps {
  step: AppStep;
  onReset: () => void;
}

export default function CADHeader({ step, onReset }: CADHeaderProps) {
  const { t } = useLanguage();
  
  return (
    <div className="flex items-center justify-between mb-6 shrink-0">
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-slate-600 hover:text-slate-900 transition-colors mb-2 text-sm"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t.common.backToHome}
        </Link>
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-red-600">
          {t.cad.title}
        </h1>
        {step !== 'analyze' && (
          <p className="text-xl text-slate-600 mt-2">
            {t.cad.subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <LanguageSwitcher />
        {step === 'analyze' && (
          <button
            onClick={onReset}
            className="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm font-medium"
          >
            {t.cad.resetAnalysis}
          </button>
        )}
      </div>
    </div>
  );
}