export function Topbar({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 bg-white/60 supports-[backdrop-filter]:bg-white/50 backdrop-blur-2xl border-b border-white/60 px-6 py-3 flex items-center justify-between shadow-[0_1px_20px_-12px_rgba(15,23,42,0.25)]">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
