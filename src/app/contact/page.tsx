import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-4xl px-6 pt-10 pb-16">
        <div className="text-xs text-white/60 tracking-[0.35em]">CONTACT</div>
        <h1 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight">
          Get in touch with <span className="text-white/70">UNMASK</span>
        </h1>

        <p className="mt-4 text-white/65 leading-relaxed">
          For academic collaboration, demos, or questions about the UNMASK project,
          you can contact the team at MSA University.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
            <div className="text-xs text-white/60 tracking-[0.35em]">EMAIL</div>
            <div className="mt-2 text-lg font-semibold">Project Team</div>
            <p className="mt-2 text-sm text-white/65">
              Add your official email here (MSA / project email).
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
              unmask.team@domain.com
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
            <div className="text-xs text-white/60 tracking-[0.35em]">LOCATION</div>
            <div className="mt-2 text-lg font-semibold">MSA University</div>
            <p className="mt-2 text-sm text-white/65">
              Faculty of Computer Science — Graduation Project.
            </p>

            <div className="mt-4 flex gap-3">
              <Link
                href="/"
                className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 glow px-4 py-2 text-sm font-medium transition"
              >
                Back to Home
              </Link>
              <Link
                href="/images"
                className="rounded-2xl border border-white/10 bg-black/20 hover:bg-white/10 px-4 py-2 text-sm font-medium text-white/85 transition"
              >
                Try Images
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
          <div className="text-xs text-white/60 tracking-[0.35em]">NOTE</div>
          <div className="mt-2 text-sm text-white/65">
            UNMASK outputs are probabilistic indicators and should be used responsibly.
          </div>
        </div>
      </section>
    </main>
  );
}