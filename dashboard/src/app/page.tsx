"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

// Suppress benign Framer Motion dev warnings about list keys
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('Framer Motion')) {
      return;
    }
    originalError(...args);
  };
}

// ═══════ ICONS ═══════
const ArrowUpRight = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7"></line>
    <polyline points="7 7 17 7 17 17"></polyline>
  </svg>
);

const PlayIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6 4 20 12 6 20 6 4"></polygon>
  </svg>
);

const ClockIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// ═══════ FADING VIDEO COMPONENT ═══════
interface FadingVideoProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}

const FadingVideo: React.FC<FadingVideoProps> = ({ src, className, style }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const fadingOutRef = useRef<boolean>(false);

  const fadeTo = (targetOpacity: number, duration: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    const startOpacity = parseFloat(video.style.opacity || '0');
    const opacityDiff = targetOpacity - startOpacity;
    if (opacityDiff === 0) return;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentOpacity = startOpacity + opacityDiff * progress;
      video.style.opacity = currentOpacity.toString();

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Initialize state
    video.style.opacity = '0';
    fadingOutRef.current = false;

    const handleLoadedData = () => {
      video.style.opacity = '0';
      video.play().catch(err => console.log("Play interrupted:", err));
      fadeTo(1, 500);
    };

    const handleTimeUpdate = () => {
      if (!video.duration) return;
      const remainingTime = video.duration - video.currentTime;
      if (!fadingOutRef.current && remainingTime <= 0.55 && remainingTime > 0) {
        fadingOutRef.current = true;
        fadeTo(0, 500);
      }
    };

    const handleEnded = () => {
      video.style.opacity = '0';
      setTimeout(() => {
        if (!video) return;
        video.currentTime = 0;
        video.play().catch(err => console.log("Play interrupted:", err));
        fadingOutRef.current = false;
        fadeTo(1, 500);
      }, 100);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    if (video.readyState >= 2) {
      handleLoadedData();
    }

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      style={{ ...style, opacity: 0 }}
      muted
      playsInline
      preload="auto"
      autoPlay
    />
  );
};

// ═══════ BLUR TEXT COMPONENT ═══════
interface BlurTextProps {
  text: string;
  className?: string;
}

const BlurText: React.FC<BlurTextProps> = ({ text, className }) => {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const isInView = useInView(containerRef, { amount: 0.1, once: true });
  const words = text.split(' ');

  return (
    <p
      ref={containerRef}
      className={`${className} flex flex-wrap`}
      style={{
        rowGap: '0.1em',
      }}
    >
      {words.map((word, i) => {
        const delay = (i * 100) / 1000;
        return (
          <motion.span
            key={i}
            style={{ display: 'inline-block', marginRight: '0.28em' }}
            initial={{ filter: 'blur(10px)', opacity: 0, y: 50 }}
            animate={isInView ? {
              filter: ['blur(10px)', 'blur(5px)', 'blur(0px)'],
              opacity: [0, 0.5, 1],
              y: [50, -5, 0]
            } : {}}
            transition={{
              duration: 0.7,
              times: [0, 0.5, 1],
              ease: 'easeOut',
              delay: delay
            }}
          >
            {word}
          </motion.span>
        );
      })}
    </p>
  );
};

// ═══════ CAPABILITIES CARD SVGS ═══════
const ScenerySvg = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
    <path d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21H5Zm1-4h12l-3.75-5-3 4L9 13l-3 4Z" />
  </svg>
);

const BatchSvg = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
    <path d="M4 6.47 5.76 10H20v8H4V6.47M22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.89-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4Z" />
  </svg>
);

const LightingSvg = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
    <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1Zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7Z" />
  </svg>
);

export default function SpaceLandingPage() {
  const [yieldAccrued, setYieldAccrued] = useState(1482.419283);
  const [totalDeposited, setTotalDeposited] = useState(128491.50);
  const [logs, setLogs] = useState([
    { time: "23:44:17", agent: "trader-b", action: "PARK", amount: 18.50, detail: "Idle USDC detected. Routed to USYC vault." },
    { time: "23:44:50", agent: "trader-a", action: "PARK", amount: 16.65, detail: "Idle USDC detected. Routed to USYC vault." },
    { time: "23:46:21", agent: "trader-c", action: "RECALL", amount: 11.10, detail: "Transaction pending. Sub-second recall executed." },
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0); // 0: idle, 1: detected, 2: recalling, 3: completed

  useEffect(() => {
    const interval = setInterval(() => {
      setYieldAccrued(prev => prev + 0.000029);
      setTotalDeposited(prev => prev + (Math.random() > 0.5 ? 0.05 : -0.05));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const triggerSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimStep(1);
    
    setTimeout(() => {
      setSimStep(2);
      setLogs(prev => [
        {
          time: new Date().toLocaleTimeString(),
          agent: "sim-agent",
          action: "RECALL_PENDING",
          amount: 50.00,
          detail: "Triggered transaction: Recalling $50.00 USDC..."
        },
        ...prev
      ]);
    }, 800);

    setTimeout(() => {
      setSimStep(3);
      setLogs(prev => [
        {
          time: new Date().toLocaleTimeString(),
          agent: "sim-agent",
          action: "RECALL_SUCCESS",
          amount: 50.00,
          detail: "Recall complete. Latency: 2.4s. Transaction executed on Arc."
        },
        ...prev
      ]);
    }, 2100);

    setTimeout(() => {
      setIsSimulating(false);
      setSimStep(0);
    }, 4000);
  };

  return (
    <div className="bg-[#020610] text-white min-h-screen relative font-body selection:bg-white/20">
      
      {/* ═══════ LIQUID GLASS STYLES ═══════ */}
      <style jsx global>{`
        .font-heading {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
        }
        .font-body {
          font-family: 'Geist', 'Inter', sans-serif;
        }
        .rounded {
          border-radius: 9999px !important;
        }
        .liquid-glass {
          background: rgba(255,255,255,0.01);
          background-blend-mode: luminosity;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: none;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.1);
          position: relative;
          overflow: hidden;
        }
        .liquid-glass::before {
          content: "";
          position: absolute; inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.02));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .liquid-glass-strong {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(50px);
          -webkit-backdrop-filter: blur(50px);
          border: none;
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.15);
          position: relative;
          overflow: hidden;
        }
        .liquid-glass-strong::before {
          content: "";
          position: absolute; inset: 0;
          border-radius: inherit;
          padding: 1.5px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.05));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      {/* ═══════ SECTION 1: HERO ═══════ */}
      <section className="relative w-full h-screen overflow-hidden flex flex-col justify-between z-10 bg-transparent">
        
        {/* Radial glow matching the third image */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,_rgba(77,227,255,0.08),_transparent_50%)] z-0 pointer-events-none" />

        {/* Top Transparent Nav Bar Space */}
        <header className="relative w-full bg-transparent text-white py-2.5 px-8 md:px-16 lg:px-24 flex items-center justify-between z-50 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="6" width="32" height="24" rx="6" fill="#020610" stroke="url(#logo-border)" strokeWidth="1.5" />
              <path d="M8 12.5H28C28.8284 12.5 29.5 13.1716 29.5 14C29.5 14.8284 28.8284 15.5 28 15.5H14V19.5H24C24.8284 19.5 25.5 20.1716 25.5 21C25.5 21.8284 24.8284 22.5 24 22.5H14V27.5C14 28.3284 13.3284 29 12.5 29C11.6716 29 11 28.3284 11 27.5V15.5H8C7.17157 15.5 6.5 14.8284 6.5 14C6.5 13.1716 7.17157 12.5 8 12.5Z" fill="url(#logo-grad)" />
              <defs>
                <linearGradient id="logo-grad" x1="6.5" y1="12.5" x2="29.5" y2="29" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4DE3FF" />
                  <stop offset="0.5" stopColor="#2775CA" />
                  <stop offset="1" stopColor="#7CFFB2" />
                </linearGradient>
                <linearGradient id="logo-border" x1="2" y1="6" x2="34" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="rgba(77, 227, 255, 0.6)" />
                  <stop offset="1" stopColor="rgba(39, 117, 202, 0.2)" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-heading text-lg font-bold tracking-[0.2em] text-white">
              FLO<span className="text-[#4DE3FF]">A</span>T
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {["Home", "Features", "Architecture", "Simulation", "Developer Docs"].map((link) => {
              const href = link === "Home" ? "#" 
                         : link === "Features" ? "#features"
                         : link === "Architecture" ? "#architecture"
                         : link === "Simulation" ? "#simulation"
                         : "/dashboard";
              return (
                <a key={link} href={href} className="text-xs font-semibold text-white/60 hover:text-white transition-colors font-body">
                  {link}
                </a>
              );
            })}
          </div>

          <a href="/dashboard" className="border border-white/20 text-white font-body text-[11px] font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-white/5 hover:border-white/40 transition-all whitespace-nowrap">
            Launch App <ArrowUpRight className="h-3 w-3" />
          </a>
        </header>

        {/* Widescreen video card floating on the right */}
        <div className="absolute top-1/2 -translate-y-1/2 right-8 md:right-16 lg:right-24 z-0 hidden md:flex items-center justify-end w-[42%] lg:w-[48%] aspect-[16/10] lg:aspect-[21/9] rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5),_0_0_40px_rgba(77,227,255,0.03)] border border-white/5 bg-[#000]">
          <FadingVideo
            src="/flo-hero.mp4"
            className="w-full h-full object-cover object-right"
          />
        </div>

        {/* Hero Content Area - Left Aligned to left border (padding) with max-width limit */}
        <div className="relative z-10 flex-1 flex flex-col items-start justify-center text-left px-8 md:px-16 lg:px-24 w-full">
          
          {/* Badge */}
          <motion.div
            initial={{ filter: "blur(10px)", opacity: 0, y: 20 }}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="bg-white/[0.03] border border-white/10 rounded-full p-0.5 pr-3.5 flex items-center gap-2 max-w-full"
          >
            <span className="bg-white text-black px-2.5 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider">New</span>
            <span className="text-xs text-white/80 font-body">The idle capital engine for Arc.</span>
          </motion.div>

          {/* Headline */}
          <div className="mt-6 w-full max-w-2xl lg:max-w-[45%]">
            <BlurText
              text="Put idle capital to work."
              className="text-4xl md:text-5xl lg:text-[4.2rem] font-heading text-white leading-[1.05] tracking-[-2px] text-left justify-start"
            />
          </div>

          {/* Subheading */}
          <motion.p
            initial={{ filter: "blur(10px)", opacity: 0, y: 20 }}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
            className="mt-6 text-sm md:text-base text-white/60 max-w-md font-body font-normal leading-relaxed"
          >
            Autonomously route idle USDC to USYC with instant, sub-second recall.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ filter: "blur(10px)", opacity: 0, y: 20 }}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1, ease: "easeOut" }}
            className="flex items-center gap-6 mt-8"
          >
            <a href="/dashboard" className="bg-white hover:bg-white/90 text-black rounded-full px-5 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors">
              Enter Dashboard <ArrowUpRight className="h-4 w-4" />
            </a>
            <a href="#features" className="text-white/60 hover:text-white transition-colors text-xs font-semibold flex items-center gap-2 font-body">
              How it works <ArrowUpRight className="h-4 w-4" />
            </a>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ filter: "blur(10px)", opacity: 0, y: 20 }}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.3, ease: "easeOut" }}
            className="flex flex-wrap justify-start gap-4 mt-8"
          >
            <div className="liquid-glass p-4 w-[190px] rounded-[1.25rem] text-left flex flex-col justify-between min-h-[120px]">
              <div className="text-[#4DE3FF]">
                <ClockIcon />
              </div>
              <div>
                <h4 className="font-heading text-3xl text-white tracking-[-1px] leading-none">2.4s</h4>
                <p className="text-[10px] text-white/50 font-body font-light mt-1.5">p50 Recall Latency on Arc</p>
              </div>
            </div>
            <div className="liquid-glass p-4 w-[190px] rounded-[1.25rem] text-left flex flex-col justify-between min-h-[120px]">
              <div className="text-[#4DE3FF]">
                <GlobeIcon />
              </div>
              <div>
                <h4 className="font-heading text-3xl text-white tracking-[-1px] leading-none">5.15%</h4>
                <p className="text-[10px] text-white/50 font-body font-light mt-1.5">USYC Yield APY</p>
              </div>
            </div>
          </motion.div>

        </div>

        {/* Bottom bar space below Hero */}
        <div className="relative z-20 w-full bg-transparent py-5 px-8 md:px-16 lg:px-24 flex flex-col sm:flex-row items-center justify-between border-t border-white/5 font-body text-xs text-white/65">
          <span className="uppercase tracking-widest text-[10px] font-semibold text-white/40 mb-2 sm:mb-0">Infrastructure Settlement Layer</span>
          <div className="flex items-center gap-6 md:gap-8 font-body text-xs font-semibold text-white/70">
            <span>Powered by</span>
            <span className="text-sm font-heading font-bold text-white uppercase tracking-wider">Arc</span>
            <span className="text-sm font-heading font-bold text-white uppercase tracking-wider">Circle</span>
            <span className="text-[#4DE3FF] text-sm font-heading font-bold uppercase tracking-wider">Photon</span>
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 2: CAPABILITIES / FEATURES ═══════ */}
      <section id="features" className="relative min-h-screen overflow-hidden bg-transparent flex flex-col justify-between border-t border-white/5">
        
        {/* Full-bleed background video */}
        <FadingVideo
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        {/* Content Container */}
        <div className="relative z-10 px-8 md:px-16 lg:px-24 pt-28 pb-12 flex flex-col min-h-screen justify-between w-full max-w-7xl mx-auto">
          
          {/* Header */}
          <div className="mb-auto">
            <span className="text-sm font-body text-white/60 tracking-wider block mb-4 uppercase">// Autonomous Routing</span>
            <h2 className="font-heading text-white text-6xl md:text-7xl lg:text-[6rem] leading-[0.85] tracking-[-3px]">
              Yield routing<br />redefined
            </h2>
          </div>

          {/* Three Capabilities Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 w-full">
            
            {/* Card 1: Autonomous Yield */}
            <div className="liquid-glass rounded-[1.25rem] p-6 min-h-[360px] flex flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-[0.75rem] liquid-glass flex items-center justify-center text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[70%]">
                  {["Auto-Detect", "No Latency", "Circle USYC", "Direct Arc"].map(tag => (
                    <span key={tag} className="liquid-glass rounded-full px-2.5 py-1 text-[10px] text-white/90 font-body whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="font-heading text-white text-3xl md:text-4xl tracking-[-1px] leading-none">Autonomous Yield</h3>
                <p className="mt-3 text-sm text-white/80 font-body font-light leading-relaxed max-w-[32ch]">
                  Detects idle USDC balances in your smart contracts or agent wallets, routing them into yield-bearing USYC in the background.
                </p>
              </div>
            </div>

            {/* Card 2: Sub-Second Recall */}
            <div className="liquid-glass rounded-[1.25rem] p-6 min-h-[360px] flex flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-[0.75rem] liquid-glass flex items-center justify-center text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[70%]">
                  {["Sub-Second", "Direct RPC", "USDC Native", "Callback"].map(tag => (
                    <span key={tag} className="liquid-glass rounded-full px-2.5 py-1 text-[10px] text-white/90 font-body whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="font-heading text-white text-3xl md:text-4xl tracking-[-1px] leading-none">Sub-Second Recall</h3>
                <p className="mt-3 text-sm text-white/80 font-body font-light leading-relaxed max-w-[32ch]">
                  We withdraw USDC back from yield pools the instant your app or agent triggers a transaction, keeping liquidity fully available.
                </p>
              </div>
            </div>

            {/* Card 3: Developer Native */}
            <div className="liquid-glass rounded-[1.25rem] p-6 min-h-[360px] flex flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-[0.75rem] liquid-glass flex items-center justify-center text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[70%]">
                  {["Circle SDK", "Agent-Native", "Arc RPC", "Audit Log"].map(tag => (
                    <span key={tag} className="liquid-glass rounded-full px-2.5 py-1 text-[10px] text-white/90 font-body whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="font-heading text-white text-3xl md:text-4xl tracking-[-1px] leading-none">Developer Native</h3>
                <p className="mt-3 text-sm text-white/80 font-body font-light leading-relaxed max-w-[32ch]">
                  Equip your bots and contracts with a single API call to yield-enable their entire operational treasury with zero custom plumbing.
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ═══════ SECTION 3: ARCHITECTURE & CODE INTEGRATION ═══════ */}
      <section id="architecture" className="relative min-h-screen bg-transparent border-t border-white/5 py-32 px-8 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Branding & Explanation */}
          <div>
            <span className="text-sm font-body text-white/60 tracking-wider block mb-4 uppercase">// Integration SDK</span>
            <h2 className="font-heading text-white text-5xl md:text-6xl tracking-[-2px] leading-none mb-6">
              Implement yield in ten lines of code
            </h2>
            <p className="text-white/85 font-body font-light leading-relaxed text-base mb-8 max-w-xl">
              FLOAT wraps Circle's Developer Stack and Arc L1 RPC nodes into a single autonomous client. It listens to contract events, triggers batch routing transactions, and maintains local gas reserves automatically.
            </p>
            
            {/* Specs checklist */}
            <div className="space-y-4">
              {[
                "Automatic reserve sizing protects gas budgets",
                "Full support for USYC yield settlement",
                "Sub-second recall using direct Arc node RPC callbacks",
                "Tamper-resistant local JSON state logs"
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white text-xs">✓</div>
                  <span className="text-sm text-white/90 font-body font-light">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Mock IDE */}
          <div className="liquid-glass rounded-[2rem] p-6 md:p-8 font-mono text-sm leading-relaxed border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white/20"></div>
                <div className="w-3 h-3 rounded-full bg-white/20"></div>
                <div className="w-3 h-3 rounded-full bg-white/20"></div>
              </div>
              <span className="text-xs text-white/40 font-body">float-agent.ts</span>
            </div>

            <pre className="text-white/90 overflow-x-auto text-[13px] md:text-sm">
              <code>
<span className="text-white/40">// Import FLOAT client SDK</span>{"\n"}
<span className="text-white/60">import</span> {"{"} FloatClient {"}"} <span className="text-white/60">from</span> <span className="text-white/50">"@float-yield/sdk"</span>;{"\n\n"}
 
<span className="text-white/40">// Initialize on the Arc L1 network</span>{"\n"}
<span className="text-white/60">const</span> float = <span className="text-white/60">new</span> <span className="text-white/90">FloatClient</span>({"{"}{"\n"}
{"  "}wallet: agentWallet,{"\n"}
{"  "}targetReserve: <span className="text-white/50">"auto"</span>, <span className="text-white/40">// Gas reserve buffer</span>{"\n"}
{"  "}yieldSource: <span className="text-white/50">"USYC"</span>,   <span className="text-white/40">// Yield token asset</span>{"\n"}
{"  "}provider: <span className="text-white/50">"https://rpc.arc-network.io"</span>{"\n"}
{"}"});{"\n\n"}
 
<span className="text-white/40">// Autonomously monitor and route idle balances</span>{"\n"}
<span className="text-white/60">await</span> float.<span className="text-white/90">startRouting</span>();{"\n"}
              </code>
            </pre>
          </div>

        </div>
      </section>

      {/* ═══════ SECTION 4: LIVE SIMULATION FEED ═══════ */}
      <section id="simulation" className="relative min-h-screen bg-transparent border-t border-white/5 py-32 px-8 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          
          <span className="text-sm font-body text-white/60 tracking-wider block mb-4 uppercase text-center">// Live Engine Demo</span>
          <h2 className="font-heading text-white text-5xl md:text-6xl tracking-[-2px] leading-none mb-12 text-center max-w-2xl">
            Watch the autonomous yield engine in real time
          </h2>

          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Col 1 & 2: Main Console */}
            <div className="lg:col-span-2 flex flex-col justify-between bg-white/[0.01] border border-white/10 rounded-[2rem] p-6 min-h-[480px]">
              
              {/* Header Info */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs text-white/60 uppercase tracking-widest font-body">Engine Active</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-white/40 font-body">Yield Source:</span>
                  <span className="text-xs text-white/90 font-medium ml-1.5 font-body bg-white/5 px-2 py-0.5 rounded-full">USYC (Circle Stack)</span>
                </div>
              </div>

              {/* Console Logs */}
              <div className="flex-1 my-6 font-mono text-[13px] leading-relaxed overflow-y-auto max-h-[260px] space-y-3.5 pr-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 text-white/80">
                    <span className="text-white/30">[{log.time}]</span>
                    <span className="text-white/60">[{log.agent}]</span>
                    <span className={`font-semibold ${
                      log.action === "PARK" ? "text-green-400" 
                      : log.action === "RECALL" ? "text-orange-400" 
                      : log.action === "RECALL_PENDING" ? "text-yellow-400 animate-pulse" 
                      : "text-white"
                    }`}>
                      {log.action}
                    </span>
                    <span className="text-white/40">${log.amount.toFixed(2)}</span>
                    <span className="text-white/70 flex-1">— {log.detail}</span>
                  </div>
                ))}
              </div>

              {/* Trigger Button Row */}
              <div className="flex items-center justify-between border-t border-white/5 pt-4 gap-4 flex-wrap">
                <button
                  onClick={triggerSimulation}
                  disabled={isSimulating}
                  className="bg-white text-black px-6 py-3 rounded-full text-sm font-semibold hover:bg-white/95 transition-all font-body flex items-center gap-2.5 disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin"></span>
                      Recalling USDC...
                    </>
                  ) : (
                    <>
                      Trigger Callback Transaction
                      <ArrowUpRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="text-right">
                  {simStep === 1 && <span className="text-xs text-yellow-400 font-body">Detecting active transaction...</span>}
                  {simStep === 2 && <span className="text-xs text-orange-400 font-body">RPC Callback: Recalling USDC from USYC...</span>}
                  {simStep === 3 && <span className="text-xs text-green-400 font-body">Recall complete! Latency: 2.4s</span>}
                  {simStep === 0 && <span className="text-xs text-white/30 font-body">Ready to test recall latency</span>}
                </div>
              </div>

            </div>

            {/* Col 3: Side Metrics Panel */}
            <div className="flex flex-col gap-6">
              
              {/* Metric 1: Accruing Yield */}
              <div className="liquid-glass rounded-[2rem] p-6 flex flex-col justify-between min-h-[228px]">
                <div className="text-white/50 text-xs font-body uppercase tracking-wider">// Yield Accrued</div>
                <div>
                  <h3 className="text-4xl md:text-5xl font-mono text-white leading-none tracking-tight">
                    ${yieldAccrued.toFixed(6)}
                  </h3>
                  <p className="text-xs text-white/40 font-body font-light mt-3">USYC yield accruing dynamically every second</p>
                </div>
              </div>

              {/* Metric 2: Total Deposited */}
              <div className="liquid-glass rounded-[2rem] p-6 flex flex-col justify-between min-h-[228px]">
                <div className="text-white/50 text-xs font-body uppercase tracking-wider">// Idle Capital Routed</div>
                <div>
                  <h3 className="text-4xl md:text-5xl font-mono text-white leading-none tracking-tight">
                    ${totalDeposited.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-white/40 font-body font-light mt-3">Total active USDC currently earning yield in USYC</p>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="bg-transparent border-t border-white/5 py-16 px-8 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h3 className="font-heading text-xl text-white tracking-[0.2em] mb-2 uppercase">
              FLO<span className="text-[#4DE3FF]">A</span>T
            </h3>
            <p className="text-xs text-white/40 font-body max-w-sm">
              FLOAT is a yield routing engine built on Circle developer infrastructure and the Arc L1 network. Yield products are backed by USYC stablecoin parking pools.
            </p>
          </div>
          <div className="flex items-center gap-8 font-body text-xs text-white/50">
            <a href="/dashboard" className="hover:text-white transition-colors">App Dashboard</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="https://developers.circle.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Circle Stack</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
