import { CircleWallet } from './CircleWallet';

export interface ActivityLog {
  id: string | number;
  type: 'route' | 'recall' | 'detect';
  action: string;
  desc: string;
  amount: string;
  time: string;
  status: 'completed' | 'routing' | 'pending';
}

export interface AgentState {
  isParked: boolean;
  idleManaged: number;
  yieldCaptured: number;
  activities: ActivityLog[];
}

export class FloatAIEngine {
  private circleWallet: CircleWallet;
  private state: AgentState = {
    isParked: false,
    idleManaged: 890000,
    yieldCaptured: 4250,
    activities: []
  };

  constructor(wallet: CircleWallet) {
    this.circleWallet = wallet;
  }

  getState(): AgentState {
    return this.state;
  }

  addActivity(activity: Omit<ActivityLog, 'id' | 'time' | 'status'>) {
    const newActivity: ActivityLog = {
      ...activity,
      id: Math.random().toString(36).substring(7),
      time: 'Just now',
      status: 'completed'
    };
    
    this.state.activities = [newActivity, ...this.state.activities].slice(0, 10);
  }

  /**
   * Uses Vercel AI SDK / OpenAI to predict the Time-To-Next-Action (TTNA)
   * Currently mocked to save testing costs.
   */
  async predictTTNA(protocolState: any): Promise<{ shouldPark: boolean, confidence: number, reasoning: string }> {
    console.log(`\n[LLM MOCK] Analyzing ${protocolState.name} state...`);
    
    // For demo purposes, we randomly simulate the LLM's regime classification
    const isQuiet = Math.random() > 0.4; // 60% chance the market is quiet
    
    if (isQuiet) {
      return {
        shouldPark: true,
        confidence: 0.92,
        reasoning: "Volume profile is flat. No liquidations imminent. Time-To-Next-Action > 120s."
      };
    } else {
      return {
        shouldPark: false,
        confidence: 0.88,
        reasoning: "Volatility spike detected. Margin calls likely in < 30s. Keep capital liquid."
      };
    }
  }

  async runSimulationEvent() {
    const arcPerpsState = { name: "ArcPerps", currentVolume: "Simulated", recentEvents: ["Simulation Triggered"] };
    
    const prediction = await this.predictTTNA(arcPerpsState);
    console.log(`[LLM Output] Reasoning: "${prediction.reasoning}" | Confidence: ${prediction.confidence}`);

    if (prediction.shouldPark && !this.state.isParked) {
      console.log(`[FLOAT AI] Decision: PARK. Routing idle USDC to USYC via Circle Wallet...`);
      await this.circleWallet.executeTransaction("0xFloatVault", "park(uint256)", ["4500000000000"]);
      this.state.isParked = true;
      
      this.addActivity({
        type: "route",
        action: "Routed to USYC",
        desc: "ArcPerps → FLOAT Vault",
        amount: "$4,500,000"
      });
      
    } else if (!prediction.shouldPark && this.state.isParked) {
      console.log(`[FLOAT AI] Decision: WITHDRAW. Restoring liquidity preemptively via Circle Wallet...`);
      await this.circleWallet.executeTransaction("0xFloatVault", "withdraw(uint256)", ["4500000000000"]);
      this.state.isParked = false;
      
      this.addActivity({
        type: "recall",
        action: "Capital Recalled",
        desc: "ArcPerps margin call imminent",
        amount: "$4,500,000"
      });
    } else {
      console.log(`[FLOAT AI] Decision: HOLD CURRENT STATE.`);
      this.addActivity({
        type: "detect",
        action: "Idle Capital Detected",
        desc: `Arcade agent fees idle >30s`,
        amount: "$890,000"
      });
    }
    
    // Increment yield simulating time passing
    this.state.yieldCaptured += 12.5;
  }
}

// Global singleton so state persists across API route calls in development
const globalForAgent = globalThis as unknown as { floatAgent: FloatAIEngine | undefined };

export const floatAgent =
  globalForAgent.floatAgent ??
  new FloatAIEngine(new CircleWallet("wallet-arc-772", "mock-api", "mock-secret"));

if (process.env.NODE_ENV !== 'production') globalForAgent.floatAgent = floatAgent;
