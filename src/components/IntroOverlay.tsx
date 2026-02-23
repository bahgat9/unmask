"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

function useTypewriter(text: string, speedMs: number, active: boolean) {
    const [out, setOut] = useState("");
    useEffect(() => {
        if (!active) return;
        setOut("");
        let i = 0;
        const t = setInterval(() => {
            i += 1;
            setOut(text.slice(0, i));
            if (i >= text.length) clearInterval(t);
        }, speedMs);
        return () => clearInterval(t);
    }, [text, speedMs, active]);
    return out;
}

export default function IntroOverlay() {
    const [open, setOpen] = useState(true);
    const [phase, setPhase] = useState<0 | 1 | 2>(0);

    // Total ~10s:
    // phase 0: boot (0-7.5s)
    // phase 1: logo reveal (7.5-10s)
    // phase 2: exit
    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 7500);
        const t2 = setTimeout(() => setPhase(2), 10000);
        const t3 = setTimeout(() => setOpen(false), 10800);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, []);

    const bootLines = useMemo(
        () => [
            "BOOT: UNMASK CONSOLE v1.0",
            "INIT: Loading Detection Engine...",
            "INIT: Calibrating Frequency Analyzer...",
            "SEC: Verifying Integrity...",
            "SYS: Linking Video Analytics Module...",
            "AI: Warming up MoE Gate...",
            "READY: Upload media to start scanning.",
        ],
        []
    );

    const typed = useTypewriter(
        bootLines.join("\n"),
        22,
        open && phase === 0
    );

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 bg-black text-white"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.9 } }}
                >
                    {/* Background HUD */}
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-grid opacity-50" />
                        <div className="absolute inset-0 scanlines noise" />
                        {/* soft glows */}
                        <div
                            className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-35"
                            style={{ background: "radial-gradient(circle, rgba(0,210,255,.25), transparent 60%)" }}
                        />
                        <div
                            className="absolute -bottom-48 left-1/3 h-[620px] w-[620px] -translate-x-1/2 rounded-full blur-3xl opacity-30"
                            style={{ background: "radial-gradient(circle, rgba(255,0,80,.22), transparent 60%)" }}
                        />
                    </div>

                    {/* Scanner sweep line */}
                    <motion.div
                        className="absolute left-0 right-0 h-[2px] bg-white/35"
                        initial={{ top: "15%", opacity: 0 }}
                        animate={{ top: ["15%", "85%", "15%"], opacity: [0.0, 0.35, 0.0] }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* Center content */}
                    <div className="relative flex h-full w-full items-center justify-center px-6">
                        {/* Boot phase */}
                        {phase === 0 && (
                            <motion.div
                                className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow p-6 md:p-8"
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7 }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-xs tracking-[0.35em] text-white/60">UNMASK • SYSTEM BOOT</div>
                                    <motion.div
                                        className="text-xs text-white/60"
                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                        transition={{ duration: 1.2, repeat: Infinity }}
                                    >
                                        LIVE
                                    </motion.div>
                                </div>

                                <div className="mt-5 grid gap-6 md:grid-cols-2 md:items-center">
                                    {/* Terminal */}
                                    <div className="relative rounded-2xl border border-white/10 bg-black/35 p-4 overflow-hidden">
                                        <div className="absolute inset-0 scanlines noise pointer-events-none" />
                                        <div className="text-[11px] text-white/50 tracking-[0.3em] mb-2">
                                            TERMINAL OUTPUT
                                        </div>

                                        <pre className="text-sm leading-6 text-white/80 whitespace-pre-wrap font-mono">
                                            {typed}
                                            <motion.span
                                                className="inline-block w-[10px]"
                                                animate={{ opacity: [0, 1, 0] }}
                                                transition={{ duration: 0.9, repeat: Infinity }}
                                            >
                                                ▍
                                            </motion.span>
                                        </pre>
                                    </div>

                                    {/* Progress + rings */}
                                    <div className="relative">
                                        <div className="text-sm text-white/70">Initializing modules</div>
                                        <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                                            <motion.div
                                                className="h-full bg-white/60"
                                                initial={{ width: "0%" }}
                                                animate={{ width: "100%" }}
                                                transition={{ duration: 7.2, ease: "easeInOut" }}
                                            />
                                        </div>

                                        <div className="mt-6 flex items-center gap-4">
                                            <motion.div
                                                className="relative h-20 w-20 rounded-full border border-white/15 bg-white/5 overflow-hidden"
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                                            >
                                                <div className="absolute inset-2 rounded-full border border-white/10" />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Image
                                                        src="/brand/unmask.png"
                                                        alt="UNMASK"
                                                        width={52}
                                                        height={52}
                                                        className="h-[42px] w-auto object-contain opacity-90"
                                                    />
                                                </div>
                                            </motion.div>

                                            <div className="text-xs text-white/60 leading-5">
                                                <div>• Frequency expert online</div>
                                                <div>• Spatial expert online</div>
                                                <div>• Gate calibrated</div>
                                            </div>
                                        </div>

                                        <motion.div
                                            className="mt-6 text-xs text-white/55 tracking-[0.25em]"
                                            animate={{ opacity: [0.35, 1, 0.35] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        >
                                            DO NOT TRUST WHAT YOU SEE.
                                        </motion.div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Logo reveal phase */}
                        {phase === 1 && (
                            <motion.div
                                className="flex flex-col items-center gap-5"
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.9 }}
                            >
                                <motion.div
                                    className="relative rounded-[32px] border border-white/12 bg-white/5 backdrop-blur-xl glow px-8 py-8"
                                    animate={{
                                        boxShadow: [
                                            "0 0 0 1px rgba(255,255,255,0.08), 0 0 24px rgba(0,210,255,0.08), 0 0 70px rgba(255,0,80,0.06)",
                                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 34px rgba(255,0,80,0.10), 0 0 90px rgba(0,210,255,0.06)",
                                        ],
                                    }}
                                    transition={{ duration: 1.2, repeat: Infinity, repeatType: "mirror" }}
                                >
                                    {/* ✅ BIG logo that fits (no cropping) */}
                                    <Image
                                        src="/brand/unmask.png"
                                        alt="UNMASK"
                                        width={360}
                                        height={220}
                                        className="h-auto w-[260px] md:w-[360px] object-contain"
                                        priority
                                    />
                                </motion.div>

                                <motion.div
                                    className="text-center"
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.15 }}
                                >
                                    <div className="text-3xl md:text-4xl font-semibold tracking-widest">
                                        UNMASK DETECTOR
                                    </div>
                                    <div className="mt-2 text-white/60 text-xs md:text-sm tracking-[0.35em]">
                                        FUTURISTIC MEDIA AUTHENTICITY CONSOLE
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}