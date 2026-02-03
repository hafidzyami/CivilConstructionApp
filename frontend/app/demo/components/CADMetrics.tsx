import { useLanguage } from '../../i18n';

interface MetricsData {
  siteArea: number;
  footprintArea: number;
  totalFloorArea: number;
  bcr: number;
  far: number;
  numFloors?: number | null;
  buildingHeight?: number | null;
}

interface CADMetricsProps {
  metrics: MetricsData;
  parserMode?: 'manual' | 'python' | 'llm';
}

export default function CADMetrics({ metrics, parserMode }: CADMetricsProps) {
  const { t } = useLanguage();
  const isAutoCalculated = parserMode === 'python' || parserMode === 'llm';
  
  return (
    <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-700 text-white flex flex-col relative overflow-hidden h-full min-h-[140px]">
      <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none"></div>
      
      {/* Parser mode indicator */}
      {isAutoCalculated && (
        <div className="absolute top-2 right-2 z-20">
          <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
            parserMode === 'llm' 
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
              : 'bg-green-500/20 text-green-300 border border-green-500/30'
          }`}>
            {parserMode === 'llm' ? `🤖 ${t.demo.cad.metrics.aiCalculated}` : `🐍 ${t.demo.cad.metrics.autoCalculated}`}
          </span>
        </div>
      )}
      
      <div className="grid grid-cols-7 gap-3 w-full relative z-10 items-center text-center flex-1">
        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.siteArea}</div>
          <div className="text-xl xl:text-2xl font-mono text-cyan-400 truncate">
            {metrics.siteArea.toFixed(0)}<span className="text-xs opacity-50 ml-1">m²</span>
          </div>
        </div>
        
        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.building}</div>
          <div className="text-xl xl:text-2xl font-mono text-orange-400 truncate">
            {metrics.footprintArea.toFixed(0)}<span className="text-xs opacity-50 ml-1">m²</span>
          </div>
        </div>

        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.totalFloor}</div>
          <div className="text-xl xl:text-2xl font-mono text-white truncate">
            {metrics.totalFloorArea.toFixed(0)}<span className="text-xs opacity-50 ml-1">m²</span>
          </div>
        </div>

        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.floors}</div>
          <div className="text-xl xl:text-2xl font-mono text-purple-400 truncate">
            {metrics.numFloors ?? '—'}
          </div>
        </div>

        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.height}</div>
          <div className="text-xl xl:text-2xl font-mono text-blue-400 truncate">
            {metrics.buildingHeight ? metrics.buildingHeight.toFixed(1) : '—'}<span className="text-xs opacity-50 ml-1">m</span>
          </div>
        </div>

        <div className="border-r border-slate-700/50">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.bcr}</div>
          <div className="text-2xl xl:text-3xl font-bold text-white tracking-tight">
            {metrics.bcr.toFixed(0)}<span className="text-sm text-orange-500 ml-0.5">%</span>
          </div>
        </div>
        
        <div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{t.demo.cad.metrics.far}</div>
          <div className="text-2xl xl:text-3xl font-bold text-white tracking-tight">
            {(metrics.far).toFixed(0)}<span className="text-sm text-orange-500 ml-0.5">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
