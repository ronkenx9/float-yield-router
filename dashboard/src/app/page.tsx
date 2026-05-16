"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const Plasma = dynamic(() => import('../components/Plasma'), { ssr: false });

export default function LandingPage() {
  return (
    <div className="site-wrapper">

      {/* ═══════ HERO ═══════ */}
      <section className="hero-page">
        <div className="plasma-bg">
          <Plasma
            color="#2a6fff"
            speed={0.5}
            direction="forward"
            scale={1.0}
            opacity={1}
            mouseInteractive={true}
          />
        </div>
        <div className="hero-vignette" />

        <header className="hero-header">
          <Link href="/dashboard" className="hero-header-btn">LAUNCH APP</Link>
          <Link href="#" className="hero-header-btn">MENU</Link>
        </header>

        <main className="hero-center">
          <p className="hero-flank hero-flank-left">ROUTES IDLE CAPITAL</p>
          <div className="hero-logo-block">
            <div className="hero-logo-glow" />
            <Image src="/flo-logo.png" alt="Flo" width={200} height={200} className="hero-logo-img" priority />
            <h1 className="hero-wordmark">FLOAT</h1>
          </div>
          <p className="hero-flank hero-flank-right">EARNS WHILE YOU BUILD</p>
        </main>

        <footer className="hero-bottom">
          <p className="hero-tagline">Idle capital, in motion.</p>
          <p className="hero-sub">
            FLOAT routes idle USDC into yield and pulls it back<br />
            the moment your app needs it.
          </p>
          <div className="hero-cta-row">
            <Link href="/dashboard" className="hero-cta-primary">BUILD ON FLOAT</Link>
            <Link href="#" className="hero-cta-ghost">EXPLORE DOCS</Link>
          </div>
        </footer>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section className="section-dark" id="how">
        <div className="section-inner">
          <p className="section-label">HOW IT WORKS</p>
          <h2 className="section-heading">Three steps. Zero friction.</h2>
          <div className="steps-grid">
            <div className="step-card">
              <span className="step-num">01</span>
              <h3>Detect</h3>
              <p>FLOAT monitors your wallet for idle USDC sitting between transactions. No config required.</p>
            </div>
            <div className="step-card">
              <span className="step-num">02</span>
              <h3>Route</h3>
              <p>Capital is automatically swept into yield-bearing USYC via Franklin Templeton&apos;s tokenized fund.</p>
            </div>
            <div className="step-card">
              <span className="step-num">03</span>
              <h3>Recall</h3>
              <p>The instant your app needs liquidity, FLOAT pulls funds back in under 800ms. Seamless.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ ECOSYSTEM ═══════ */}
      <section className="section-deep" id="ecosystem">
        <div className="section-inner">
          <p className="section-label">ECOSYSTEM</p>
          <h2 className="section-heading">Built for Arc. Built for builders.</h2>
          <p className="section-sub">
            Arc is the stablecoin-native L1 with dollar-denominated fees and sub-second finality.
            FLOAT is the capital efficiency layer that makes every Arc app more productive.
          </p>
          <div className="integrations-showcase">
            <div className="int-card">
              <div className="int-icon">⚡</div>
              <h4>ArcPerps</h4>
              <p>Margin vaults earn yield between trades</p>
            </div>
            <div className="int-card">
              <div className="int-icon">💳</div>
              <h4>WizPay</h4>
              <p>Payroll reserves earn until disbursement</p>
            </div>
            <div className="int-card">
              <div className="int-icon">🤖</div>
              <h4>Arcade</h4>
              <p>Agent fees earn between task executions</p>
            </div>
            <div className="int-card">
              <div className="int-icon">🔒</div>
              <h4>Your App</h4>
              <p>Integrate in 20 minutes with our SDK</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ NUMBERS ═══════ */}
      <section className="section-dark" id="numbers">
        <div className="section-inner">
          <div className="stats-row">
            <div className="stat-block">
              <span className="stat-value">~4.8%</span>
              <span className="stat-label">APY via USYC</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-block">
              <span className="stat-value">&lt;800ms</span>
              <span className="stat-label">Recall Speed</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-block">
              <span className="stat-value">0</span>
              <span className="stat-label">Config Required</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-block">
              <span className="stat-value">20 min</span>
              <span className="stat-label">SDK Integration</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SDK ═══════ */}
      <section className="section-deep" id="sdk">
        <div className="section-inner">
          <p className="section-label">FOR DEVELOPERS</p>
          <h2 className="section-heading">Ship in minutes.</h2>
          <p className="section-sub">One package. Two lines. Your idle capital starts earning.</p>
          <div className="code-block">
            <div className="code-header">
              <span className="code-dot red" />
              <span className="code-dot yellow" />
              <span className="code-dot green" />
              <span className="code-lang">Terminal</span>
            </div>
            <pre className="code-body"><code>{`npm install @float/arc

import { FloatClient } from '@float/arc'

const float = new FloatClient({
  rpcUrl: 'https://arc-testnet.rpc.caldera.xyz',
  privateKey: process.env.PRIVATE_KEY,
})

// That's it. Idle USDC now earns yield.
await float.enableAutoFloat()`}</code></pre>
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="section-cta">
        <div className="section-inner">
          <h2 className="cta-heading">Your capital should never sit still.</h2>
          <p className="section-sub" style={{ margin: '0 auto' }}>Start building on FLOAT today.</p>
          <div className="hero-cta-row" style={{ marginTop: '2rem' }}>
            <Link href="/dashboard" className="hero-cta-primary">LAUNCH DASHBOARD</Link>
            <Link href="#" className="hero-cta-ghost">READ THE DOCS</Link>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Image src="/flo-logo.png" alt="Flo" width={24} height={24} />
            <span>FLOAT</span>
          </div>
          <div className="footer-links">
            <Link href="#">Product</Link>
            <Link href="#">Developers</Link>
            <Link href="#">GitHub</Link>
            <Link href="#">Twitter</Link>
          </div>
          <p className="footer-copy">© 2025 FLOAT Protocol. Built on Arc.</p>
        </div>
      </footer>
    </div>
  );
}
