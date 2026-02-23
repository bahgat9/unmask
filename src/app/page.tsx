import Link from "next/link";
import { GraduationCap } from "lucide-react";
import PersonCard from "@/components/PersonCard";

function FeatureCard({ t, d }: { t: string; d: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
      <div className="text-xs text-white/60 tracking-[0.35em]">FEATURE</div>
      <div className="mt-2 text-lg font-semibold">{t}</div>
      <div className="mt-2 text-sm text-white/65">{d}</div>
    </div>
  );
}

function StepCard({
  step,
  title,
  desc,
}: {
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-5">
      <div className="text-xs text-white/60 tracking-[0.35em]">STEP {step}</div>
      <div className="mt-2 text-lg font-semibold">{title}</div>
      <div className="mt-2 text-sm text-white/65">{desc}</div>
    </div>
  );
}

function InfoCard({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
      <div className="text-xs text-white/60 tracking-[0.35em]">{tag}</div>
      <div className="mt-2 text-lg font-semibold">{title}</div>
      <div className="mt-3 text-sm text-white/70 leading-relaxed">{children}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* HERO */}
      <section className="mx-auto max-w-7xl px-6 pt-10 pb-16">
        <div className="text-xs text-white/60 tracking-[0.35em]">UNMASK PROJECT</div>
        <h1 className="mt-3 text-4xl md:text-6xl font-semibold leading-tight">
          UNMASK <span className="text-white/70">Detector</span>
          <br />
          Futuristic Deepfake Detection for Images & Videos
        </h1>

        <p className="mt-5 max-w-3xl text-white/65 leading-relaxed">
          UNMASK is an AI-based hybrid framework for detecting AI-generated content
          in both images and videos. The system combines spatial feature analysis
          with frequency-domain cues using a gated mixture-of-experts (MoE) model,
          delivering an interactive detection experience with confidence scores and
          per-frame video analytics.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/images"
            className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 glow px-5 py-3 text-sm font-medium transition"
          >
            Start Image Detection
          </Link>
          <Link
            href="/videos"
            className="rounded-2xl border border-white/10 bg-black/20 hover:bg-white/10 px-5 py-3 text-sm font-medium text-white/85 transition"
          >
            Start Video Analytics
          </Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <FeatureCard
            t="Hybrid MoE Architecture"
            d="Spatial + Frequency experts with a learned gating module for robust detection."
          />
          <FeatureCard
            t="Video Per-Frame Analysis"
            d="Uniform sampling and per-frame predictions with top suspicious frames surfaced."
          />
          <FeatureCard
            t="Modern Futuristic UX"
            d="Glass HUD design, scanning animations, and interactive feedback during inference."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className="text-xs text-white/60 tracking-[0.35em]">HOW IT WORKS</div>
        <h2 className="mt-2 text-2xl font-semibold">Detection Pipeline</h2>
        <p className="mt-2 text-sm text-white/65 max-w-3xl">
          UNMASK analyzes media using two experts (Spatial + Frequency) and a gating
          network that fuses their decisions into a final verdict with confidence.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <StepCard step="01" title="Upload" desc="Select an image or video to analyze." />
          <StepCard step="02" title="Preprocess" desc="Resize & normalize. For videos: uniform frame sampling." />
          <StepCard step="03" title="Spatial Expert" desc="ConvNeXt-Tiny learns visual manipulation artifacts." />
          <StepCard step="04" title="Frequency Expert" desc="FFT magnitude map + ResNet18 detects spectral inconsistencies." />
          <StepCard step="05" title="Gate + Verdict" desc="MoE gate fuses experts → Real/Fake + confidence." />
        </div>
      </section>

      {/* MODEL */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className="text-xs text-white/60 tracking-[0.35em]">MODEL</div>
        <h2 className="mt-2 text-2xl font-semibold">Architecture & Training</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <InfoCard tag="ARCHITECTURE" title="Gated Mixture-of-Experts (MoE)">
            <ul className="list-disc pl-5 leading-7">
              <li>
                <b>Spatial Expert:</b> ConvNeXt-Tiny (captures pixel-level artifacts and synthesis traces).
              </li>
              <li>
                <b>Frequency Expert:</b> FFT magnitude map + ResNet18 (captures frequency-domain anomalies).
              </li>
              <li>
                <b>Gating Network:</b> learns how much to trust each expert per sample, improving robustness.
              </li>
            </ul>
          </InfoCard>

          <InfoCard tag="DATA & METRICS" title="Academic-grade evaluation">
            <p>
              We will finalize dataset names and metrics once the final experiments are locked in.
              This section will include Balanced Accuracy, Macro-F1, and validation performance.
            </p>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/55 tracking-[0.35em]">PLACEHOLDER</div>
              <div className="mt-2 text-sm text-white/75">BalAcc: __% • MacroF1: __ • ValAcc: __%</div>
            </div>
          </InfoCard>
        </div>
      </section>

      {/* ETHICS */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="text-xs text-white/60 tracking-[0.35em]">LIMITATIONS & ETHICS</div>
        <h2 className="mt-2 text-2xl font-semibold">Responsible Use</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { t: "Not a Legal Proof", d: "Predictions are probabilistic signals, not final legal evidence." },
            { t: "Deepfakes Evolve", d: "New generation methods may require re-training and continuous evaluation." },
            { t: "Privacy First", d: "Only analyze content you have permission to use; avoid misuse of sensitive data." },
          ].map((x) => (
            <div key={x.t} className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
              <div className="text-lg font-semibold">{x.t}</div>
              <div className="mt-2 text-sm text-white/65">{x.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Developers */}
      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="text-xs text-white/60 tracking-[0.35em]">DEVELOPERS</div>
        <h2 className="mt-2 text-2xl font-semibold">Built by</h2>
        <p className="mt-2 text-sm text-white/65">
          Students at <span className="text-white/85 font-semibold">MSA University</span> — Faculty of Computer Science.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <PersonCard
            name="Bahgat Yasser"
            role="Developer • Deepfake Detection System"
            org="MSA University — Faculty of Computer Science"
            img="/team/Bahgat Yasser.jpg"
            badge="Student"
            socials={{
              // github: "https://github.com/USERNAME",
              // linkedin: "https://www.linkedin.com/in/USERNAME/",
            }}
          />
          <PersonCard
            name="Awad Sameh"
            role="Developer • Deepfake Detection System"
            org="MSA University — Faculty of Computer Science"
            img="/team/Awad Sameh.jpg"
            badge="Student"
            socials={{
              // github: "https://github.com/USERNAME",
              // linkedin: "https://www.linkedin.com/in/USERNAME/",
            }}
          />
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl border border-white/10 bg-black/20 p-2">
              <GraduationCap size={18} className="text-white/70" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/85">Academic Context</div>
              <div className="mt-1 text-sm text-white/65 leading-relaxed">
                UNMASK is developed as a graduation project at MSA University, Faculty of Computer Science,
                focusing on robust detection of AI-generated media with interactive forensic analytics.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Supervision */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="text-xs text-white/60 tracking-[0.35em]">SUPERVISION</div>
        <h2 className="mt-2 text-2xl font-semibold">Academic Supervision</h2>
        <p className="mt-2 text-sm text-white/65">
          All supervisors are affiliated with <span className="text-white/85 font-semibold">MSA University</span>.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PersonCard
            name="Prof. Tamer Nassef"
            role="Project Supervisor"
            org="MSA University"
            img="/team/Tamer Nassef.jpg"
            badge="Supervisor"
          />
          <PersonCard
            name="Dr. Eman Abo Elhamd"
            role="Project Supervisor"
            org="MSA University"
            img="/team/eman.jpg"
            badge="Supervisor"
          />
          <PersonCard
            name="Dr. Farah Darwish"
            role="TA Supervisor"
            org="MSA University"
            img="/team/farah.jpg"
            badge="TA"
          />
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6">
          <div className="text-xs text-white/60 tracking-[0.35em]">COPYRIGHT</div>
          <div className="mt-2 text-sm text-white/65">
            © {new Date().getFullYear()} UNMASK Detector — MSA University.
          </div>
        </div>
      </section>
    </main>
  );
}