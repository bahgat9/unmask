"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function ApiStatusDot() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    async function ping() {
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        if (!alive) return;
        setOk(res.ok);
      } catch {
        if (!alive) return;
        setOk(false);
      }
    }

    ping();
    const t = setInterval(ping, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const cls =
    ok === null
      ? "bg-white/40"
      : ok
      ? "bg-emerald-400"
      : "bg-rose-400";

  const text =
    ok === null ? "Checking API…" : ok ? "API Online" : "API Offline";

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${cls} shadow`} />
      <span className="hidden md:inline text-xs text-white/60 tracking-wide">
        {text}
      </span>
    </div>
  );
}