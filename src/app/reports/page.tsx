"use client";

import React, { useEffect, useMemo, useState } from "react";

type ReportType = "image" | "video";
type Prediction = "real" | "fake";

type ReportItem = {
  _id: string;
  created_at: string; // ISO
  type: ReportType;
  filename: string;
  prediction: Prediction;
  confidence: number;
  prob_real: number;
  prob_fake: number;

  overall?: Record<string, any>;
  debug?: Record<string, any>;

  // video extras (optional)
  total_frames?: number;
  fps?: number;
  frames_used?: number;
  per_frame?: Array<{
    frame_index: number;
    source_frame: number;
    sampled_at_sec: number | null;
    prediction: Prediction;
    confidence: number;
    prob_real: number;
    prob_fake: number;
    in_topk: boolean;
  }>;
};

function pct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function cls(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export default function ReportsPage() {
  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") || "http://localhost:8000";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [items, setItems] = useState<ReportItem[]>([]);

  const [limit, setLimit] = useState(50);
  const [kind, setKind] = useState<"" | ReportType>("");
  const [pred, setPred] = useState<"" | Prediction>("");
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  async function fetchReports() {
    setLoading(true);
    setErr("");
    try {
      const url = new URL(`${API_BASE}/reports`);
      url.searchParams.set("limit", String(limit));
      if (kind) url.searchParams.set("kind", kind);
      if (pred) url.searchParams.set("pred", pred);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reports");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(id: string) {
    setDetailsLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/reports/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSelected(data.item as ReportItem);
    } catch (e: any) {
      setErr(e?.message || "Failed to load report details");
    } finally {
      setDetailsLoading(false);
    }
  }

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, kind, pred]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => (it.filename || "").toLowerCase().includes(s) || it._id.includes(s));
  }, [items, q]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs text-white/60 tracking-[0.35em]">REPORTS</div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reports</h1>
          <p className="mt-2 text-white/65">
            Review past scans stored in MongoDB (image/video predictions, metadata, and Top-K evidence frames).
          </p>
        </div>

        <button
          onClick={fetchReports}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {/* Controls */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-white/60">Search (filename or id)</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Will_Smith... / report id"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Type</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25"
            >
              <option value="">All</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-white/60">Prediction</label>
            <select
              value={pred}
              onChange={(e) => setPred(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25"
            >
              <option value="">All</option>
              <option value="real">Real</option>
              <option value="fake">Fake</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-white/60">Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}
      </section>

      {/* Table */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm text-white/70">
            {loading ? "Loading…" : `${filtered.length} report(s)`}
          </div>
          <div className="text-xs text-white/50">
            Backend: <span className="text-white/70">{API_BASE}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 text-xs text-white/60">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Filename</th>
                <th className="px-4 py-3">Prediction</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">P(real)</th>
                <th className="px-4 py-3">P(fake)</th>
                <th className="px-4 py-3">Report ID</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-white/60" colSpan={8}>
                    Loading reports…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-white/60" colSpan={8}>
                    No reports found.
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr
                    key={it._id}
                    className="cursor-pointer hover:bg-white/5"
                    onClick={() => openDetails(it._id)}
                    title="Click to view details"
                  >
                    <td className="px-4 py-3 text-white/75">{fmtDate(it.created_at)}</td>

                    <td className="px-4 py-3">
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs">
                        {it.type}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-white/85">{it.filename || "—"}</td>

                    <td className="px-4 py-3">
                      <span
                        className={cls(
                          "rounded-full border px-2 py-1 text-xs",
                          it.prediction === "fake"
                            ? "border-red-400/30 bg-red-500/10 text-red-200"
                            : "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                        )}
                      >
                        {it.prediction}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-white/85">{pct(it.confidence)}</td>
                    <td className="px-4 py-3 text-white/70">{pct(it.prob_real)}</td>
                    <td className="px-4 py-3 text-white/70">{pct(it.prob_fake)}</td>

                    <td className="px-4 py-3 font-mono text-xs text-white/55">
                      {it._id.slice(0, 8)}…{it._id.slice(-6)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Details Modal */}
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <div className="text-xs text-white/55">REPORT DETAILS</div>
                <div className="mt-1 text-lg font-semibold">{selected.filename || "Untitled"}</div>
                <div className="mt-1 text-sm text-white/60">
                  {selected.type} • {fmtDate(selected.created_at)} • id{" "}
                  <span className="font-mono text-xs text-white/70">{selected._id}</span>
                </div>
              </div>

              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {detailsLoading ? (
                <div className="text-sm text-white/60">Loading details…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Prediction</div>
                      <div className="mt-1 text-base font-semibold">{selected.prediction}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Confidence</div>
                      <div className="mt-1 text-base font-semibold">{pct(selected.confidence)}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Probabilities</div>
                      <div className="mt-1 text-sm text-white/75">
                        real: {pct(selected.prob_real)} <br />
                        fake: {pct(selected.prob_fake)}
                      </div>
                    </div>
                  </div>

                  {/* Video extras */}
                  {selected.type === "video" ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Video Summary</div>
                      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="text-sm text-white/75">
                          <div className="text-xs text-white/55">Total frames</div>
                          {selected.total_frames ?? "—"}
                        </div>
                        <div className="text-sm text-white/75">
                          <div className="text-xs text-white/55">FPS</div>
                          {selected.fps ?? "—"}
                        </div>
                        <div className="text-sm text-white/75">
                          <div className="text-xs text-white/55">Frames used</div>
                          {selected.frames_used ?? "—"}
                        </div>
                        <div className="text-sm text-white/75">
                          <div className="text-xs text-white/55">Top-K stored</div>
                          {Array.isArray(selected.per_frame) ? selected.per_frame.length : 0}
                        </div>
                      </div>

                      {Array.isArray(selected.per_frame) && selected.per_frame.length > 0 ? (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="text-white/55">
                              <tr>
                                <th className="py-2 pr-3">Frame</th>
                                <th className="py-2 pr-3">Source frame</th>
                                <th className="py-2 pr-3">Time (s)</th>
                                <th className="py-2 pr-3">Pred</th>
                                <th className="py-2 pr-3">Conf</th>
                                <th className="py-2 pr-3">P(fake)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {selected.per_frame.map((f, idx) => (
                                <tr key={idx} className="text-white/75">
                                  <td className="py-2 pr-3">{f.frame_index}</td>
                                  <td className="py-2 pr-3">{f.source_frame}</td>
                                  <td className="py-2 pr-3">
                                    {f.sampled_at_sec == null ? "—" : f.sampled_at_sec.toFixed(2)}
                                  </td>
                                  <td className="py-2 pr-3">{f.prediction}</td>
                                  <td className="py-2 pr-3">{pct(f.confidence)}</td>
                                  <td className="py-2 pr-3">{pct(f.prob_fake)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-white/60">No Top-K frames stored.</div>
                      )}
                    </div>
                  ) : null}

                  {/* Debug/Overall JSON */}
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Overall</div>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/75">
                        {JSON.stringify(selected.overall ?? {}, null, 2)}
                      </pre>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/55">Debug</div>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/75">
                        {JSON.stringify(selected.debug ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-white/10 p-4 text-xs text-white/45">
              Tip: use filters above to view only image/video or real/fake.
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}