"use client";

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import BorderGlow from '../../components/BorderGlow';

const Plasma = dynamic(() => import('../../components/Plasma'), { ssr: false });

// Activity log entries from the real agent backend
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

  // Simulate the demo flow by calling the backend API
  const runDemo = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    
    // Optimistically show loading state
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
    } catch (e) {
      console.error('Simulation failed:', e);
    }

    setDemoRunning(false);
  }, [demoRunning]);

  if (!mounted) return null;

  const navItems = [
    { id: 'dashboard', icon: '◉', label: 'Dashboard' },
    { id: 'routes', icon: '⇄', label: 'Routes' },
    { id: 'yield', icon: '↗', label: 'Yield' },
    { id: 'activity', icon: '◷', label: 'Activity' },
    { id: 'integrations', icon: '⊞', label: 'Integrations' },
    { id: 'sdk', icon: '⌥', label: 'SDK' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#05070B' }}>
      {/* Background Plasma Layer - Increased Brightness */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 1 }}>
        <Plasma
          color="#1a4dff"
          speed={0.4}
          direction="forward"
          scale={1.2}
          opacity={1}
          mouseInteractive={true}
        />
        {/* Lighter darkening overlay so plasma shines through brightly */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 0%, rgba(5,7,11,0.6) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(5, 7, 11, 0.2)' }} />
      </div>

      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar animate-in">
          <div className="sidebar-brand">
            <h1>FLOAT</h1>
            <p>Capital Efficiency Layer</p>
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
              <span style={{ fontWeight: 500 }}>Agent Active</span>
            </div>
            <p style={{ fontFamily: 'Geist', fontSize: '0.6875rem', color: 'rgba(245, 247, 250, 0.4)', marginTop: '0.5rem', letterSpacing: '0.05em' }}>
              Arc Testnet · 0.8s finality
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <div className="main-header animate-in stagger-1">
            <h2>Command Center</h2>
            <div className="header-right">
              <div className="system-badge">
                <div className="dot"></div>
                All Systems Operational
              </div>
              <BorderGlow borderRadius={100} glowRadius={15} glowColor="190 100 65" backgroundColor="transparent" edgeSensitivity={50}>
                <button className="btn-demo" onClick={runDemo} disabled={demoRunning} style={{ border: 'none', background: 'rgba(102, 230, 255, 0.1)', color: '#66E6FF', padding: '0.6rem 1.5rem', borderRadius: '100px', cursor: 'pointer', fontFamily: 'Geist', fontSize: '0.8125rem', fontWeight: 500 }}>
                  {demoRunning ? '⟳ Simulating...' : '▶ Simulate Payment Event'}
                </button>
              </BorderGlow>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="metrics-grid animate-in stagger-2">
            <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
              <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                <div className="metric-label"><span className="metric-icon">◈</span> Idle Capital Managed</div>
                <div className="metric-value cyan">
                  {idleManaged >= 100000 ? `$${(idleManaged / 1_000_000).toFixed(2)}M` : `$${idleManaged.toFixed(2)}`}
                </div>
                <div className="metric-sub">Across {activeRoutes} active routes</div>
                <div className="metric-change positive">+14.2% vs last 7d</div>
              </div>
            </BorderGlow>

            <BorderGlow borderRadius={20} glowRadius={30} glowColor="145 100 74" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40} colors={['#7CFFB2', '#4DE3FF', '#7CFFB2']}>
              <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                <div className="metric-label"><span className="metric-icon">↗</span> Yield Captured</div>
                <div className="metric-value mint">${yieldCaptured.toLocaleString()}</div>
                <div className="metric-sub">Real-time USYC APY: <span style={{ color: '#7CFFB2', fontWeight: 600 }}>{liveApy}</span></div>
                <div className="metric-change positive">+12.7% vs last 30d</div>
              </div>
            </BorderGlow>

            <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
              <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                <div className="metric-label"><span className="metric-icon">⇄</span> Active Routes</div>
                <div className="metric-value cyan">{activeRoutes}</div>
                <div className="metric-sub">Across 3 subagents</div>
                <div className="metric-change positive">100% healthy</div>
              </div>
            </BorderGlow>

            <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
              <div className="metric-card" style={{ border: 'none', background: 'transparent', padding: '1.75rem' }}>
                <div className="metric-label"><span className="metric-icon">⏱</span> Avg Recall Speed</div>
                <div className="metric-value cyan">{p50Latency ? `${(p50Latency / 1000).toFixed(2)}s` : '0.8s'}</div>
                <div className="metric-sub">{p50Latency ? `Measured p50: ${p50Latency}ms` : 'Arc sub-second finality'}</div>
                <div className="metric-change positive">{p50Latency ? 'Real-time metrics' : 'Deterministic'}</div>
              </div>
            </BorderGlow>
          </div>

          {/* Content Grid (Activity + Right Panels) */}
          <div className="content-grid animate-in stagger-3">
            {/* Activity Feed */}
            <BorderGlow borderRadius={20} glowRadius={30} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={40}>
              <div className="panel" style={{ border: 'none', background: 'transparent', padding: '2rem' }}>
                <div className="panel-header">
                  <span className="panel-title">Recent Routing Activity</span>
                  <button className="panel-link">View all</button>
                </div>
                <div className="activity-list">
                  {activities.map(activity => (
                    <div className="activity-item" key={activity.id}>
                      <div className={`activity-icon ${activity.type}`}>
                        {activity.type === 'route' ? '↗' : activity.type === 'recall' ? '↙' : '◎'}
                      </div>
                      <div className="activity-details">
                        <div className="activity-action">{activity.action}</div>
                        <div className="activity-desc">{activity.desc}</div>
                      </div>
                      <div className="activity-meta">
                        <div className="activity-amount">{activity.amount}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          <span className={`activity-badge ${activity.status}`}>{activity.status}</span>
                          <span className="activity-time">{activity.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </BorderGlow>

            {/* Right Column: Flo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Flo Mascot Panel with BorderGlow */}
              <BorderGlow borderRadius={20} glowRadius={50} glowColor="190 100 65" backgroundColor="rgba(5, 7, 11, 0.4)" edgeSensitivity={80} colors={['#4DE3FF', '#7CFFB2', '#FFC857']}>
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem', border: 'none', background: 'transparent' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '1.25rem', fontWeight: 600, color: '#F5F7FA', marginBottom: '0.25rem' }}>Hi, I&apos;m Flo</h3>
                  <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.4)', marginBottom: '1.5rem' }}>Your capital efficiency assistant</p>
                  
                  <div style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(245,247,250,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <video 
                      src="/flo.mp4" 
                      autoPlay 
                      loop 
                      muted 
                      playsInline 
                      style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                    />
                  </div>

                  <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.5)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    I optimize your capital in real-time across DeFi to maximize efficiency and returns.
                  </p>
                  <button className="btn-demo" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', border: 'none', background: 'rgba(102, 230, 255, 0.1)', color: '#66E6FF', padding: '0.6rem 1.5rem', borderRadius: '100px', cursor: 'pointer', fontFamily: 'Geist', fontSize: '0.8125rem', fontWeight: 500 }}>
                    <span>✧</span> How can Flo help?
                  </button>
                </div>
              </BorderGlow>

            </div>
          </div>

          {/* Integrations Grid */}
          <div className="animate-in stagger-4" style={{ marginBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.25rem', fontWeight: 600, color: '#F5F7FA' }}>Active Subagents</h3>
              <span style={{ fontFamily: 'Geist', fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.4)' }}>{agents.length} subagents monitored</span>
            </div>
            
            <div className="integrations-grid">
              {agents.map(agent => {
                const avatarColor = agent.agentId === 'trader-a' ? '#66E6FF' 
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
                            <div className="integration-avatar" style={{ background: `rgba(${glowColor.split(' ').join(',')}, 0.1)`, color: avatarColor, fontWeight: 600, fontSize: '0.875rem' }}>
                              {agent.label.split(' ')[1]}
                            </div>
                            <div>
                              <div className="integration-name" style={{ fontWeight: 600 }}>{agent.label}</div>
                              <div className="integration-type" style={{ textTransform: 'capitalize', fontSize: '0.6875rem', opacity: 0.6 }}>{agent.strategy} Preset</div>
                            </div>
                          </div>
                          <span className={`activity-badge ${agent.status.toLowerCase() === 'idle' ? 'completed' : agent.status.toLowerCase() === 'cooldown' ? 'pending' : 'failed'}`} style={{ textTransform: 'uppercase', fontSize: '0.625rem', padding: '0.2rem 0.6rem' }}>
                            {agent.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'rgba(245,247,250,0.3)', fontFamily: 'Geist', wordBreak: 'break-all', marginTop: '0.75rem' }}>
                          Wallet: {agent.walletId ? `${agent.walletId.slice(0, 8)}...${agent.walletId.slice(-8)}` : 'Loading...'}
                        </div>
                      </div>
                      
                      <div className="integration-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '1.5rem', gap: '0.5rem', borderTop: '1px solid rgba(245,247,250,0.05)', paddingTop: '1rem' }}>
                        <div>
                          <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4 }}>Liquid</div>
                          <div className="integration-stat-value" style={{ color: '#F5F7FA', fontSize: '0.875rem', fontWeight: 500 }}>${(agent.liquidBalance || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4 }}>Parked</div>
                          <div className="integration-stat-value" style={{ color: '#66E6FF', fontSize: '0.875rem', fontWeight: 500 }}>${(agent.parkedBalance || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="integration-stat-label" style={{ fontSize: '0.625rem', opacity: 0.4 }}>Total</div>
                          <div className="integration-stat-value" style={{ color: '#7CFFB2', fontSize: '0.875rem', fontWeight: 500 }}>${totalCapital.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  </BorderGlow>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
