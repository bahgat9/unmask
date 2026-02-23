"use client";

import Image from "next/image";
import { BadgeCheck, Github, Linkedin } from "lucide-react";
import React, { useMemo, useState } from "react";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

type Social = {
  github?: string;
  linkedin?: string;
};

export default function PersonCard({
  name,
  role,
  org,
  img,
  socials,
  badge,
}: {
  name: string;
  role: string;
  org: string;
  img?: string;
  socials?: Social;
  badge?: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const fallback = useMemo(() => initials(name), [name]);

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl glow">
      {/* Hover shimmer */}
      <div className="pointer-events-none absolute -inset-24 opacity-0 group-hover:opacity-100 transition duration-500">
        <div className="absolute inset-0 rotate-12 bg-gradient-to-r from-white/0 via-white/10 to-white/0 blur-3xl" />
      </div>

      <div className="relative p-6">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {/* Always-visible initials fallback */}
            <div className="absolute inset-0 grid place-items-center text-white/70 font-semibold tracking-widest">
              {fallback}
            </div>

            {/* Render image only if provided AND still ok */}
            {img && imgOk && (
              <Image
                src={img}
                alt={name}
                fill
                sizes="64px"
                className={`object-cover transition-opacity duration-500 ${
                  loaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setLoaded(true)}
                onError={() => {
                  setImgOk(false);
                  setLoaded(false);
                }}
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold truncate">{name}</div>
              {badge ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/70">
                  <BadgeCheck size={12} className="text-white/60" />
                  {badge}
                </span>
              ) : null}
            </div>
            <div className="text-sm text-white/70">{role}</div>
            <div className="text-xs text-white/55 mt-1">{org}</div>
          </div>
        </div>

        {/* Reveal panel */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <div className="p-4">
            <div className="text-xs text-white/60 tracking-[0.35em]">PROFILE</div>
            <div className="mt-2 text-sm text-white/70 leading-relaxed">
              {role}. Affiliated with{" "}
              <span className="text-white/85 font-semibold">{org}</span>.
            </div>

            {(socials?.github || socials?.linkedin) && (
              <div className="mt-4 flex items-center gap-3">
                {socials.github && (
                  <a
                    href={socials.github}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 transition"
                  >
                    <Github size={16} />
                    GitHub
                  </a>
                )}
                {socials.linkedin && (
                  <a
                    href={socials.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 transition"
                  >
                    <Linkedin size={16} />
                    LinkedIn
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-black/20 px-4 py-2 text-[11px] text-white/55">
            Hover to reveal • initials fallback if photo missing
          </div>
        </div>
      </div>

      <div className="absolute left-6 right-6 bottom-0 h-[2px] bg-gradient-to-r from-white/0 via-white/40 to-white/0 opacity-0 group-hover:opacity-100 transition duration-500" />
    </div>
  );
}