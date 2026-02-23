import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="max-w-xl w-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-8 text-center">
        <div className="text-xs text-white/60 tracking-[0.35em]">404</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Page not found</h1>
        <p className="mt-3 text-white/65">
          The page you’re looking for doesn’t exist. Use the navigation or go back home.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 glow px-5 py-3 text-sm font-medium transition text-white"
          >
            Home
          </Link>
          <Link
            href="/images"
            className="rounded-2xl border border-white/10 bg-black/20 hover:bg-white/10 px-5 py-3 text-sm font-medium text-white/85 transition"
          >
            Images
          </Link>
          <Link
            href="/videos"
            className="rounded-2xl border border-white/10 bg-black/20 hover:bg-white/10 px-5 py-3 text-sm font-medium text-white/85 transition"
          >
            Videos
          </Link>
        </div>
      </div>
    </main>
  );
}