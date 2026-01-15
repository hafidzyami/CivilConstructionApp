import { MetricsData } from '../types';

export default function CADMetrics({ metrics }: { metrics: MetricsData }) {
  return (
    <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-8 shadow-lg border border-slate-700 text-white flex flex-col justify-between relative overflow-hidden h-full">
      {/* Background Gradient Effect */}
      <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none"></div>
      
      {/* Top Row: Areas */}
      <div className="grid grid-cols-3 gap-8 relative z-10 mb-8 border-b border-slate-800 pb-8">
        <div>
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Site Area</div>
          <div className="text-4xl font-mono text-cyan-400 truncate" title={`${metrics.siteArea} m²`}>
            {metrics.siteArea.toFixed(1)} <span className="text-lg opacity-50 font-sans">m²</span>
          </div>
        </div>
        
        <div>
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Building Area</div>
          <div className="text-4xl font-mono text-orange-400 truncate" title={`${metrics.footprintArea} m²`}>
            {metrics.footprintArea.toFixed(1)} <span className="text-lg opacity-50 font-sans">m²</span>
          </div>
        </div>

        <div>
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Total Floor</div>
          <div className="text-4xl font-mono text-white truncate" title={`${metrics.totalFloorArea} m²`}>
            {metrics.totalFloorArea.toFixed(1)} <span className="text-lg opacity-50 font-sans">m²</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Ratios (Standardized to %) */}
      <div className="grid grid-cols-2 gap-8 relative z-10">
        <div>
          <div className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-1">
            BCR <span className="text-[10px] opacity-60 font-normal normal-case">(Building Coverage)</span>
          </div>
          <div className="text-5xl font-bold text-white tracking-tight">
            {metrics.bcr.toFixed(1)}<span className="text-2xl text-orange-500 ml-1">%</span>
          </div>
        </div>
        
        <div>
          <div className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-1">
            FAR <span className="text-[10px] opacity-60 font-normal normal-case">(Floor Area Ratio)</span>
          </div>
          <div className="text-5xl font-bold text-white tracking-tight">
            {/* Standardized FAR to Percentage */}
            {(metrics.far * 100).toFixed(1)}<span className="text-2xl text-orange-500 ml-1">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}