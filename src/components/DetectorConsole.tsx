"use client";

import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UploadCloud,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  X,
  Download,
  ImageIcon,
  Video,
  Activity,
} from "lucide-react";

type SelectedFile = { file: File; url: string };

type ImageResponse = {
  type: "image";
  filename: string;
  prediction: "real" | "fake";
  confidence: number; // 0..1
  prob_real: number;
  prob_fake: number;
};

type VideoFrameRow = {
  frame_index: number;
  source_frame?: number;
  prediction: "real" | "fake";
  confidence: number; // 0..1
  prob_real: number;
  prob_fake: number;
};

type VideoResponse = {
  type: "video";
  filename: string;
  frames_used: number;
  overall: {
    prediction: "real" | "fake";
    confidence: number; // 0..1
    mean_prob_real: number;
    mean_prob_fake: number;
  };
  per_frame: VideoFrameRow[];
};

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function Badge({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/80 backdrop-blur-xl">
      {icon}
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow overflow-hidden">
      <div className="absolute inset-0 scanlines noise pointer-events-none" />
      <div className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/60 tracking-[0.35em]">
              UNMASK CONSOLE
            </div>
            <h2 className="mt-2 text-xl font-semibold">{title}</h2>
            {subtitle && (
              <p className="mt-2 text-sm text-white/65">{subtitle}</p>
            )}
          </div>
          {right}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function GlowButton({
  variant,
  disabled,
  onClick,
  children,
  icon,
}: {
  variant: "primary" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition active:scale-[0.99]";
  const prim =
    "border border-white/10 bg-white/10 hover:bg-white/15 glow text-white";
  const ghost =
    "border border-white/10 bg-black/20 hover:bg-white/10 text-white/80";
  const dis =
    "cursor-not-allowed opacity-50 hover:bg-white/10 active:scale-100";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variant === "primary" ? prim : ghost} ${
        disabled ? dis : ""
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default function DetectorConsole({
  mode,
}: {
  mode: "image" | "video" | "auto";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ✅ API health state
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [prediction, setPrediction] = useState<string>("—");
  const [confidencePct, setConfidencePct] = useState<number>(0);
  const [notes, setNotes] = useState<string>("ارفع ملف واضغط Analyze.");

  const [videoFrames, setVideoFrames] = useState<VideoFrameRow[] | null>(null);
  const [videoSummary, setVideoSummary] = useState<
    VideoResponse["overall"] | null
  >(null);
  const [framesUsed, setFramesUsed] = useState<number | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  const accept =
    mode === "image"
      ? "image/*"
      : mode === "video"
      ? "video/*"
      : "image/*,video/*";

  const isImage = useMemo(
    () => !!selected?.file.type.startsWith("image/"),
    [selected]
  );
  const isVideo = useMemo(
    () => !!selected?.file.type.startsWith("video/"),
    [selected]
  );

  // ✅ periodic health check (no infinite loading)
  React.useEffect(() => {
    let alive = true;

    async function ping() {
      const ok = await checkHealth();
      if (!alive) return;
      setApiOk(ok);
    }

    ping();
    const t = setInterval(ping, 6000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const setFile = (file: File | null) => {
    if (selected?.url) URL.revokeObjectURL(selected.url);

    if (!file) {
      setSelected(null);
      setPrediction("—");
      setConfidencePct(0);
      setNotes("ارفع ملف واضغط Analyze.");
      setVideoFrames(null);
      setVideoSummary(null);
      setFramesUsed(null);
      setStatus("idle");
      setErrorMsg("");
      return;
    }

    const url = URL.createObjectURL(file);
    setSelected({ file, url });

    setPrediction("—");
    setConfidencePct(0);
    setNotes("جاهز للتحليل. اضغط Analyze.");
    setVideoFrames(null);
    setVideoSummary(null);
    setFramesUsed(null);
    setStatus("idle");
    setErrorMsg("");
  };

  const handleBrowse = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (mode === "image" && !file.type.startsWith("image/")) return;
    if (mode === "video" && !file.type.startsWith("video/")) return;
    if (
      mode === "auto" &&
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    )
      return;

    setFile(file);
  };

  const downloadJson = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const analyze = async () => {
    if (!selected) return;

    // ✅ block analyze if backend offline
    if (apiOk === false) {
      setStatus("error");
      setErrorMsg(
        `Backend Offline: cannot reach ${API_BASE}. Start FastAPI and retry.`
      );
      setNotes("Backend غير متاح حالياً.");
      return;
    }

    setStatus("loading");
    setErrorMsg("");
    setPrediction("—");
    setConfidencePct(0);
    setNotes("جاري التحليل... (Scanning)");
    setVideoFrames(null);
    setVideoSummary(null);
    setFramesUsed(null);

    try {
      const form = new FormData();
      form.append("file", selected.file);

      const endpoint = selected.file.type.startsWith("video/")
        ? `${API_BASE}/predict/video?max_frames=32&batch_size=8`
        : `${API_BASE}/predict/image`;

      const res = await fetch(endpoint, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as ImageResponse | VideoResponse;

      if (data.type === "image") {
        setPrediction(data.prediction);
        setConfidencePct(Math.round(data.confidence * 100));
        setNotes(
          `Image ✅ | prob_real=${data.prob_real.toFixed(
            3
          )} | prob_fake=${data.prob_fake.toFixed(3)}`
        );
      } else {
        setPrediction(data.overall.prediction);
        setConfidencePct(Math.round(data.overall.confidence * 100));
        setFramesUsed(data.frames_used);
        setVideoSummary(data.overall);
        setVideoFrames(data.per_frame);
        setNotes(
          `Video ✅ | frames_used=${
            data.frames_used
          } | mean_real=${data.overall.mean_prob_real.toFixed(
            3
          )} | mean_fake=${data.overall.mean_prob_fake.toFixed(3)}`
        );
      }

      setStatus("done");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Backend error. Check FastAPI is running.");
      setNotes("حصل خطأ أثناء التحليل.");
      // ✅ mark API possibly down
      setApiOk(await checkHealth());
    }
  };

  const topSuspicious = useMemo(() => {
    if (!videoFrames) return [];
    return [...videoFrames]
      .sort((a, b) => b.prob_fake - a.prob_fake)
      .slice(0, 5);
  }, [videoFrames]);

  const fakeSeries = useMemo(() => {
    if (!videoFrames) return [];
    return videoFrames.map((f) => f.prob_fake);
  }, [videoFrames]);

  const verdict = prediction === "fake" ? "FAKE" : prediction === "real" ? "REAL" : "—";

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 pt-6 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge icon={<Sparkles size={14} className="text-white/70" />}>
            Futuristic Deepfake Detection
          </Badge>
          <Badge icon={<ShieldCheck size={14} className="text-white/70" />}>
            MoE Gate • Spatial + Frequency
          </Badge>
          <Badge icon={<Activity size={14} className="text-white/70" />}>
            FastAPI • CPU Inference
          </Badge>
        </div>

        {/* ✅ Backend Offline banner (the missing UX piece) */}
        {apiOk === false && (
          <div className="mt-5 rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl glow p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-rose-200">
                  Backend Offline
                </div>
                <div className="text-xs text-white/60 mt-1">
                  FastAPI is not reachable at{" "}
                  <span className="text-white/80">{API_BASE}</span>
                </div>
              </div>
              <button
                onClick={async () => setApiOk(await checkHealth())}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-end">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="text-4xl md:text-5xl font-semibold leading-tight"
            >
              {mode === "image"
                ? "Image Detector"
                : mode === "video"
                ? "Video Analyzer"
                : "Detector Console"}
              <br />
              <span className="text-white/70">UNMASK</span> Engine
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="mt-4 text-white/65 leading-relaxed"
            >
              Upload{" "}
              {mode === "image"
                ? "an image"
                : mode === "video"
                ? "a video"
                : "an image or video"}{" "}
              and get a verdict, confidence score, and video per-frame analytics.
            </motion.p>
          </div>

          <div className="flex flex-wrap justify-start lg:justify-end gap-2">
            <Badge
              icon={
                selected ? (
                  isVideo ? (
                    <Video size={14} />
                  ) : (
                    <ImageIcon size={14} />
                  )
                ) : (
                  <Activity size={14} />
                )
              }
            >
              Mode: {selected ? (isVideo ? "Video" : "Image") : "—"}
            </Badge>
            <Badge icon={<ShieldCheck size={14} />}>Verdict: {verdict}</Badge>
            <Badge icon={<Activity size={14} />}>Confidence: {confidencePct}%</Badge>

            {/* ✅ API status badge inside console */}
            <Badge icon={<Activity size={14} />}>
              API:{" "}
              {apiOk === null ? "Checking…" : apiOk ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <Card
              title="Upload & Scan"
              subtitle="Drag & drop a file, or click to browse."
              right={<Badge icon={<UploadCloud size={14} />}>Drop Zone</Badge>}
            >
              <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) setFile(file);
                  e.currentTarget.value = "";
                }}
              />

              <motion.div
                onClick={handleBrowse}
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.995 }}
                className="relative mt-2 h-64 cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl"
              >
                <div
                  className={[
                    "absolute inset-3 rounded-2xl border-2 border-dashed transition",
                    isDragging ? "border-white/55" : "border-white/20",
                  ].join(" ")}
                />

                <AnimatePresence>
                  {status === "loading" && (
                    <motion.div
                      className="absolute inset-0 z-20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="absolute inset-0 bg-black/50" />
                      <motion.div
                        className="absolute left-0 right-0 h-[2px] bg-white/35"
                        initial={{ top: "15%", opacity: 0 }}
                        animate={{
                          top: ["18%", "82%", "18%"],
                          opacity: [0.0, 0.45, 0.0],
                        }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl glow px-5 py-4 text-center">
                          <div className="text-xs text-white/60 tracking-[0.35em]">
                            SCANNING
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            Analyzing…
                          </div>
                          <div className="mt-2 h-2 w-64 rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                              className="h-full bg-white/60"
                              initial={{ x: "-120%" }}
                              animate={{ x: "220%" }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
                  {!selected ? (
                    <>
                      <motion.div
                        animate={isDragging ? { scale: 1.05 } : { scale: 1 }}
                        className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-2 text-sm text-white/80"
                      >
                        {isDragging ? "Drop it الآن" : "Drop file here"}
                      </motion.div>
                      <div className="mt-4 text-white/55 text-sm">
                        Click to browse • Drag to upload
                      </div>
                      <div className="mt-2 text-xs text-white/50">
                        {mode === "image"
                          ? "Supported: PNG/JPG"
                          : mode === "video"
                          ? "Supported: MP4"
                          : "Supported: PNG/JPG • MP4"}
                      </div>
                    </>
                  ) : (
                    <div className="w-full">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-left">
                          <div className="text-sm font-semibold text-white/90 break-words">
                            {selected.file.name}
                          </div>
                          <div className="mt-1 text-xs text-white/55">
                            {selected.file.type || "unknown"} •{" "}
                            {formatBytes(selected.file.size)}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition"
                        >
                          <X size={14} /> Clear
                        </button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                        {isImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.url}
                            alt="preview"
                            className="h-36 w-full object-cover"
                          />
                        )}
                        {isVideo && (
                          <video
                            src={selected.url}
                            className="h-36 w-full object-cover"
                            controls
                          />
                        )}
                      </div>

                      <div className="mt-3 text-xs text-white/50">
                        Click the box to select another file.
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>

              <div className="mt-5 flex flex-wrap gap-3">
                <GlowButton
                  variant="ghost"
                  onClick={handleBrowse}
                  icon={<UploadCloud size={16} />}
                >
                  Browse
                </GlowButton>

                <GlowButton
                  variant="primary"
                  onClick={analyze}
                  disabled={!selected || status === "loading" || apiOk === false}
                  icon={<Sparkles size={16} />}
                >
                  {status === "loading" ? "Analyzing..." : "Analyze"}
                </GlowButton>

                {videoFrames && (
                  <GlowButton
                    variant="ghost"
                    onClick={() =>
                      downloadJson(
                        {
                          prediction,
                          confidencePct,
                          framesUsed,
                          videoSummary,
                          per_frame: videoFrames,
                        },
                        `unmask_video_report_${Date.now()}.json`
                      )
                    }
                    icon={<Download size={16} />}
                  >
                    Download Report
                  </GlowButton>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <div className="text-xs text-white/55">
                  Backend: <span className="text-white/75">{API_BASE}</span>
                </div>

                {status === "error" && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-rose-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5" />
                      <div className="break-words">{errorMsg}</div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            <Card
              title="Results HUD"
              subtitle="Verdict + confidence. Video mode unlocks per-frame analytics."
              right={
                <Badge icon={<ShieldCheck size={14} />}>
                  Status: {status}
                </Badge>
              }
            >
              <div className="grid gap-4">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs text-white/60 tracking-[0.35em]">
                    PREDICTION
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-widest">
                    {prediction}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs text-white/60 tracking-[0.35em]">
                    CONFIDENCE
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full bg-white/70"
                      initial={{ width: 0 }}
                      animate={{ width: `${confidencePct}%` }}
                      transition={{
                        type: "spring",
                        stiffness: 120,
                        damping: 18,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/55">
                    {confidencePct}%
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs text-white/60 tracking-[0.35em]">
                    NOTES
                  </div>
                  <div className="mt-2 text-sm text-white/70">{notes}</div>
                </div>

                {videoFrames && (
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-white/60 tracking-[0.35em]">
                        VIDEO ANALYTICS
                      </div>
                      <Badge icon={<Video size={14} />}>
                        Frames used: {framesUsed ?? videoFrames.length}
                      </Badge>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-white/55 mb-2">
                        Fake probability per sampled frame
                      </div>
                      <div className="flex h-20 items-end gap-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                        {fakeSeries.map((v, i) => (
                          <div
                            key={i}
                            title={`frame ${i} | fake=${v.toFixed(3)}`}
                            className="flex-1 rounded-sm bg-white/40"
                            style={{
                              height: `${Math.max(
                                3,
                                Math.round(v * 100)
                              )}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-white/55">
                        Top suspicious frames
                      </div>
                      <div className="mt-2 grid gap-2">
                        {topSuspicious.map((f) => (
                          <div
                            key={f.frame_index}
                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
                          >
                            <div className="text-sm text-white/75">
                              Frame{" "}
                              <span className="text-white/90 font-semibold">
                                {typeof f.source_frame === "number"
                                  ? f.source_frame
                                  : f.frame_index}
                              </span>
                              <span className="ml-2 text-xs text-white/50">
                                ({f.prediction})
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-white/90">
                              {(f.prob_fake * 100).toFixed(1)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}