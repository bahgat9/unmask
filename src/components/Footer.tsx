import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-10 grid gap-6 md:grid-cols-3">
        <div>
          <div className="text-sm font-semibold tracking-widest">UNMASK</div>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">
            A futuristic AI-based framework for detecting AI-generated images and deepfake videos.
          </p>
        </div>

        <div>
          <div className="text-xs text-white/60 tracking-[0.35em]">PAGES</div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link className="text-white/70 hover:text-white transition" href="/">Home</Link>
            <Link className="text-white/70 hover:text-white transition" href="/images">Images</Link>
            <Link className="text-white/70 hover:text-white transition" href="/videos">Videos</Link>
            <Link className="text-white/70 hover:text-white transition" href="/reports">Reports</Link>
          </div>
        </div>

        <div>
          <div className="text-xs text-white/60 tracking-[0.35em]">ACADEMIC</div>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">
            MSA University — Faculty of Computer Science<br />
            Supervised by Prof. Tamer Nassef &amp; Dr. Eman Abo Elhamd<br />
            TA Supervisor: Dr. Farah Darwish
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-8 text-xs text-white/45">
        © {new Date().getFullYear()} UNMASK Detector — MSA University.
      </div>
    </footer>
  );
}