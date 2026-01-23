interface MetricsData {
  siteArea: number;
  footprintArea: number;
  totalFloorArea: number;
  bcr: number;
  far: number;
}

export default function CADMetrics({ metrics }: { metrics: MetricsData }) {
  return (
    <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-700 text-white flex items-center relative overflow-hidden h-full min-h-[140px]">
      <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none"></div>
      
      <div className="grid grid-cols-5 gap-4 w-full relative z-10 items-center text-center">
        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Site Area</div>
          <div className="text-2xl xl:text-3xl font-mono text-cyan-400 truncate">
            {metrics.siteArea.toFixed(0)}<span className="text-sm opacity-50 ml-1">m²</span>
          </div>
        </div>
        
        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Building</div>
          <div className="text-2xl xl:text-3xl font-mono text-orange-400 truncate">
            {metrics.footprintArea.toFixed(0)}<span className="text-sm opacity-50 ml-1">m²</span>
          </div>
        </div>

        <div className="border-r border-slate-700/50">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Floor</div>
          <div className="text-2xl xl:text-3xl font-mono text-white truncate">
            {metrics.totalFloorArea.toFixed(0)}<span className="text-sm opacity-50 ml-1">m²</span>
          </div>
        </div>

        <div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">BCR</div>
          <div className="text-3xl xl:text-4xl font-bold text-white tracking-tight">
            {metrics.bcr.toFixed(0)}<span className="text-lg text-orange-500 ml-0.5">%</span>
          </div>
        </div>
        
        <div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">FAR</div>
          <div className="text-3xl xl:text-4xl font-bold text-white tracking-tight">
            {(metrics.far * 100).toFixed(0)}<span className="text-lg text-orange-500 ml-0.5">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
