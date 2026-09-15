"use client";

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import BorderGlow from '../../components/BorderGlow';

const Plasma = dynamic(() => import('../../components/Plasma'), { ssr: false });

interface ActivityEntry {
  id: number | string;
  type: 'route' | 'recall' | 'detect';
  action: string;
  desc: string;
  amount: string;
  time: string;
  status: 'completed' | 'routing' | 'pending' | 'failed';
  txHash?: string;
}

// Abstract F Capsule SVG Logo Mark
const FloatLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 36 36" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <g filter="url(#glow)">
      <rect x="2" y="6" width="32" height="24" rx="6" fill="#070B12" stroke="url(#logo-border)" strokeWidth="1.5" />
      <path d="M8 12.5H28C28.8284 12.5 29.5 13.1716 29.5 14C29.5 14.8284 28.8284 15.5 28 15.5H14V19.5H24C24.8284 19.5 25.5 20.1716 25.5 21C25.5 21.8284 24.8284 22.5 24 22.5H14V27.5C14 28.3284 13.3284 29 12.5 29C11.6716 29 11 28.3284 11 27.5V15.5H8C7.17157 15.5 6.5 14.8284 6.5 14C6.5 13.1716 7.17157 12.5 8 12.5Z" fill="url(#logo-grad)" />
    </g>
    <defs>
      <linearGradient id="logo-grad" x1="6.5" y1="12.5" x2="29.5" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4DE3FF" />
        <stop offset="0.5" stopColor="#2775CA" />
        <stop offset="1" stopColor="#7CFFB2" />
      </linearGradient>
      <linearGradient id="logo-border" x1="2" y1="6" x2="34" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="rgba(77, 227, 255, 0.4)" />
        <stop offset="1" stopColor="rgba(39, 117, 202, 0.1)" />
      </linearGradient>
      <filter id="glow" x="-2" y="-2" width="40" height="40" filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  </svg>
);

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [demoRunning, setDemoRunning] = useState(false);
  const [idleManaged, setIdleManaged] = useState(0);
  const [yieldCaptured, setYieldCaptured] = useState(0);
  const [activeRoutes, setActiveRoutes] = useState(0);
  const [agents, setAgents] = useState<any[]>([]);
  const [liveApy, setLiveApy] = useState('5.15%');
  const [p50Latency, setP50Latency] = useState<number | null>(null);

  // Tab: Rules & Parameters States
  const [sweepDelay, setSweepDelay] = useState(30);
  const [sweepPercent, setSweepPercent] = useState(80);
  const [emergencyReserve, setEmergencyReserve] = useState(20);
  const [selectedStrategy, setSelectedStrategy] = useState('USYC');
  const [isRulesSaved, setIsRulesSaved] = useState(false);

  // Tab: Yield Calculator State
  const [calculatorInput, setCalculatorInput] = useState('10000');

  // Flo Speech Bubble Text State
  const [floBubble, setFloBubble] = useState("Everything is running smoothly. Capital is earning yield on Arc.");

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/agent');
      const data = await res.json();
      setActivities(data.activities || []);
      setIdleManaged(data.idleManaged || 0);
      setYieldCaptured(data.yieldCaptured || 0);
      const activeCount = (data.agents || []).filter((a: any) => a.parkedBalance > 0).length;
      setActiveRoutes(activeCount);
      setAgents(data.agents || []);
      if (data.vault && data.vault.targetApyLabel) {
        setLiveApy(data.vault.targetApyLabel);
      }
      if (data.latencyStats && typeof data.latencyStats.p50 === 'number') {
        setP50Latency(data.latencyStats.p50);
      }
    } catch (e) {
      console.error('Failed to fetch agent state:', e);
    }
  }, []);

  useEffect(() => { 
    setMounted(true); 
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Adjust Flo's speech bubble content based on activeNav tab selection
  useEffect(() => {
    if (demoRunning) return; // Keep demo bubble overrides
    
    switch (activeNav) {
      case 'dashboard':
        setFloBubble("All subagents are active on Arc-testnet. P50 recall latency is currently " + (p50Latency ? `${(p50Latency/1000).toFixed(2)}s` : '0.8s') + ".");
        break;
      case 'routes':
        setFloBubble("Configure your automatic sweep parameters. Sweeping USDC into USYC is optimized when idle for >30s.");
        break;
      case 'yield':
        setFloBubble("Calculating yield options. Franklin USYC is yielding a real-time " + liveApy + " on Arc-testnet.");
        break;
      case 'activity':
        setFloBubble("Scanning transaction ledger and Critic auditor feedback logs.");
        break;
      case 'integrations':
        setFloBubble("FLOAT is optimized for mock app connections including WizPay, Arcade, and ArcPerps.");
        break;
      case 'sdk':
        setFloBubble("Copy the initialization snippet. Integrate FLOAT into any Arc agent in under 20 lines of code.");
        break;
    }
  }, [activeNav, p50Latency, liveApy, demoRunning]);

  const runDemo = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    
    setFloBubble("Simulating pay event trigger. Detecting idle USDC on WizPay wallet...");
    
    const pendingActivity: ActivityEntry = {
      id: Date.now(), type: 'detect', action: 'Simulating payment event...',
      desc: 'Triggering trade simulator request', amount: '---', time: 'Just now', status: 'pending'
    };
    setActivities(prev => [pendingActivity, ...prev.slice(0, 4)]);

    try {
      const res = await fetch('/api/agent/simulate', { method: 'POST' });
      const data = await res.json();
      setActivities(data.activities || []);
      setIdleManaged(data.idleManaged || 0);
      setYieldCaptured(data.yieldCaptured || 0);
      const activeCount = (data.agents || []).filter((a: any) => a.parkedBalance > 0).length;
      setActiveRoutes(activeCount);
      setAgents(data.agents || []);
      if (data.vault && data.vault.targetApyLabel) {
        setLiveApy(data.vault.targetApyLabel);
      }
      if (data.latencyStats && typeof data.latencyStats.p50 === 'number') {
        setP50Latency(data.latencyStats.p50);
      }
      setFloBubble("Simulation complete! Routed idle capital, processed withdrawal execution in " + (data.latencyStats?.p50 || 780) + "ms.");
    } catch (e) {
      console.error('Simulation failed:', e);
      setFloBubble("Simulation encounterd an error.");
    }

    setDemoRunning(false);
  }, [demoRunning]);

  const handleSaveRules = () => {
    setIsRulesSaved(true);
    setFloBubble("Rules updated! Sweep threshold set to " + sweepDelay + "s and reserve set to " + emergencyReserve + "%.");
    setTimeout(() => setIsRulesSaved(false), 3000);
  };

  if (!mounted) return null;

  const navItems = [
    { id: 'dashboard', icon: '◉', label: 'Dashboard' },
    { id: 'routes', icon: '⇄', label: 'Rules' },
    { id: 'yield', icon: '↗', label: 'Yield' },
    { id: 'activity', icon: '◷', label: 'Ledger' },
    { id: 'integrations', icon: '⊞', label: 'Integrations' },
    { id: 'sdk', icon: '⌥', label: 'SDK' },
  ];

  // Helper to choose Flo mascot image dynamically
  const getFloMascotImage = () => {
    if (demoRunning) return "/flo-routing.png";
    switch (activeNav) {
      case 'dashboard':
        return "/flo-calm.png";
      case 'routes':
        return "/flo-helpful.png";
      case 'yield':
        return "/flo-focused.png";
      case 'activity':
        return "/flo-scanning.png";
      case 'integrations':
        return "/flo-helpful.png";
      case 'sdk':
        return "/flo-calm.png";
      default:
        return "/flo-calm.png";
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#05070B' }}>
      {/* Background Plasma Layer */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.9 }}>
        <Plasma
          color="#143bff"
          speed={0.35}
          direction="forward"
          scale={1.2}
          opacity={1}
          mouseInteractive={true}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 0%, rgba(5,7,11,0.7) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(5, 7, 11, 0.3)' }} />
      </div>

      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar animate-in">
          <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1.5rem' }}>
            <FloatLogo className="w-8 h-8" />
            <div>
              <h1 style={{ fontSize: '1.25rem', letterSpacing: '0.12em', margin: 0 }}>FLOAT</h1>
              <p style={{ margin: 0, fontSize: '0.55rem', opacity: 0.5 }}>Arc-Native Engine</p>
            </div>
          </div>
          <nav className="sidebar-nav">
            {navItems.map(item => (
              <button
                key={item.id}
                className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
                onClick={() => setActiveNav(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="agent-status">
              <div className="status-dot"></div>
              <span style={{ fontWeight: 500 }}>Engine Active</span>
            </div>
            <p style={{ fontFamily: 'Geist', fontSize: '0.6875rem', color: 'rgba(245, 247, 250, 0.4)', marginTop: '0.5rem', letterSpacing: '0.05em' }}>
              Arc Testnet · 0.8s block finality
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <div className="main-header animate-in stagger-1">
            <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.5rem', color: '#F5F7FA' }}>
              {activeNav === 'dashboard' ? 'Command Center' : activeNav === 'routes' ? 'Sweep Rules Builder' : activeNav === 'yield' ? 'Yield Analytics' : activeNav === 'activity' ? 'Audit Ledger' : activeNav === 'integrations' ? 'Ecosystem Integrations' : 'Developer SDK'}
            </h2>
            <div className="header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="system-badge" style={{ background: 'rgba(77, 227, 255, 0.05)', color: '#4DE3FF', borderColor: 'rgba(77, 227, 255, 0.2)', padding: '0.4rem 1rem', borderRadius: '100px', fontSize: '0.75rem', fontFamily: 'Geist' }}>
                <span className="status-dot" style={{ display: 'inline-block', marginRight: '0.5rem', width: '6px', height: '6px', background: '#4DE3FF', boxShadow: '0 0 8px #4DE3FF' }}></span>
                All Systems Operational
              </div>
              <BorderGlow borderRadius={100} glowRadius={15} glowColor="190 100 65" backgroundColor="transparent" edgeSensitivity={50}>
                <button className="btn-demo" onClick={runDemo} disabled={demoRunning} style={{ border: 'none', background: 'rgba(77, 227, 255, 0.12)', color: '#4DE3FF', padding: '0.6rem 1.5rem', borderRadius: '100px', cursor: 'pointer', fontFamily: 'Geist', fontSize: '0.8125rem', fontWeight: 600 }}>
                  {demoRunning ? '⟳ Simulating...' : '▶ Simulate Payment Event'}
                </button>
              </BorderGlow>
            </div>
          </div>

          {/* TAB 1: DASHBOARD */}
          {activeNav === 'dashboard' && (
            <>
              {/* Metrics Grid */}
              <div className="metrics-grid animate-in stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                    <div className="metric-label" style={{ color: '#8C96A8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      <span className="metric-icon" style={{ color: '#4DE3FF', marginRight: '0.5rem' }}>◈</span> Idle Capital Managed
                    </div>
                    <div className="metric-value cyan" style={{ fontFamily: 'Geist Mono', fontSize: '2rem', fontWeight: 700, color: '#4DE3FF' }}>
                      {idleManaged >= 100000 ? `$${(idleManaged / 1_000_000).toFixed(2)}M` : `$${idleManaged.toFixed(2)}`}
                    </div>
                    <div className="metric-sub" style={{ fontSize: '0.75rem', color: '#8C96A8', marginTop: '0.5rem' }}>Across {activeRoutes} active routes</div>
                  </div>
                </BorderGlow>

                <BorderGlow borderRadius={20} glowRadius={30} glowColor="145 100 74" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40} colors={['#7CFFB2', '#4DE3FF', '#7CFFB2']}>
                  <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                    <div className="metric-label" style={{ color: '#8C96A8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      <span className="metric-icon" style={{ color: '#7CFFB2', marginRight: '0.5rem' }}>↗</span> Yield Captured
                    </div>
                    <div className="metric-value mint" style={{ fontFamily: 'Geist Mono', fontSize: '2rem', fontWeight: 700, color: '#7CFFB2' }}>
                      ${yieldCaptured.toFixed(6)}
                    </div>
                    <div className="metric-sub" style={{ fontSize: '0.75rem', color: '#8C96A8', marginTop: '0.5rem' }}>Real-time USYC APY: <span style={{ color: '#7CFFB2', fontWeight: 600 }}>{liveApy}</span></div>
                  </div>
                </BorderGlow>

                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                    <div className="metric-label" style={{ color: '#8C96A8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      <span className="metric-icon" style={{ color: '#4DE3FF', marginRight: '0.5rem' }}>⇄</span> Active Routes
                    </div>
                    <div className="metric-value cyan" style={{ fontFamily: 'Geist Mono', fontSize: '2rem', fontWeight: 700, color: '#4DE3FF' }}>
                      {activeRoutes}
                    </div>
                    <div className="metric-sub" style={{ fontSize: '0.75rem', color: '#8C96A8', marginTop: '0.5rem' }}>Optimizing 3 subagents</div>
                  </div>
                </BorderGlow>

                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                    <div className="metric-label" style={{ color: '#8C96A8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      <span className="metric-icon" style={{ color: '#4DE3FF', marginRight: '0.5rem' }}>⏱</span> Avg Recall Speed
                    </div>
                    <div className="metric-value cyan" style={{ fontFamily: 'Geist Mono', fontSize: '2rem', fontWeight: 700, color: '#4DE3FF' }}>
                      {p50Latency ? `${(p50Latency / 1000).toFixed(2)}s` : '0.8s'}
                    </div>
                    <div className="metric-sub" style={{ fontSize: '0.75rem', color: '#8C96A8', marginTop: '0.5rem' }}>{p50Latency ? `Measured p50: ${p50Latency}ms` : 'Arc sub-second finality'}</div>
                  </div>
                </BorderGlow>
              </div>

              {/* Content Grid */}
              <div className="content-grid animate-in stagger-3" style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '2rem', marginBottom: '2rem' }}>
                {/* Activity Feed */}
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div className="panel" style={{ border: 'none', background: 'transparent', padding: '2rem' }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <span className="panel-title" style={{ fontFamily: 'Space Grotesk', fontSize: '1.1rem', fontWeight: 600 }}>Recent Routing Activity</span>
                      <button className="panel-link" onClick={() => setActiveNav('activity')} style={{ background: 'none', border: 'none', color: '#4DE3FF', fontSize: '0.75rem', cursor: 'pointer' }}>View all ledger</button>
                    </div>
                    <div className="activity-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {activities.slice(0, 5).map(activity => (
                        <div className="activity-item" key={activity.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(245, 247, 250, 0.02)', border: '1px solid rgba(245,247,250,0.03)', borderRadius: '12px' }}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div className={`activity-icon ${activity.type}`} style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: activity.type === 'route' ? 'rgba(124, 255, 178, 0.1)' : activity.type === 'recall' ? 'rgba(77, 227, 255, 0.1)' : 'rgba(255, 200, 87, 0.1)', color: activity.type === 'route' ? '#7CFFB2' : activity.type === 'recall' ? '#4DE3FF' : '#FFC857' }}>
                              {activity.type === 'route' ? '↗' : activity.type === 'recall' ? '↙' : '◎'}
                            </div>
                            <div className="activity-details">
                              <div className="activity-action" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{activity.action}</div>
                              <div className="activity-desc" style={{ fontSize: '0.75rem', color: '#8C96A8' }}>{activity.desc}</div>
                            </div>
                          </div>
                          <div className="activity-meta" style={{ textAlign: 'right' }}>
                            <div className="activity-amount" style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'Geist Mono' }}>{activity.amount}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                              <span className={`activity-badge ${activity.status}`} style={{ textTransform: 'uppercase', fontSize: '0.55rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: activity.status === 'completed' ? 'rgba(124, 255, 178, 0.1)' : 'rgba(255, 200, 87, 0.1)', color: activity.status === 'completed' ? '#7CFFB2' : '#FFC857' }}>{activity.status}</span>
                              <span className="activity-time" style={{ fontSize: '0.6875rem', color: '#8C96A8' }}>{activity.time}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </BorderGlow>

                {/* Right Column: Flo Mascot Speec Bubble Card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <BorderGlow borderRadius={20} glowRadius={50} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={80} colors={['#4DE3FF', '#7CFFB2', '#FFC857']}>
                    <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem', border: 'none', background: 'transparent' }}>
                      <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '1.25rem', fontWeight: 600, color: '#F5F7FA', marginBottom: '0.25rem' }}>Flo Companion</h3>
                      <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.4)', marginBottom: '1.5rem' }}>Capital Optimizer Active</p>
                      
                      {/* Interactive mascot avatar based on state */}
                      <div style={{ width: '130px', height: '130px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '50%', border: '1px solid rgba(245,247,250,0.05)', boxShadow: 'inset 0 0 15px rgba(0,0,0,0.6)' }}>
                        <Image 
                          src={getFloMascotImage()} 
                          alt="Flo Mascot Expression" 
                          width={110} 
                          height={110} 
                          style={{ objectFit: 'contain', filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.5))' }}
                          priority
                        />
                      </div>

                      <div style={{ background: '#070B12', border: '1px solid rgba(245, 247, 250, 0.04)', borderRadius: '12px', padding: '1rem', width: '100%', position: 'relative', marginBottom: '1rem' }}>
                        <div style={{ position: 'absolute', width: '8px', height: '8px', background: '#070B12', borderLeft: '1px solid rgba(245, 247, 250, 0.04)', borderTop: '1px solid rgba(245, 247, 250, 0.04)', top: '-5px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' }}></div>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.5 }}>
                          &ldquo;{floBubble}&rdquo;
                        </p>
                      </div>

                      <button onClick={() => setActiveNav('routes')} className="btn-flo-help" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'rgba(77, 227, 255, 0.05)', border: '1px solid rgba(77, 227, 255, 0.15)', color: '#4DE3FF', padding: '0.6rem 1.5rem', borderRadius: '100px', cursor: 'pointer', fontFamily: 'Geist', fontSize: '0.8125rem' }}>
                        <span>✧</span> Adjust Sweep Rules
                      </button>
                    </div>
                  </BorderGlow>
                </div>
              </div>

              {/* Subagents Grid */}
              <div className="animate-in stagger-4" style={{ marginBottom: '4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.1rem', fontWeight: 600, color: '#F5F7FA' }}>Active Subagents</h3>
                  <span style={{ fontFamily: 'Geist', fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.4)' }}>{agents.length} subagents monitored</span>
                </div>
                
                <div className="integrations-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                  {agents.map(agent => {
                    const avatarColor = agent.agentId === 'trader-a' ? '#4DE3FF' 
                                      : agent.agentId === 'trader-b' ? '#7CFFB2' 
                                      : '#FFC857';
                    
                    const glowColor = agent.agentId === 'trader-a' ? '190 100 65' 
                                    : agent.agentId === 'trader-b' ? '145 100 74' 
                                    : '45 100 67';
                                    
                    const totalCapital = (agent.liquidBalance || 0) + (agent.parkedBalance || 0);

                    return (
                      <BorderGlow key={agent.agentId} borderRadius={20} glowRadius={30} glowColor={glowColor} backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                        <div className="integration-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                          <div>
                            <div className="integration-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <div className="integration-avatar" style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `rgba(${glowColor.split(' ').join(',')}, 0.08)`, color: avatarColor, fontWeight: 700, fontSize: '0.875rem' }}>
                                  {agent.label.split(' ')[1]}
                                </div>
                                <div>
                                  <div className="integration-name" style={{ fontWeight: 600, fontSize: '0.875rem' }}>{agent.label}</div>
                                  <div className="integration-type" style={{ textTransform: 'capitalize', fontSize: '0.6875rem', opacity: 0.5 }}>{agent.strategy} strategy</div>
                                </div>
                              </div>
                              <span className={`activity-badge ${agent.status.toLowerCase() === 'idle' ? 'completed' : agent.status.toLowerCase() === 'cooldown' ? 'pending' : 'failed'}`} style={{ textTransform: 'uppercase', fontSize: '0.55rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: agent.status.toLowerCase() === 'idle' ? 'rgba(124, 255, 178, 0.1)' : 'rgba(255, 200, 87, 0.1)', color: agent.status.toLowerCase() === 'idle' ? '#7CFFB2' : '#FFC857' }}>
                                {agent.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'rgba(245,247,250,0.3)', fontFamily: 'Geist Mono', wordBreak: 'break-all', marginTop: '0.75rem' }}>
                              Wallet: {agent.walletId ? `${agent.walletId.slice(0, 8)}...${agent.walletId.slice(-8)}` : 'Loading...'}
                            </div>
                          </div>
                          
                          <div className="integration-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '1.5rem', gap: '0.5rem', borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem' }}>
                            <div>
                              <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4, textTransform: 'uppercase' }}>Liquid</div>
                              <div className="integration-stat-value" style={{ color: '#F5F7FA', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'Geist Mono' }}>${(agent.liquidBalance || 0).toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4, textTransform: 'uppercase' }}>Parked</div>
                              <div className="integration-stat-value" style={{ color: '#4DE3FF', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'Geist Mono' }}>${(agent.parkedBalance || 0).toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4, textTransform: 'uppercase' }}>Total</div>
                              <div className="integration-stat-value" style={{ color: '#7CFFB2', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'Geist Mono' }}>${totalCapital.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      </BorderGlow>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: RULES BUILDER */}
          {activeNav === 'routes' && (
            <div className="animate-in stagger-2" style={{ maxWidth: '800px', margin: '0 auto 4rem' }}>
              <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                <div style={{ padding: '2.5rem' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Capital Routing Parameters</h3>
                  <p style={{ fontSize: '0.8125rem', color: '#8C96A8', marginBottom: '2.5rem', lineHeight: 1.5 }}>
                    Define sweep thresholds and yield strategy configurations. The FLOAT routing client will automatically manage wallet liquidity based on these variables.
                  </p>

                  {/* Sweep Delay Parameter */}
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#F5F7FA' }}>Idle Sweep Threshold</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '0.875rem', color: '#4DE3FF', fontWeight: 600 }}>{sweepDelay} seconds</span>
                    </div>
                    <input 
                      type="range" min="10" max="300" step="10" 
                      value={sweepDelay} 
                      onChange={(e) => setSweepDelay(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#4DE3FF' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#8C96A8', marginTop: '0.5rem' }}>
                      <span>10s (High frequency)</span>
                      <span>5 mins</span>
                    </div>
                  </div>

                  {/* Sweep Percentage Slider */}
                  <div style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#F5F7FA' }}>Yield Allocation Percentage</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '0.875rem', color: '#4DE3FF', fontWeight: 600 }}>{sweepPercent}% Swept / {100 - sweepPercent}% Reserve</span>
                    </div>
                    <input 
                      type="range" min="10" max="100" step="5" 
                      value={sweepPercent} 
                      onChange={(e) => {
                        setSweepPercent(Number(e.target.value));
                        setEmergencyReserve(100 - Number(e.target.value));
                      }}
                      style={{ width: '100%', accentColor: '#4DE3FF' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#8C96A8', marginTop: '0.5rem' }}>
                      <span>10% (Conservative)</span>
                      <span>100% (Full yield capture)</span>
                    </div>
                  </div>

                  {/* Strategy Picker */}
                  <div style={{ marginBottom: '3rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#F5F7FA' }}>Yield Destination Primitive</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div 
                        onClick={() => setSelectedStrategy('USYC')}
                        style={{ background: selectedStrategy === 'USYC' ? 'rgba(77, 227, 255, 0.05)' : 'rgba(245,247,250,0.01)', border: selectedStrategy === 'USYC' ? '1px solid #4DE3FF' : '1px solid rgba(245,247,250,0.05)', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#F5F7FA' }}>Franklin USYC Vault</span>
                          <span style={{ color: '#7CFFB2', fontSize: '0.75rem', fontWeight: 600 }}>{liveApy} APY</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.4 }}>Tokenized Treasury securities with instant on-chain redemptions.</p>
                      </div>
                      
                      <div 
                        onClick={() => setSelectedStrategy('LIQUID')}
                        style={{ background: selectedStrategy === 'LIQUID' ? 'rgba(77, 227, 255, 0.05)' : 'rgba(245,247,250,0.01)', border: selectedStrategy === 'LIQUID' ? '1px solid #4DE3FF' : '1px solid rgba(245,247,250,0.05)', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#F5F7FA' }}>USDC Liquid Reserve</span>
                          <span style={{ color: '#8C96A8', fontSize: '0.75rem', fontWeight: 600 }}>0.00% APY</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.4 }}>Keeps stablecoins un-routed in the local wallet without external smart contract interactions.</p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveRules}
                    style={{ width: '100%', padding: '0.85rem', background: '#4DE3FF', color: '#070B12', border: 'none', borderRadius: '100px', cursor: 'pointer', fontFamily: 'Geist', fontWeight: 600, fontSize: '0.8125rem' }}
                  >
                    {isRulesSaved ? '✓ PARAMETERS COMMITTED TO ARC' : 'COMMIT RULES'}
                  </button>
                </div>
              </BorderGlow>
            </div>
          )}

          {/* TAB 3: YIELD CALCULATOR */}
          {activeNav === 'yield' && (
            <div className="animate-in stagger-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', maxWidth: '1100px', margin: '0 auto 4rem' }}>
              
              {/* Calculator Box */}
              <BorderGlow borderRadius={20} glowRadius={30} glowColor="145 100 74" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40} colors={['#7CFFB2', '#4DE3FF']}>
                <div style={{ padding: '2.5rem' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>USYC Yield Projection Calculator</h3>
                  
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#8C96A8', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Average Idle Capital Balance (USDC)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'Geist Mono', color: '#F5F7FA', fontWeight: 600 }}>$</span>
                      <input 
                        type="number" 
                        value={calculatorInput}
                        onChange={(e) => setCalculatorInput(e.target.value)}
                        style={{ width: '100%', background: '#070B12', border: '1px solid rgba(245,247,250,0.06)', borderRadius: '12px', padding: '1rem 1rem 1rem 2.25rem', color: '#F5F7FA', fontFamily: 'Geist Mono', fontSize: '1.25rem', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  {/* Calculations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid rgba(245,247,250,0.06)', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#8C96A8' }}>Annual APY Rate</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '0.875rem', color: '#7CFFB2', fontWeight: 600 }}>{liveApy}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#8C96A8' }}>Projected Daily Earnings</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '1rem', color: '#F5F7FA', fontWeight: 600 }}>
                        ${((Number(calculatorInput || 0) * (parseFloat(liveApy) / 100)) / 365).toFixed(4)} USDC
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#8C96A8' }}>Projected Monthly Earnings</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '1.1rem', color: '#F5F7FA', fontWeight: 600 }}>
                        ${((Number(calculatorInput || 0) * (parseFloat(liveApy) / 100)) / 12).toFixed(2)} USDC
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(245,247,250,0.04)', paddingTop: '1rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#8C96A8', fontWeight: 600 }}>Projected Annual Yield</span>
                      <span style={{ fontFamily: 'Geist Mono', fontSize: '1.5rem', color: '#7CFFB2', fontWeight: 700 }}>
                        ${(Number(calculatorInput || 0) * (parseFloat(liveApy) / 100)).toFixed(2)} USDC
                      </span>
                    </div>
                  </div>
                </div>
              </BorderGlow>

              {/* Chart Visualizer */}
              <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                <div style={{ padding: '2.5rem', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Franklin USYC Growth Curve</h3>
                    <p style={{ fontSize: '0.75rem', color: '#8C96A8' }}>Visualizing compounding interest over a 12-month period.</p>
                  </div>

                  {/* Simulated SVG Graph */}
                  <div style={{ width: '100%', height: '160px', marginTop: '2rem', marginBottom: '1rem', position: 'relative' }}>
                    <svg viewBox="0 0 300 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <path 
                        d="M 0 110 Q 75 100 150 75 T 300 10" 
                        fill="none" 
                        stroke="url(#chart-grad)" 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                      />
                      {/* Grid Lines */}
                      <line x1="0" y1="110" x2="300" y2="110" stroke="rgba(245,247,250,0.03)" strokeWidth="1" />
                      <line x1="0" y1="75" x2="300" y2="75" stroke="rgba(245,247,250,0.03)" strokeWidth="1" />
                      <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(245,247,250,0.03)" strokeWidth="1" />
                      
                      <defs>
                        <linearGradient id="chart-grad" x1="0" y1="110" x2="300" y2="10" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#4DE3FF" />
                          <stop offset="1" stopColor="#7CFFB2" />
                        </linearGradient>
                      </defs>
                    </svg>
                    
                    {/* Graph Labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: '#8C96A8', marginTop: '0.5rem', fontFamily: 'Geist Mono' }}>
                      <span>Month 1</span>
                      <span>Month 6</span>
                      <span>Month 12</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#8C96A8', fontStyle: 'italic', borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem' }}>
                    * Compound calculation assumes constant {liveApy} APY rate.
                  </div>
                </div>
              </BorderGlow>

            </div>
          )}

          {/* TAB 4: AUDIT LEDGER */}
          {activeNav === 'activity' && (
            <div className="animate-in stagger-2" style={{ maxWidth: '1000px', margin: '0 auto 4rem' }}>
              <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                <div style={{ padding: '2.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600 }}>Decisions & Audit Stream</h3>
                    <span style={{ fontSize: '0.75rem', color: '#8C96A8', fontFamily: 'Geist Mono' }}>Total logged transactions: {activities.length}</span>
                  </div>

                  {/* Ledger Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(245,247,250,0.08)', color: '#8C96A8' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Operation</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Reason / Parameters</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Amount</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Receipt Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map((activity, i) => (
                          <tr key={activity.id || i} style={{ borderBottom: '1px solid rgba(245,247,250,0.04)', color: '#F5F7FA' }}>
                            <td style={{ padding: '1rem', fontFamily: 'Geist Mono', fontSize: '0.75rem', color: '#8C96A8' }}>{activity.time}</td>
                            <td style={{ padding: '1rem', fontWeight: 600 }}>
                              <span style={{ color: activity.type === 'route' ? '#7CFFB2' : activity.type === 'recall' ? '#4DE3FF' : '#FFC857' }}>
                                {activity.type === 'route' ? 'SWEEP (USYC)' : activity.type === 'recall' ? 'RECALL (USDC)' : 'DETECTION'}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', color: '#8C96A8' }}>{activity.desc}</td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'Geist Mono', fontWeight: 600 }}>{activity.amount}</td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                              <span style={{ textTransform: 'uppercase', fontSize: '0.625rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: activity.status === 'completed' ? 'rgba(124, 255, 178, 0.08)' : 'rgba(255, 200, 87, 0.08)', color: activity.status === 'completed' ? '#7CFFB2' : '#FFC857' }}>
                                {activity.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </BorderGlow>
            </div>
          )}

          {/* TAB 5: INTEGRATIONS */}
          {activeNav === 'integrations' && (
            <div className="animate-in stagger-2" style={{ maxWidth: '1000px', margin: '0 auto 4rem' }}>
              <div style={{ marginBottom: '2.5rem' }}>
                <p style={{ fontSize: '0.8125rem', color: '#8C96A8', lineHeight: 1.5 }}>
                  Embedded application connectors. FLOAT acts as background infrastructure, sweeping idle reserves underneath these products without delaying user actions.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Integration 1: WizPay */}
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <span style={{ fontFamily: 'Space Grotesk', fontSize: '1.1rem', fontWeight: 600 }}>WizPay Payroll</span>
                        <span style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', background: 'rgba(124, 255, 178, 0.08)', color: '#7CFFB2', borderRadius: '4px', textTransform: 'uppercase' }}>Optimized</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                        Sweeps payroll reserves automatically into USYC during the bi-weekly funding windows, recalling them instantly on disbursement day.
                      </p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#8C96A8' }}>Active Reserves Managed:</span>
                      <span style={{ fontFamily: 'Geist Mono', fontWeight: 600 }}>$14,200.00 USDC</span>
                    </div>
                  </div>
                </BorderGlow>

                {/* Integration 2: Arcade */}
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <span style={{ fontFamily: 'Space Grotesk', fontSize: '1.1rem', fontWeight: 600 }}>Arcade Agent Escrow</span>
                        <span style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', background: 'rgba(124, 255, 178, 0.08)', color: '#7CFFB2', borderRadius: '4px', textTransform: 'uppercase' }}>Optimized</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                        Bridges agent funding deposits and marketplace escrow balances into yield between work task validations on the L1.
                      </p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#8C96A8' }}>Active Reserves Managed:</span>
                      <span style={{ fontFamily: 'Geist Mono', fontWeight: 600 }}>$8,400.00 USDC</span>
                    </div>
                  </div>
                </BorderGlow>

                {/* Integration 3: ArcPerps */}
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <span style={{ fontFamily: 'Space Grotesk', fontSize: '1.1rem', fontWeight: 600 }}>ArcPerps Dex Margin</span>
                        <span style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', background: 'rgba(124, 255, 178, 0.08)', color: '#7CFFB2', borderRadius: '4px', textTransform: 'uppercase' }}>Optimized</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#8C96A8', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                        Optimizes unused perpetual collateral inside exchange margin accounts, sweeping idle margins without affecting position health.
                      </p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#8C96A8' }}>Active Reserves Managed:</span>
                      <span style={{ fontFamily: 'Geist Mono', fontWeight: 600 }}>$2,200.00 USDC</span>
                    </div>
                  </div>
                </BorderGlow>

                {/* Integration 4: Add custom app */}
                <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                  <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', border: '1px dashed rgba(245,247,250,0.1)' }}>
                    <div style={{ fontSize: '1.5rem', color: '#4DE3FF', marginBottom: '0.75rem' }}>+</div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#F5F7FA', marginBottom: '0.25rem' }}>Connect New App</h4>
                    <p style={{ fontSize: '0.6875rem', color: '#8C96A8', maxWidth: '200px' }}>Integrate your custom Arc project using the SDK in under 20 minutes.</p>
                  </div>
                </BorderGlow>
              </div>
            </div>
          )}

          {/* TAB 6: SDK SETUP */}
          {activeNav === 'sdk' && (
            <div className="animate-in stagger-2" style={{ maxWidth: '900px', margin: '0 auto 4rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '3rem' }}>
                {/* Code and Guide */}
                <div>
                  <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Integrating the SDK</h3>
                  <p style={{ fontSize: '0.8125rem', color: '#8C96A8', lineHeight: 1.5, marginBottom: '2rem' }}>
                    Install the `@float/arc-sdk` package and wrap any wallet or provider to instantly give it autonomous routing capabilities.
                  </p>

                  <div className="code-block" style={{ width: '100%', margin: 0 }}>
                    <div className="code-header">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                      <span className="code-lang">JavaScript / TypeScript</span>
                    </div>
                    <pre className="code-body"><code>{`// 1. Import SDK and client
import { wrapAgent } from '@float/arc-sdk';

// 2. Wrap the agent wallet
const yieldAgent = await wrapAgent({
  walletAddress: "0xAgentWallet...",
  targetVaultAddress: "0xFloatVault...",
  threshold: "30s"
});

// 3. Sweep reserve to USYC
await yieldAgent.parkIdle(5000);`}</code></pre>
                  </div>
                </div>

                {/* Badges and Assets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
                    <div style={{ padding: '1.75rem' }}>
                      <h4 style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '1rem' }}>SDK Badges</h4>
                      <p style={{ fontSize: '0.75rem', color: '#8C96A8', marginBottom: '1.5rem', lineHeight: 1.4 }}>
                        Place this badge in your footer or landing page to show that your app utilizes FLOAT under the hood.
                      </p>
                      
                      {/* Badge Preview */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.2rem', background: '#070B12', border: '1px solid rgba(77, 227, 255, 0.2)', borderRadius: '8px', width: 'fit-content', cursor: 'pointer' }}>
                        <FloatLogo className="w-5 h-5" />
                        <span style={{ fontSize: '0.6875rem', letterSpacing: '0.05em', color: '#F5F7FA', fontWeight: 600 }}>POWERED BY FLOAT</span>
                      </div>
                      
                      <div style={{ fontSize: '0.625rem', color: '#8C96A8', marginTop: '1.25rem', fontFamily: 'Geist Mono', wordBreak: 'break-all', background: '#030509', padding: '0.5rem', borderRadius: '6px' }}>
                        {`<a href="https://float.yield.router"><img src="/badge.svg" /></a>`}
                      </div>
                    </div>
                  </BorderGlow>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
