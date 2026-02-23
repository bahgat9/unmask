export default function Loading() {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-8 text-center">
          <div className="text-xs text-white/60 tracking-[0.35em]">UNMASK</div>
          <div className="mt-2 text-2xl font-semibold text-white">Booting Console…</div>
          <div className="mt-4 h-2 w-72 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/3 bg-white/60 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }