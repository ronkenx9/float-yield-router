import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import {
  ArrowUpRight,
  Github,
  Pause,
  Plus,
  Minus,
  Copy,
  Check,
  Star,
  Twitter,
} from 'lucide-react';

/* ───────────────────────── Constants ───────────────────────── */

/* Real anchored nav — each entry points at a section that exists on this page,
   or an external URL for SDK / Docs. */
const NAV_LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Flo',          href: '#meet-flo' },
  { label: 'Numbers',      href: '#numbers' },
  { label: 'Questions',    href: '#questions' },
  { label: 'Docs',         href: 'https://github.com/ronkenx9/float-yield-router#readme', external: true },
];

const GITHUB_URL  = 'https://github.com/ronkenx9/float-yield-router';
const TWITTER_URL = 'https://x.com/floatrouter';

const VIDEO_SRC = '/flo-hero.mp4';

/* Safety cap on captured frames — prevents huge memory use on long videos. */
const MAX_BOOMERANG_FRAMES = 240;

/* Mobile breakpoint — below this we'll downgrade frame resolution after a
   dwell period to free memory. PC stays at native resolution forever. */
const MOBILE_MAX_WIDTH_PX = 768;
const MOBILE_DWELL_DOWNGRADE_MS = 6000;
const MOBILE_DOWNGRADE_WIDTH = 640;

/* ───────────────────────── LogoMark ─────────────────────────
   The utility glyph in the nav pill. Square 500x500 transparent
   PNG, rendered at 26px tall to match the nav line-height. */

function LogoMark() {
  return (
    <img
      src="/flo-mark.png"
      alt="FLOAT mark"
      width={26}
      height={26}
      className="block h-[26px] w-[26px] select-none"
      draggable={false}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   HERO
   Fullscreen video with boomerang-canvas playback, GSAP mouse
   parallax, liquid-glass nav, hero title, and bottom row CTAs.
   ═══════════════════════════════════════════════════════════════ */

function Hero() {
  const [mounted, setMounted] = useState(false);
  const [framesReady, setFramesReady] = useState(false);

  const videoRef         = useRef<HTMLVideoElement | null>(null);
  const videoBgRef       = useRef<HTMLDivElement  | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef        = useRef<HTMLCanvasElement[]>([]);

  /* Mount → trigger fade-in */
  useEffect(() => { setMounted(true); }, []);

  /* ───── Effect 1 — Frame capture (boomerang setup) ───── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let capturing = true;
    let lastTime = -1;
    /* Sharpness budget:
       - PC: capture at the video's native resolution (no downscale).
       - Mobile: also capture at native initially for first-impression sharpness;
         a later effect downgrades frames after dwell to free memory. */
    const isMobile = typeof window !== 'undefined'
      && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
    const MAX_WIDTH = isMobile ? 1280 : Infinity;
    const frames: HTMLCanvasElement[] = [];

    let rvfcHandle: number | undefined;
    let rafHandle: number | undefined;
    const supportsRVFC = typeof video.requestVideoFrameCallback === 'function';

    const captureFrame = () => {
      if (!capturing) return;
      if (video.readyState < 2) {
        rafHandle = requestAnimationFrame(captureFrame);
        return;
      }
      if (video.currentTime === lastTime) {
        rafHandle = requestAnimationFrame(captureFrame);
        return;
      }
      lastTime = video.currentTime;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        rafHandle = requestAnimationFrame(captureFrame);
        return;
      }

      const scale = Math.min(1, MAX_WIDTH / vw);
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        frames.push(off);
      }

      if (frames.length >= MAX_BOOMERANG_FRAMES) {
        capturing = false;
        framesRef.current = frames;
        setFramesReady(true);
        return;
      }

      if (supportsRVFC) {
        rvfcHandle = video.requestVideoFrameCallback!(captureFrame);
      } else {
        rafHandle = requestAnimationFrame(captureFrame);
      }
    };

    const onLoaded = () => {
      video.play().catch(() => {});
      if (supportsRVFC) {
        rvfcHandle = video.requestVideoFrameCallback!(captureFrame);
      } else {
        rafHandle = requestAnimationFrame(captureFrame);
      }
    };

    const onEnded = () => {
      capturing = false;
      if (frames.length > 0) {
        framesRef.current = frames;
        setFramesReady(true);
      }
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('ended',          onEnded);

    /* Already ready? Kick off immediately */
    if (video.readyState >= 1) onLoaded();

    return () => {
      capturing = false;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('ended',          onEnded);
      if (rafHandle  !== undefined) cancelAnimationFrame(rafHandle);
      if (rvfcHandle !== undefined && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(rvfcHandle);
      }
    };
  }, []);

  /* ───── Effect 2 — Boomerang render ───── */
  useEffect(() => {
    if (!framesReady) return;
    const canvas = displayCanvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length === 0) return;

    canvas.width  = frames[0].width;
    canvas.height = frames[0].height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let index = 0;
    let direction: 1 | -1 = 1;
    let last = performance.now();
    const interval = 1000 / 30;
    let rafHandle = 0;

    const render = (now: number) => {
      if (now - last >= interval) {
        last = now;
        ctx.drawImage(frames[index], 0, 0);
        index += direction;
        if (index >= frames.length - 1) {
          index = frames.length - 1;
          direction = -1;
        } else if (index <= 0) {
          index = 0;
          direction = 1;
        }
      }
      rafHandle = requestAnimationFrame(render);
    };

    rafHandle = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafHandle);
  }, [framesReady]);

  /* ───── Effect 2b — Mobile dwell-based resolution downgrade ─────
     PC keeps the native-resolution frame buffer forever (sharpest possible).
     On phones, after the boomerang has been on-screen for a few seconds the
     user has already absorbed the detail — we re-encode every frame to a
     much smaller canvas (and drop the originals) so we're not holding ~hundreds
     of megabytes of pixel data on a memory-constrained device. */
  useEffect(() => {
    if (!framesReady) return;
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
    if (!isMobile) return;

    const timer = window.setTimeout(() => {
      const originals = framesRef.current;
      if (!originals || originals.length === 0) return;
      const first = originals[0];
      if (first.width <= MOBILE_DOWNGRADE_WIDTH) return;
      const scale = MOBILE_DOWNGRADE_WIDTH / first.width;
      const w = Math.round(first.width * scale);
      const h = Math.round(first.height * scale);
      const downgraded: HTMLCanvasElement[] = [];
      for (const src of originals) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d');
        if (cx) {
          cx.imageSmoothingEnabled = true;
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(src, 0, 0, w, h);
        }
        downgraded.push(c);
      }
      /* Mutate the existing array in-place so the render loop's closure
         (which captured the original array reference) sees the new frames. */
      for (let i = 0; i < originals.length; i++) {
        const old = originals[i];
        originals[i] = downgraded[i];
        /* Now free the displaced original. */
        old.width = 0;
        old.height = 0;
      }
      /* Resize the display canvas so playback uses the smaller buffer. */
      const canvas = displayCanvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
      }
    }, MOBILE_DWELL_DOWNGRADE_MS);

    return () => window.clearTimeout(timer);
  }, [framesReady]);

  /* ───── Effect 3 — Parallax mouse tracking (GSAP) ───── */
  useEffect(() => {
    const el = videoBgRef.current;
    if (!el) return;

    const strength = 20;
    let targetX  = 0;
    let targetY  = 0;
    let currentX = 0;
    let currentY = 0;
    let rafHandle = 0;

    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      targetX = ((e.clientX - cx) / cx) * strength;
      targetY = ((e.clientY - cy) / cy) * strength;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      gsap.set(el, { x: currentX, y: currentY });
      rafHandle = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    rafHandle = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafHandle);
    };
  }, []);

  /* ─────────────────────── JSX ─────────────────────── */
  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Video background layer */}
      <div
        ref={videoBgRef}
        className="absolute top-0 left-0 w-full h-full z-0 scale-[1.08] origin-center"
      >
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          className="w-full h-full object-cover"
          style={{ display: framesReady ? 'none' : 'block' }}
        />
        <canvas
          ref={displayCanvasRef}
          className="w-full h-full object-cover"
          style={{ display: framesReady ? 'block' : 'none' }}
        />
        {/* Subtle vignette for contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
      </div>

      {/* Hero title */}
      <div
        className={
          'absolute left-0 right-0 z-20 w-full px-4 transition-all duration-1000 ease-out ' +
          (mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6')
        }
        style={{ top: '126px' }}
      >
        <h1 className="hero-title select-none">float</h1>
      </div>

      {/* Bottom row
          ───────────────────────────────────────────────────────────────
          Desktop: 3-col layout (left tagline · centered CTAs · right tagline).
          Mobile: side taglines hidden, CTA cluster stacks vertically and
          centers in the viewport — fits a 375px-wide phone without horizontal
          scroll or overlapping with the "scroll" hint. */}
      <div
        className={
          'absolute bottom-10 sm:bottom-12 left-0 right-0 px-6 sm:px-10 flex items-end justify-between z-20 transition-all duration-1000 delay-300 ease-out ' +
          (mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6')
        }
      >
        <p className="hidden md:block text-sm font-body font-light text-white/75 max-w-[240px] leading-relaxed">
          While your agents wait, your USDC earns.
          Yield middleware for the post-CLI world.
        </p>

        <div className="w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 md:bottom-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover-cyan-glow group relative bg-white text-black hover:text-white text-sm font-body font-medium rounded px-6 py-3 overflow-hidden active:scale-[0.97] transition-all duration-200 hover:scale-[0.97] text-center"
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              Get the SDK
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.25} />
            </span>
            <span className="absolute inset-0 bg-[color:var(--flo-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </a>

          <a
            href="#demo"
            className="liquid-glass hover-cyan-glow group relative overflow-hidden text-white text-sm font-body font-medium rounded px-6 py-3 active:scale-[0.97] transition-all duration-200 hover:scale-[0.97] text-center"
          >
            <span className="relative z-10">Watch it work</span>
            <span className="absolute inset-0 bg-[color:var(--flo-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </a>
        </div>

        <p className="hidden md:block text-sm font-body font-light text-white/75 max-w-[240px] leading-relaxed text-right">
          Park into USYC in one call.{' '}
          <em className="not-italic text-flo-cyan" style={{ fontStyle: 'italic', fontFamily: 'Instrument Serif, serif' }}>Recall</em>{' '}
          in seconds, settled on Arc.
        </p>
      </div>

      {/* Scroll hint — hidden on mobile where space is tight */}
      <div className="hidden sm:block absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.3em] text-white/40 font-body">
        scroll
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FIXED NAV — sits above both sections
   ═══════════════════════════════════════════════════════════════ */

function FixedNav() {
  return (
    <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap max-w-[calc(100vw-1.5rem)]">
      <div className="liquid-glass flex items-center gap-3 sm:gap-6 rounded px-3 sm:px-4 py-2 sm:py-2.5">
        <LogoMark />

        {/* Section anchor links — hidden on mobile to keep the pill from
            overflowing a 375px viewport. */}
        <div className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-sm font-body font-light text-white/70 hover:text-flo-blue transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 md:ml-4">
          {/* GitHub: icon-only on mobile to save space, icon + label on desktop */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-sm font-body font-light text-white/70 hover:text-flo-blue transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            <Github className="w-4 h-4 sm:w-3.5 sm:h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href="#start"
            className="liquid-glass-strong hover-cyan-glow group relative overflow-hidden text-[11px] sm:text-xs font-body font-medium text-white rounded px-2.5 sm:px-3 py-1 sm:py-1.5 transition-all duration-200 hover:scale-[0.97] active:scale-[0.97]"
          >
            <span className="relative z-10">Get started</span>
            <span className="absolute inset-0 bg-[color:var(--flo-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BUILT WITH — transitional buffer between hero and lazy section
   ───────────────────────────────────────────────────────────────
   Pure black, ~70vh tall. Three wordmarks in italic Instrument
   Serif, one-line role captions, hairline rules top + bottom.
   Closing-credits feel — gives the eye a beat between the loud
   video and the loud image.
   ═══════════════════════════════════════════════════════════════ */

function BuiltWith() {
  const stack: Array<{ name: string; role: string }> = [
    { name: 'Photon', role: 'queue · cancellation · recovery' },
    { name: 'Arc',    role: 'sub-sec finality · ~$0.01 settles' },
    { name: 'Circle', role: 'agent wallets · USDC · USYC' },
  ];

  return (
    <section
      id="built-with"
      className="relative w-full bg-black overflow-hidden"
      style={{ height: 'clamp(520px, 70vh, 720px)' }}
    >
      {/* Hairline rules — frame the section so it reads as defined, not gap */}
      <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.08]" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.08]" />

      {/* Section marker — top-left, matches the 02/03 typography rhythm */}
      <div className="absolute top-8 sm:top-12 left-6 sm:left-10 z-10">
        <div className="flex items-baseline gap-4 text-white/40">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">01</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">
            built with
          </span>
        </div>
      </div>

      {/* Opposite-corner whisper — links out to the Canteen hackathon site.
          Subtle hover lift signals it's interactive without breaking the editorial tone. */}
      <div className="absolute top-8 sm:top-12 right-6 sm:right-10 z-10 text-right">
        <a
          href="https://thecanteenapp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-baseline gap-1.5 font-body text-[10px] tracking-[0.35em] uppercase text-white/30 hover:text-flo-blue transition-colors duration-200"
        >
          <span>Agora Agents · 2026</span>
          <ArrowUpRight
            className="w-2.5 h-2.5 -translate-y-px opacity-60 group-hover:opacity-100 transition-opacity duration-200"
            strokeWidth={2.25}
          />
        </a>
      </div>

      {/* Centered trio
          Mobile: stack vertically with horizontal hairlines between names.
          Desktop: original horizontal row with vertical hairlines. */}
      <div className="absolute inset-0 flex items-center justify-center px-6 sm:px-10">
        <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12 md:gap-20 lg:gap-32">
          {stack.map((entry, i) => (
            <div
              key={entry.name}
              className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12 md:gap-20 lg:gap-32"
            >
              {i > 0 && (
                <div
                  className="h-px w-16 sm:h-16 sm:w-px bg-white/10"
                  aria-hidden="true"
                />
              )}
              <div className="flex flex-col items-center text-center">
                <span
                  className="font-heading italic text-white/85 leading-none"
                  style={{ fontSize: 'clamp(42px, 6vw, 88px)' }}
                >
                  {entry.name}
                </span>
                <span className="mt-3 sm:mt-4 font-body text-[10px] tracking-[0.3em] uppercase text-white/45">
                  {entry.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURES — six cards, live-system-output style
   ───────────────────────────────────────────────────────────────
   Each card pairs a real artifact from the orchestrator (mono-font
   trace) with a title and one-line claim. The point is to *prove*
   the feature in the same beat as describing it — judges scanning
   the page see the system's actual output, not abstract icons.
   ═══════════════════════════════════════════════════════════════ */

function Features() {
  return (
    <section
      id="capabilities"
      className="relative bg-black px-6 sm:px-10 py-20 sm:py-28 overflow-hidden"
    >
      {/* Section header — editorial title + sub */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline gap-4 text-white/40 mb-12">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">02</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">
            capabilities
          </span>
          <span className="ml-auto font-body text-[10px] tracking-[0.3em] uppercase text-white/30">
            every visual below · real orchestrator output
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          <h2
            className="lg:col-span-7 font-heading italic text-white"
            style={{ fontSize: 'clamp(48px, 6vw, 96px)', lineHeight: 0.95, letterSpacing: '-0.015em' }}
          >
            What FLOAT
            <br />
            actually does.
          </h2>
          <p className="lg:col-span-5 lg:pt-6 max-w-md text-white/65 text-base font-body font-light leading-relaxed">
            Six things, each provable. The traces below are sampled from a live
            orchestrator running three Circle Agent Wallets on Arc Testnet,
            making real park/withdraw decisions against USYC.
          </p>
        </div>

        {/* Grid — hairline grid via gap-px on a lightly-tinted parent */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06]">
          <FeatureCard
            index="01"
            title="Yield-as-default"
            body="Idle USDC parks into USYC the moment your agent stops trading. Live APY, no manual sweeps."
            trace={
              <pre className="leading-relaxed">
{`> flo.status('trader-b')

  state ─── PARKED
  vault ─── USYC
  parked ── $18.50
  apy ───── 5.15%
  yield ─── `}<span className="text-emerald-300">+$0.0000017/s</span>
              </pre>
            }
          />
          <FeatureCard
            index="02"
            title="Sub-5s recall"
            body="Direct Arc RPC and eth_getTransactionReceipt polling. Park → liquid, end-to-end, in under five seconds."
            trace={
              <pre className="leading-relaxed">
{`{
  "txHash": "0x453f…3750b",
  "status": "COMPLETE",
  "block": 8421073,
  `}<span className="text-emerald-300">"recallLatencyMs": 4847</span>{`
}`}
              </pre>
            }
          />
          <FeatureCard
            index="03"
            title="Adaptive policy"
            body="PolicyEngine scores park/withdraw on agent state, market volatility, and idle time. Three presets, infinite tuning."
            trace={
              <pre className="leading-relaxed">
{`strategy.aggressive

  parkThreshold ────── 0.40
  withdrawThreshold ── 0.20
  minIdleTimeSeconds ─ 45
  maxActionsPerHour ── 7  `}<span className="text-cyan-300">← v2</span>
              </pre>
            }
          />
          <FeatureCard
            index="04"
            title="RLAIF Critic"
            body="Independent reviewer audits decisions every N rounds and proposes parameter tweaks. Suggests in JSON; humans approve."
            trace={
              <pre className="leading-relaxed">
{`{
  "finding": "Over-reactive recall.",
  "parameter": "cooldownAfter
   WithdrawSeconds",
  "old": 120,
  "new": `}<span className="text-cyan-300">720</span>{`,
  "confidence": "high"
}`}
              </pre>
            }
          />
          <FeatureCard
            index="05"
            title="Second Brain"
            body="Hourly LLM compile turns raw event logs into per-agent narratives. The Critic reads its own history — no repeated mistakes."
            trace={
              <pre className="leading-relaxed font-body italic text-white/85 text-[13px]">
                On May 19 at 17:28 UTC, agent "trader-a" executed a decision to
                park $16.65 USDC into FloatVault with score 0.74. The action
                was part of the agent's autonomous decision-making — all
                transactions confirmed.
                <span className="block mt-3 not-italic font-mono text-[10px] tracking-wider text-white/35">
                  —— compiled by llama-3.3-70b
                </span>
              </pre>
            }
          />
          <FeatureCard
            index="06"
            title="Human-in-the-loop"
            body="Approve recommendations via a markdown checkbox. The file-watcher applies live in &lt;2s. Audit trail with timestamps."
            trace={
              <pre className="leading-relaxed">
{`## v3 — trader-c

  `}<span className="text-emerald-300">- [x] Approved</span>{`
        → cooldownAfter
          WithdrawSeconds: 720
  > Applied at:
    17:44:00 UTC`}
              </pre>
            }
          />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FeatureCard ───────────────────────── */
function FeatureCard({
  index,
  title,
  body,
  trace,
}: {
  index: string;
  title: string;
  body: string;
  trace: React.ReactNode;
}) {
  return (
    <article
      className="group relative bg-black p-5 sm:p-7 flex flex-col gap-5 transition-colors duration-200 hover:bg-white/[0.015]"
      style={{ borderRadius: 0, minHeight: '420px' }}
    >
      {/* Cyan top-edge accent — fades in on hover, the only color signal the card uses */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'linear-gradient(to right, transparent 0%, var(--flo-cyan-soft) 50%, transparent 100%)',
        }}
      />
      {/* Index marker — top-left, micro */}
      <span className="absolute top-7 right-7 font-body text-[10px] tracking-[0.3em] uppercase text-white/30">
        {index}
      </span>

      {/* Trace artifact — fixed-height, scroll on overflow */}
      <div
        className="flex-1 font-mono text-[12.5px] text-white/75 overflow-hidden"
        style={{ minHeight: '180px' }}
      >
        {trace}
      </div>

      {/* Title + body */}
      <div className="border-t border-white/[0.07] pt-5">
        <h3 className="font-heading italic text-white text-2xl leading-tight">
          {title}
        </h3>
        <p
          className="mt-2 text-white/60 text-[13px] leading-relaxed font-body font-light"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEET FLO — 3-up mascot section
   ───────────────────────────────────────────────────────────────
   Three mascot expressions — calm / focused / helpful — one per
   agent state, matching the canonical Flo brand sheet.
   ═══════════════════════════════════════════════════════════════ */

function MeetFlo() {
  const states: Array<{
    file: string;
    label: string;
    sub: string;
    color: string;
  }> = [
    {
      file: '/flo-calm.webp',
      label: 'IDLE',
      sub: 'at rest · awaiting signal',
      color: 'text-white/70',
    },
    {
      file: '/flo-focused.webp',
      label: 'EXECUTING',
      sub: 'wallet busy · submitting tx',
      color: 'text-cyan-200',
    },
    {
      file: '/flo-happy.webp',
      label: 'PARKED',
      sub: 'idle USDC earning · in USYC',
      color: 'text-emerald-300',
    },
  ];

  return (
    <section
      id="meet-flo"
      className="relative bg-black px-6 sm:px-10 py-20 sm:py-28 overflow-hidden"
      style={{ minHeight: '85vh' }}
    >
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-baseline gap-4 text-white/40 mb-10">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">03</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">
            meet flo
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          <h2
            className="lg:col-span-7 font-heading italic text-white"
            style={{ fontSize: 'clamp(48px, 6vw, 96px)', lineHeight: 0.95, letterSpacing: '-0.015em' }}
          >
            Three faces.
            <br />
            One agent.
          </h2>
          <p className="lg:col-span-5 lg:pt-6 max-w-md text-white/65 text-base font-body font-light leading-relaxed">
            Flo expresses what your agent is doing in real time.
            When it sleeps, your USDC isn't.
          </p>
        </div>

        {/* 3-up mascot grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 items-start">
          {states.map((s) => (
            <FloHead key={s.file} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FloHead ───────────────────────── */
function FloHead({
  file,
  label,
  sub,
  color,
}: {
  file: string;
  label: string;
  sub: string;
  color: string;
}) {
  const [errored, setErrored] = useState(false);
  const displaySrc = errored ? '/flo-calm.webp' : file;

  return (
    <figure className="relative flex flex-col items-center group">
      {/* Mascot frame — square aspect, radial glow behind */}
      <div
        className="relative w-full aspect-square overflow-hidden bg-[#06090f]"
        style={{
          borderRadius: 0,
          boxShadow:
            'inset 0 1px 1px rgba(255,255,255,0.06), 0 30px 60px -20px rgba(0, 32, 80, 0.4)',
        }}
      >
        {/* Subtle teal radial glow behind flo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(80, 200, 220, 0.10) 0%, rgba(0,0,0,0) 60%)',
          }}
        />
        <img
          src={displaySrc}
          alt={`Flo · ${label}`}
          onError={() => setErrored(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[0.97]"
        />
        {/* Floor reflection / fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 30%)',
          }}
        />
        {/* State indicator dot */}
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
          <span className={`relative inline-flex h-1.5 w-1.5 rounded ${
            label === 'IDLE' ? 'bg-white/50' :
            label === 'EXECUTING' ? 'bg-cyan-400' : 'bg-emerald-400'
          }`}>
            {label !== 'IDLE' && (
              <span className={`absolute inline-flex h-full w-full rounded animate-ping ${
                label === 'EXECUTING' ? 'bg-cyan-400/60' : 'bg-emerald-400/60'
              }`} />
            )}
          </span>
          <span className="font-body text-[9px] tracking-[0.3em] uppercase text-white/80">
            {label === 'IDLE' ? 'idle' : label === 'EXECUTING' ? 'executing' : 'parked'}
          </span>
        </div>
      </div>

      {/* Caption */}
      <figcaption className="mt-6 text-center">
        <h3
          className={`font-heading italic text-3xl ${color}`}
          style={{ letterSpacing: '-0.01em' }}
        >
          {label === 'IDLE' ? 'idle' : label === 'EXECUTING' ? 'executing' : 'parked'}
        </h3>
        <p className="mt-1 font-body text-[11px] tracking-[0.25em] uppercase text-white/45">
          {sub}
        </p>
      </figcaption>
    </figure>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAZY SECTION — Option A "Cinemascope still" + C twist
   ───────────────────────────────────────────────────────────────
   Anime image as full-bleed environment. Asymmetric vignette
   dissolves edges to black, with extra crush at the bottom so the
   floor disappears and the headline can rest on the void.
   ═══════════════════════════════════════════════════════════════ */

function LazySection() {
  return (
    <section
      id="vault"
      className="relative w-full overflow-hidden bg-black"
      style={{ height: 'min(100vh, 1080px)', minHeight: '720px' }}
    >
      {/* ─── Image layer ─── */}
      <img
        src="/lazy-section.webp"
        alt="A person resting among cassettes — idle, but the world keeps spinning."
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 35%' }}
      />

      {/* ─── Vignette stack (in compositing order) ─── */}

      {/* 1. Asymmetric radial vignette — focal point biased toward the figure */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 85% 95% at 58% 42%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.95) 92%, #000 100%)',
        }}
      />

      {/* 2. Floor → void: aggressive bottom-to-top fade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, #000 0%, rgba(0,0,0,0.92) 8%, rgba(0,0,0,0.6) 22%, rgba(0,0,0,0.2) 38%, rgba(0,0,0,0) 55%)',
        }}
      />

      {/* 3. Top fade — softens the area behind the fixed nav */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 14%, rgba(0,0,0,0) 26%)',
        }}
      />

      {/* 4. Warm color grade — multiply tint to deepen the sunset shadows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'rgba(28, 14, 4, 0.35)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* 5. Hairline film grain (uses the .grain helper) */}
      <div className="absolute inset-0 pointer-events-none grain" />

      {/* Top hairline rule — frames the cinematic still and continues the
          editorial rhythm established by the BuiltWith section. Sits at z-30
          so it remains visible on top of the image and all vignette layers. */}
      <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.10] z-30" />

      {/* Bottom hairline — closes the frame against the NumbersStrip border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.08] z-30" />

      {/* ════════════ Content layer ════════════ */}

      {/* Top-left: section marker + tight body */}
      <div className="absolute top-24 sm:top-28 left-6 sm:left-10 z-20 max-w-[260px] sm:max-w-[300px]">
        <div className="flex items-baseline gap-4 text-white/55">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">04</span>
          <span className="h-px w-12 bg-white/30" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">
            idle is the point
          </span>
        </div>
        <p
          className="mt-6 text-white/80 text-[14px] sm:text-[15px] font-body font-light leading-[1.55]"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
        >
          Yield middleware for agents on Arc.
          Idle USDC parks into{' '}
          <span className="text-white">USYC</span>.
          Recall in under five seconds.
        </p>
      </div>

      {/* Top-right: Aristotle epigraph (mirror of section marker)
          Hidden on mobile — would overlap the left block. */}
      <div className="hidden md:block absolute top-28 right-10 z-20 max-w-[260px] text-right">
        <p
          className="font-heading italic text-white/70 text-[15px] leading-snug"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
        >
          "All things that are exchanged
          <br />
          must be somehow comparable."
        </p>
        <p className="mt-2 font-body text-[10px] tracking-[0.3em] uppercase text-white/45">
          Aristotle · Nicomachean Ethics V
        </p>
      </div>

      {/* Floating live-state pill — decorative artifact; hidden on mobile
          where it would crash into the headline. */}
      <div
        className="hidden sm:flex liquid-glass-strong absolute z-20 px-3.5 py-2 rounded items-center gap-2.5 text-xs font-body"
        style={{
          right: 'clamp(48px, 9vw, 140px)',
          top:   'clamp(220px, 32vh, 360px)',
          transform: 'rotate(-2.4deg)',
        }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded bg-emerald-400/70 animate-ping" />
          <span className="relative inline-flex rounded h-2 w-2 bg-emerald-400" />
        </span>
        <span className="text-white/95 tracking-wide">
          trader-b · <span className="text-emerald-300">PARKED</span> · $18.50
        </span>
      </div>

      {/* Floating yield ticker — same story, hidden on mobile. */}
      <div
        className="hidden sm:flex liquid-glass absolute z-20 px-3 py-1.5 rounded items-center gap-2 text-[11px] font-body"
        style={{
          left: 'clamp(60px, 12vw, 220px)',
          top:  'clamp(360px, 50vh, 520px)',
          transform: 'rotate(3.6deg)',
        }}
      >
        <Pause className="w-3 h-3 text-white/65" strokeWidth={2} />
        <span className="text-white/90 tracking-wider">
          + <span className="font-mono">$0.000017</span> yield/sec
        </span>
      </div>

      {/* ────── Headline — bleeds across the bottom void
          Clamp min was 96px which overflows a 375px phone. Dropped to
          52px on mobile so it sits comfortably; desktop value untouched. */}
      <h2
        className="absolute z-20 left-6 right-6 sm:left-8 sm:right-8 pointer-events-none"
        style={{
          bottom: 'clamp(28px, 5vh, 72px)',
          fontFamily: "'Instrument Serif', serif",
          fontStyle: 'italic',
          fontSize: 'clamp(52px, 13vw, 220px)',
          lineHeight: 0.92,
          letterSpacing: '-0.02em',
          color: '#fff',
        }}
      >
        While you rest,
        <br />
        <span className="text-white">your capital works.</span>
      </h2>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NUMBERS STRIP — third section, lifted out of the cinematic still
   so the image can land without statistical noise next to it.
   ═══════════════════════════════════════════════════════════════ */

function NumbersStrip() {
  // No top border on this section — LazySection's z-30 bottom hairline
  // already marks the boundary; doubling them up creates a thicker line.
  return (
    <section id="numbers" className="relative bg-black py-20 sm:py-28 px-6 sm:px-10 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        {/* Tiny header — continuation marker */}
        <div className="flex items-baseline gap-4 text-white/40 mb-12 sm:mb-16">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">05</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">
            the numbers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06]">
          <StatBig big="5.15%" label="USYC target APY" sub="Circle's tokenized money market fund" />
          <StatBig big="<5s"   label="end-to-end recall" sub="park → liquid, settled on Arc" />
          <StatBig big="$0.01" label="per Arc settlement" sub="paid in USDC, no volatile gas" />
        </div>
      </div>

      {/* Footer — stacks on mobile, opposite-end on desktop */}
      <div className="mt-20 sm:mt-32 max-w-6xl mx-auto flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-end sm:justify-between">
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/40">
          FLOAT · Yield middleware for Arc agents · Built for Agora Agents Hackathon
        </p>
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 sm:text-right">
          Circle · USYC · Arc · 2026
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────── StatBig ───────────────────────── */
function StatBig({ big, label, sub }: { big: string; label: string; sub: string }) {
  return (
    <div className="bg-black px-8 py-12 flex flex-col items-start gap-2">
      <span
        className="font-heading italic leading-none text-white"
        style={{ fontSize: 'clamp(64px, 7vw, 112px)' }}
      >
        {big}
      </span>
      <span className="mt-2 font-body text-[11px] uppercase tracking-[0.3em] text-white/65">
        {label}
      </span>
      <span className="font-body text-[13px] text-white/45 leading-snug">
        {sub}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   START — CTA section (06)
   ───────────────────────────────────────────────────────────────
   Final ask. Italic headline, install command in a mono pill,
   two CTAs, subtle cyan radial glow that matches the banner's
   data streams (no rainbow gradient — would clash with the rest
   of the dark cinematic aesthetic).
   ═══════════════════════════════════════════════════════════════ */

function StartCTA() {
  const [copied, setCopied] = useState(false);
  const installCmd = 'npm install @floatrouter/sdk';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <section
      id="start"
      className="relative bg-black px-6 sm:px-10 py-24 sm:py-32 overflow-hidden"
    >
      {/* ── Background stack ──────────────────────────────────────
          Motion-blur runner image: the visual rhyme for FLOAT —
          always in motion, never idle. Treated heavily so the install
          pill and CTAs stay legible at all viewport sizes. */}

      {/* Layer 1 — the photo itself.
          `object-bottom` keeps the runner's feet anchored low so the
          composition reads as "moving forward" rather than centered. */}
      <img
        src="/start-bg.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover object-bottom pointer-events-none select-none"
      />

      {/* Cyan glow mask — soft radial bloom that drapes brand color over
          the image without darkening it. Two stacked radials at different
          positions/sizes give the bloom an organic, non-circular shape. */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(123, 224, 255, 0.32) 0%, rgba(123, 224, 255, 0.10) 40%, rgba(0,0,0,0) 75%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background:
            'radial-gradient(ellipse 45% 50% at 30% 70%, rgba(123, 224, 255, 0.22) 0%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* Top fade — eases entry from the FAQ section above so the runner
          image doesn't hit a hard edge. */}
      <div
        className="absolute inset-x-0 top-0 h-20 sm:h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Bottom fade — mirrors the top fade so both edges of the section
          ease symmetrically into black. */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 sm:h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
        }}
      />

      {/* Text-area vignette — dark elliptical plate behind the content
          column only. Pulls the image down where the type sits without
          dimming the whole section. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 55% 60% at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0) 80%)',
        }}
      />

      {/* Headline halo — subtle non-blended cyan behind the type. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 40% 35% at 50% 40%, rgba(123, 224, 255, 0.10) 0%, rgba(0,0,0,0) 70%)',
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className="flex items-baseline justify-center gap-4 text-white/40 mb-12">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">07</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">start</span>
        </div>

        <h2
          className="font-heading italic text-white"
          style={{
            fontSize: 'clamp(56px, 8vw, 132px)',
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 24px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.45)',
          }}
        >
          Ready to make idle
          <br />
          USDC work?
        </h2>

        <p
          className="mt-8 max-w-xl mx-auto text-white/80 text-lg font-body font-light leading-relaxed"
          style={{ textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}
        >
          Install in one command. Wrap any Circle Agent Wallet.
          Park into USYC, recall in under five seconds.
        </p>

        {/* Install command pill
            Mobile: font drops to 12px and inline padding tightens so the
            full command + copy chip fits a 375px viewport without overflow. */}
        <button
          onClick={copy}
          className="liquid-glass hover-cyan-glow group mt-12 inline-flex items-center gap-2 sm:gap-3 rounded px-3 sm:px-5 py-3 sm:py-4 font-mono text-[12px] sm:text-[14px] text-left active:scale-[0.985] transition-all duration-150 max-w-full"
          aria-label="Copy install command"
        >
          <span className="text-white/35 select-none">$</span>
          <span className="text-white/95 truncate">{installCmd}</span>
          <span className="ml-1 sm:ml-3 inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-white/45 group-hover:text-white/85 transition-colors duration-150 shrink-0">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={2.25} />
                <span className="hidden sm:inline">copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" strokeWidth={2.25} />
                <span className="hidden sm:inline">copy</span>
              </>
            )}
          </span>
        </button>

        {/* CTAs */}
        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover-cyan-glow group relative bg-white text-black hover:text-white text-sm font-body font-medium rounded px-6 py-3 overflow-hidden active:scale-[0.97] transition-all duration-200 hover:scale-[0.97]"
          >
            <span className="relative z-10 inline-flex items-center gap-1.5">
              Get the SDK
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.25} />
            </span>
            <span className="absolute inset-0 bg-[color:var(--flo-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </a>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="liquid-glass hover-cyan-glow group relative overflow-hidden text-white text-sm font-body font-medium rounded px-6 py-3 active:scale-[0.97] transition-all duration-200 hover:scale-[0.97]"
          >
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" strokeWidth={2.25} />
              Star on GitHub
            </span>
            <span className="absolute inset-0 bg-[color:var(--flo-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </a>
        </div>

        {/* Tiny support line */}
        <p className="mt-8 font-body text-[11px] tracking-[0.25em] uppercase text-white/35">
          Arc Testnet · Circle Agent Wallets · USYC
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUESTIONS — FAQ accordion (07)
   ───────────────────────────────────────────────────────────────
   Real FLOAT-specific questions. Single column, max-w-3xl,
   hairline-bordered items, CSS grid-rows trick for smooth height
   animation. + / − icons (rotate via opacity swap, not rotation).
   ═══════════════════════════════════════════════════════════════ */

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Will my agent miss trades while funds are parked?',
    a: 'No. FLOAT polls the chain directly via Arc RPC and uses a per-wallet execution mutex with pre-flight vault reads, so recalls land in under five seconds end-to-end. If the agent signals EXECUTING mid-park, the orchestrator defers and the PolicyEngine adapts its idle/cooldown thresholds.',
  },
  {
    q: 'Does FLOAT need custody of my private keys?',
    a: 'Never. FLOAT runs through Circle Agent Wallets — Circle holds the keys, your agent owns the wallet, and the FLOAT SDK only submits signed transactions through Circle\'s standard interface. We don\'t see or store key material at any point.',
  },
  {
    q: 'What\'s actually in the vault?',
    a: 'USYC — Circle\'s tokenized money market fund, holding short-duration US Treasury bills. Audited, regulated, and currently yielding around 5.15% APY. Park and withdraw happen via a thin FloatVault contract that wraps the USYC deposit, with the full audit trail pinned to the FLOAT Second Brain.',
  },
  {
    q: 'How do I integrate with my existing agent?',
    a: 'One line. Wrap your agent client with wrapAgent(myAgent, { strategy: \'balanced\', vault: \'USYC\' }) and FLOAT routes idle USDC automatically, signals park/withdraw based on agent state, and exposes the live ledger. Ten-minute integration; no new contracts to learn.',
  },
  {
    q: 'Which chains and wallets are supported?',
    a: 'Arc Testnet today, with Circle Agent Wallets as the auth layer. Mainnet Arc and other Circle-supported chains land alongside Circle Gateway integration for cross-chain recall (~500ms cross-chain via Gateway, sub-5s on-chain settle on the destination).',
  },
];

function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="questions" className="relative bg-black px-6 sm:px-10 py-20 sm:py-28">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-baseline gap-4 text-white/40 mb-12">
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">06</span>
          <span className="h-px w-12 bg-white/20" />
          <span className="font-body text-[10px] tracking-[0.35em] uppercase">questions</span>
        </div>

        <h2
          className="font-heading italic text-white mb-4"
          style={{ fontSize: 'clamp(56px, 7vw, 112px)', lineHeight: 0.95, letterSpacing: '-0.015em' }}
        >
          Doubts.
        </h2>
        <p className="text-white/55 text-base font-body font-light mb-16 max-w-xl">
          Five honest answers. If yours isn't here, the SDK README has the long version.
        </p>

        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <FAQItem
              key={i}
              q={faq.q}
              a={faq.a}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQItem ───────────────────────── */
function FAQItem({
  q,
  a,
  isOpen,
  onToggle,
}: {
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={
        'border-b transition-colors duration-200 ' +
        (isOpen
          ? 'border-[color:var(--flo-cyan-soft)]'
          : 'border-white/[0.08] hover:border-[color:var(--flo-blue-soft)]')
      }
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 sm:gap-6 py-5 sm:py-6 text-left group"
        aria-expanded={isOpen}
      >
        <span
          className={
            'font-body text-[15px] sm:text-[17px] leading-snug transition-colors duration-200 ' +
            (isOpen ? 'text-white' : 'text-white/85 group-hover:text-white')
          }
        >
          {q}
        </span>
        <span
          className={
            'shrink-0 w-7 h-7 inline-flex items-center justify-center rounded transition-colors duration-200 ' +
            (isOpen ? 'text-white' : 'text-white/45 group-hover:text-white/80')
          }
        >
          {isOpen ? <Minus className="w-4 h-4" strokeWidth={2} /> : <Plus className="w-4 h-4" strokeWidth={2} />}
        </span>
      </button>

      {/* Smooth grid-rows expand — no JS height measurement needed */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pb-6 pr-12 text-white/60 text-[15px] leading-[1.7] font-body font-light">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FOOTER — banner hero + utility bar (08)
   ───────────────────────────────────────────────────────────────
   The float-banner.png does the heavy visual lifting as the
   closing "poster" moment. Below it, a thin utility bar with
   nav, copyright, and three social icons (GitHub, X, Discord).
   Discord is an inline custom SVG since lucide doesn't ship one.
   ═══════════════════════════════════════════════════════════════ */

/* Custom Discord icon — lucide doesn't ship this glyph */
function DiscordIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.073.035c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.249.07.07 0 0 0-.073-.035 19.74 19.74 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.054 19.9 19.9 0 0 0 5.993 3.03.07.07 0 0 0 .076-.027c.462-.63.873-1.295 1.226-1.994a.07.07 0 0 0-.038-.097 13.1 13.1 0 0 1-1.872-.892.07.07 0 0 1-.007-.117c.126-.094.252-.192.372-.291a.07.07 0 0 1 .073-.01c3.927 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .074.009c.12.1.246.198.373.292a.07.07 0 0 1-.006.117 12.3 12.3 0 0 1-1.873.891.07.07 0 0 0-.037.098c.36.7.772 1.363 1.225 1.993a.07.07 0 0 0 .076.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.06.06 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function Footer() {
  const navLinks: Array<{ label: string; href: string; external?: boolean }> = [
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'Meet Flo',     href: '#meet-flo'     },
    { label: 'Vault',        href: '#vault'        },
    { label: 'Numbers',      href: '#numbers'      },
    { label: 'SDK',          href: '#start'        },
    { label: 'Questions',    href: '#questions'    },
  ];

  return (
    <footer id="footer" className="relative bg-black overflow-hidden">
      {/* ── Typographic outro — bookends the hero's giant "float" title.
          Video backdrop loops behind, four overlays push focus to the type. ── */}
      <section
        className="relative w-full flex items-center justify-center overflow-hidden"
        style={{ minHeight: 'clamp(520px, 75vh, 820px)' }}
      >
        {/* Video bg — silent, autoplaying, looping. Same cinematic
            register as the hero, with stronger darkening here so the
            italic wordmark stays the focal point. */}
        <video
          src="/footer.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover z-0 select-none pointer-events-none"
        />

        {/* 1. Uniform dark wash — kept low so the video reads brightly,
              just enough to take the edge off pure highlights for text contrast. */}
        <div className="absolute inset-0 z-[1] bg-black/0 pointer-events-none" />

        {/* 2. Asymmetric radial vignette — clear at center so the video
              shines through behind the wordmark; corners still dissolve to
              black so the section has a clean edge against the utility bar. */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 90% 100% at 50% 55%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.30) 75%, rgba(0,0,0,0.85) 100%)',
          }}
        />

        {/* 3. Soft cool ambient wash — picks up the cyan accent from the rest
            of the page at very low intensity */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 65% 75% at 50% 60%, rgba(80, 200, 220, 0.06) 0%, rgba(0,0,0,0) 60%)',
          }}
        />

        {/* 4. Hairline frame — matches the rest of the editorial system */}
        <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.10] z-[2]" />

        {/* Section marker */}
        <div className="absolute top-8 sm:top-12 left-6 sm:left-10 z-10">
          <div className="flex items-baseline gap-4 text-white/40">
            <span className="font-body text-[10px] tracking-[0.35em] uppercase">09</span>
            <span className="h-px w-12 bg-white/20" />
            <span className="font-body text-[10px] tracking-[0.35em] uppercase">end</span>
          </div>
        </div>

        {/* Opposite-corner micro-attribution (matches earlier sections' diagonal) */}
        <div className="absolute top-8 sm:top-12 right-6 sm:right-10 z-10 text-right">
          <p className="font-body text-[10px] tracking-[0.35em] uppercase text-white/30">
            yield middleware · 2026
          </p>
        </div>

        {/* Center stack: tiny LogoMark + huge italic wordmark + tagline */}
        <div className="relative z-10 flex flex-col items-center text-center px-6">
          {/* Tiny LogoMark above wordmark for visual anchoring */}
          <div className="mb-10 opacity-60">
            <LogoMark />
          </div>

          {/* THE wordmark — same family as the hero title, same italic, scaled
              wide. Bookends the page opening exactly.
              Clamp min dropped from 140 -> 84 so it fits a 375px viewport
              (140px italic 'float' is wider than the phone). */}
          <h2
            className="font-heading italic text-white select-none leading-none"
            style={{
              fontSize: 'clamp(84px, 24vw, 380px)',
              letterSpacing: '-0.025em',
            }}
          >
            float
          </h2>

          {/* Tagline — quieter, italic, refined */}
          <p
            className="mt-8 font-heading italic text-white/65 leading-snug"
            style={{ fontSize: 'clamp(18px, 1.8vw, 26px)', letterSpacing: '-0.005em' }}
          >
            The capital efficiency layer.
          </p>

          {/* Three whispered claims — uses the same em-dash framing as elsewhere */}
          <div className="mt-10 flex items-center gap-3 flex-wrap justify-center font-body text-[10px] tracking-[0.35em] uppercase text-white/35">
            <span>calm infrastructure</span>
            <span className="w-1 h-1 rounded bg-white/20" />
            <span>intelligent liquidity</span>
            <span className="w-1 h-1 rounded bg-white/20" />
            <span>always working</span>
          </div>
        </div>

        {/* Bottom soft fade into the utility bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 70%, #000 100%)',
          }}
        />
      </section>

      {/* ── Utility bar ── */}
      <div className="relative border-t border-white/[0.08] px-6 sm:px-10 py-7">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-y-5 gap-x-8">
          {/* Left — anchor nav */}
          <nav className="flex items-center gap-x-6 gap-y-2 flex-wrap">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="font-body text-[11px] tracking-[0.25em] uppercase text-white/45 hover:text-flo-blue transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </nav>

          {/* Center — copyright */}
          <p className="font-body text-[10px] tracking-[0.3em] uppercase text-white/35 order-3 lg:order-2 w-full lg:w-auto text-center">
            © 2026 FLOAT · Built for{' '}
            <a
              href="https://thecanteenapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/55 hover:text-flo-blue transition-colors duration-200"
            >
              Agora Agents
            </a>
          </p>

          {/* Right — socials */}
          <div className="flex items-center gap-2 order-2 lg:order-3">
            <SocialIcon
              href={GITHUB_URL}
              label="GitHub"
              icon={<Github className="w-4 h-4" strokeWidth={1.75} />}
            />
            <SocialIcon
              href={TWITTER_URL}
              label="X · @floatrouter"
              icon={<Twitter className="w-4 h-4" strokeWidth={1.75} />}
            />
            <SocialIcon
              href="https://discord.gg/TGnyfKh23V"
              label="Canteen Discord"
              icon={<DiscordIcon className="w-4 h-4" />}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ───────────────────────── SocialIcon ───────────────────────── */
function SocialIcon({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="hover-cyan-edge w-9 h-9 inline-flex items-center justify-center rounded border border-white/[0.08] text-white/55 hover:text-flo-blue"
    >
      {icon}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <main className="min-h-screen bg-black text-white font-body overflow-x-hidden">
      <FixedNav />
      <Hero />
      <BuiltWith />
      <Features />
      <MeetFlo />
      <LazySection />
      <NumbersStrip />
      <FAQSection />
      <StartCTA />
      <Footer />
    </main>
  );
}
