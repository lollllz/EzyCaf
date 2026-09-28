export default function DemoBanner() {
  return (
    <div
      className="sticky top-0 z-[60] border-b border-amber-200/80 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-900"
      role="status"
    >
      Demo mode — for real LAN Hub run <code className="rounded bg-amber-100 px-1 font-mono">./start.sh</code>
    </div>
  );
}
