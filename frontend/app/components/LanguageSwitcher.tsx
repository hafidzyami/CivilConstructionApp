'use client';

import { useLanguage, Language } from '../i18n';

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as Language);
  };

  return (
    <div className="flex items-center gap-2">
      <svg 
        className="w-5 h-5 text-slate-600" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" 
        />
      </svg>
      <select
        value={language}
        onChange={handleChange}
        className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        aria-label={t.language.title}
      >
        <option value="en">{t.language.english}</option>
        <option value="ko">{t.language.korean}</option>
      </select>
    </div>
  );
}
