// Shown instantly on every admin navigation (Next streams this while the page's
// server component resolves) — makes page switches feel immediate.
export default function AdminLoading() {
  return (
    <div className="flex-1 overflow-hidden">
      {/* topbar shell */}
      <div className="h-16 border-b border-slate-200/70 bg-white/60 flex items-center px-6">
        <div className="h-5 w-40 rounded-md bg-slate-200 animate-pulse" />
        <div className="ml-auto h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
      </div>
      <div className="p-6 space-y-5">
        {/* stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
              <div className="h-3 w-20 rounded bg-slate-200 animate-pulse" />
              <div className="h-7 w-16 rounded bg-slate-200 animate-pulse mt-3" />
            </div>
          ))}
        </div>
        {/* big card */}
        <div className="h-72 rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
          <div className="mt-4 grid grid-cols-6 gap-2 items-end h-48">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded bg-slate-100 animate-pulse" style={{ height: `${40 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
