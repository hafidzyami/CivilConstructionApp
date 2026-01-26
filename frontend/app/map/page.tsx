'use client';

import dynamic from 'next/dynamic';
import { useLanguage } from '../i18n';

// Dynamic import untuk seluruh component untuk avoid SSR
const MapComponent = dynamic(() => import('./MapComponent'), {
  ssr: false,
  loading: () => <MapLoadingComponent />,
});

function MapLoadingComponent() {
  const { t } = useLanguage();
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">{t.common.loadingMap}</p>
      </div>
    </div>
  );
}

export default function MapPage() {
  return <MapComponent />;
}
