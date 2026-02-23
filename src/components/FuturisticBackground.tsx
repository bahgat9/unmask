"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Load Particles only after initial paint (prevents long "site loading")
const Particles = dynamic(() => import("react-particles"), { ssr: false });
const loadSlim = async () => {
  const mod = await import("tsparticles-slim");
  return mod.loadSlim;
};

export default function FuturisticBackground() {
  const [enableParticles, setEnableParticles] = useState(false);

  useEffect(() => {
    // Delay particles so page loads instantly
    const t = setTimeout(() => setEnableParticles(true), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* soft gradients */}
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-35"
        style={{ background: "radial-gradient(circle, rgba(0,210,255,.22), transparent 60%)" }}
      />
      <div
        className="absolute -bottom-48 left-1/3 h-[620px] w-[620px] -translate-x-1/2 rounded-full blur-3xl opacity-28"
        style={{ background: "radial-gradient(circle, rgba(255,0,80,.18), transparent 60%)" }}
      />

      {/* grid */}
      <div className="absolute inset-0 bg-grid opacity-55" />
      <div className="absolute inset-0 scanlines noise" />

      {/* particles (delayed + reduced) */}
      {enableParticles && (
        <Particles
          id="tsparticles"
          init={async (engine: any) => {
            const slim = await loadSlim();
            await slim(engine);
          }}
          options={{
            fpsLimit: 60,
            particles: {
              number: { value: 28, density: { enable: true, area: 1000 } }, // reduced
              color: { value: ["#ffffff", "#00d2ff", "#ff0050"] },
              opacity: { value: 0.16 },
              size: { value: { min: 1, max: 2 } },
              move: { enable: true, speed: 0.35, outModes: { default: "out" } },
              links: { enable: true, distance: 150, opacity: 0.08, width: 1, color: "#ffffff" },
            },
            detectRetina: true,
          }}
          className="absolute inset-0"
        />
      )}
    </div>
  );
}