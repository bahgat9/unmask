"use client";

import ApiStatusDot from "@/components/ApiStatusDot";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const items = [
  { label: "Home", href: "/" },
  { label: "Images", href: "/images" },
  { label: "Videos", href: "/videos" },
  { label: "Contact", href: "/contact" },
  { label: "Reports", href: "/reports" },
];

export default function Navbar() {
  const pathname = usePathname();

  // ✅ Reduced Effects Toggle
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("unmask-effects");
    if (saved === "reduced") {
      setReduced(true);
      document.documentElement.classList.add("reduced-effects");
    }
  }, []);

  function toggleEffects() {
    const next = !reduced;
    setReduced(next);

    if (next) {
      document.documentElement.classList.add("reduced-effects");
      localStorage.setItem("unmask-effects", "reduced");
    } else {
      document.documentElement.classList.remove("reduced-effects");
      localStorage.setItem("unmask-effects", "full");
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur-2xl">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        
        {/* LEFT: Logo */}
        <Link href="/" className="flex items-center gap-4 group">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-3 py-2 glow group-hover:scale-[1.02] transition">
            <Image
              src="/brand/unmask.png"
              alt="UNMASK"
              width={170}
              height={60}
              priority
              className="h-[36px] w-auto object-contain"
            />
          </div>

          <div className="hidden md:block leading-tight">
            <div className="font-semibold tracking-widest text-white">
              UNMASK
            </div>
            <div className="text-[11px] text-white/55 tracking-[0.26em]">
              DETECTION CONSOLE
            </div>
          </div>
        </Link>

        {/* CENTER: API Status (Desktop) */}
        <div className="hidden md:flex items-center gap-4">
          <ApiStatusDot />

          {/* Reduced Effects Toggle */}
          {mounted && (
            <button
              onClick={toggleEffects}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition"
            >
              {reduced ? "Effects: Off" : "Effects: On"}
            </button>
          )}
        </div>

        {/* RIGHT: Navigation */}
        <div className="flex items-center gap-2 md:gap-4 text-sm">
          {/* Mobile API dot */}
          <div className="md:hidden">
            <ApiStatusDot />
          </div>

          {/* Mobile Effects toggle */}
          {mounted && (
            <button
              onClick={toggleEffects}
              className="md:hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition"
            >
              {reduced ? "FX Off" : "FX On"}
            </button>
          )}

          {items.map((it) => {
            const active = pathname === it.href;

            return (
              <Link
                key={it.href}
                href={it.href}
                className={`relative rounded-xl px-3 py-2 transition ${
                  active
                    ? "text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <motion.span
                  whileHover={{ y: -1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="inline-block"
                >
                  {it.label}
                </motion.span>

                {active && (
                  <motion.div
                    layoutId="nav-underline"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="absolute left-2 right-2 -bottom-[3px] h-[2px] bg-white"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}