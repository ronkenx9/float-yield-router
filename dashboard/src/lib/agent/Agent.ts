import { CircleWallet } from './CircleWallet';
import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';

const FLOAT_VAULT = "0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6";

export interface ActivityLog {
  id: string | number;
  type: 'route' | 'recall' | 'detect';
  action: string;
  desc: string;
  amount: string;
  time: string;
  status: 'completed' | 'routing' | 'pending' | 'failed';
  txHash?: string;
}

export interface AgentState {
  isParked: boolean;
  idleManaged: number;
  yieldCaptured: number;
  activities: ActivityLog[];
  walletAddress: string;
  parkedAmount: number;
}

export class FloatAIEngine {
  private circleWallet: CircleWallet;
  private state: AgentState = {
    isParked: false,
    idleManaged: 0,
    yieldCaptured: 0,
    activities: [],
    walletAddress: '',
    parkedAmount: 0,
  };

  constructor(wallet: CircleWallet) {
    this.circleWallet = wallet;
  }

  getState(): AgentState {
    return this.state;
  }

  addActivity(activity: Omit<ActivityLog, 'id' | 'time'>) {
    const newActivity: ActivityLog = {
      ...activity,
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString(),
    };
    
    this.state.activities = [newActivity, ...this.state.activities].slice(0, 20);
  }

  /**
   * Fetch the real USDC balance from the Circle wallet and update state.
   */
  async refreshBalance() {
    const balance = await this.circleWallet.getUSDCBalance();
    this.state.idleManaged = balance;
  }

  /**
   * Uses Groq LLM (Llama 3 70B) to predict the Time-To-Next-Action (TTNA).
   * This is a REAL LLM call — not mocked.
   */
  async predictTTNA(protocolState: any): Promise<{ shouldPark: boolean, confidence: number, reasoning: string }> {
    console.log(`\n[LLM] Analyzing ${protocolState.name} state via Groq...`);
    
    try {
      const { text } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        prompt: `You are a DeFi yield routing agent. Analyze the following protocol state and predict if idle capital should be parked in a yield vault or kept liquid.

Protocol State:
${JSON.stringify(protocolState, null, 2)}

Respond in EXACTLY this JSON format (no other text):
{"shouldPark": true/false, "confidence": 0.0-1.0, "reasoning": "one sentence explanation"}`,
        maxOutputTokens: 150,
      });
      
      console.log(`[LLM] Raw response: ${text}`);
      
      // Parse the JSON from the LLM response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          shouldPark: Boolean(parsed.shouldPark),
          confidence: Number(parsed.confidence) || 0.5,
          reasoning: String(parsed.reasoning || 'No reasoning provided'),
        };
      }
      
      // Fallback if parsing fails
      console.warn('[LLM] Failed to parse response, defaulting to hold');
      return { shouldPark: false, confidence: 0.5, reasoning: 'LLM response parsing failed — holding position.' };
      
    } catch (error: any) {
      console.error(`[LLM] Error calling Groq:`, error.message);
      // On LLM failure, default to safe state (don't move money)
      return { shouldPark: false, confidence: 0.0, reasoning: `LLM error: ${error.message}. Defaulting to hold.` };
    }
  }

  /**
   * Run a real simulation event:
   * 1. Fetch real wallet balance
   * 2. Ask Groq LLM for a decision
   * 3. Execute real on-chain transaction (approve → park or withdraw)
   * 4. Poll until confirmed
   */
  async runSimulationEvent() {
    // Step 1: Get real balance
    await this.refreshBalance();
    const balance = this.state.idleManaged;
    console.log(`[FLOAT] Current wallet balance: ${balance} USDC`);

    if (balance < 1 && !this.state.isParked) {
      console.log('[FLOAT] Insufficient balance to operate. Need at least 1 USDC.');
      this.addActivity({
        type: 'detect',
        action: 'Insufficient Balance',
        desc: `Wallet has ${balance.toFixed(2)} USDC — below minimum`,
        amount: `$${balance.toFixed(2)}`,
        status: 'pending',
      });
      return;
    }

    // Step 2: Ask the LLM
    const protocolState = {
      name: "ArcPerps",
      walletBalance: balance,
      isCurrentlyParked: this.state.isParked,
      parkedAmount: this.state.parkedAmount,
      timestamp: new Date().toISOString(),
    };
    
    const prediction = await this.predictTTNA(protocolState);
    console.log(`[LLM] Decision: shouldPark=${prediction.shouldPark} | Confidence: ${prediction.confidence} | Reasoning: "${prediction.reasoning}"`);

    // Step 3: Execute real transaction
    // Use a conservative amount — park half the available balance
    const parkAmount = Math.floor((balance / 2) * 1_000_000); // Convert to 6-decimal raw units
    const parkAmountStr = parkAmount.toString();
    const parkAmountHuman = (parkAmount / 1_000_000).toFixed(2);

    if (prediction.shouldPark && !this.state.isParked && balance >= 2) {
      console.log(`[FLOAT] PARKING ${parkAmountHuman} USDC...`);
      
      try {
        // Approve first
        const approveTxId = await this.circleWallet.approveUSDC(parkAmountStr);
        const approveResult = await this.circleWallet.waitForTransaction(approveTxId);
        
        if (approveResult.state !== 'COMPLETE') {
          throw new Error(`Approve failed: ${approveResult.errorDetails}`);
        }

        // Then park
        const parkTxId = await this.circleWallet.executeTransaction(FLOAT_VAULT, "park(uint256)", [parkAmountStr]);
        const parkResult = await this.circleWallet.waitForTransaction(parkTxId);
        
        if (parkResult.state !== 'COMPLETE') {
          throw new Error(`Park failed: ${parkResult.errorDetails}`);
        }

        this.state.isParked = true;
        this.state.parkedAmount = parkAmount / 1_000_000;
        await this.refreshBalance();
        
        this.addActivity({
          type: 'route',
          action: 'Routed to USYC Vault',
          desc: `${prediction.reasoning}`,
          amount: `$${parkAmountHuman}`,
          status: 'completed',
          txHash: parkResult.txHash,
        });
        
      } catch (error: any) {
        console.error(`[FLOAT] Park transaction failed:`, error.message);
        this.addActivity({
          type: 'route',
          action: 'Park Failed',
          desc: error.message,
          amount: `$${parkAmountHuman}`,
          status: 'failed',
        });
      }

    } else if (!prediction.shouldPark && this.state.isParked) {
      const withdrawAmount = Math.floor(this.state.parkedAmount * 1_000_000);
      const withdrawAmountStr = withdrawAmount.toString();
      const withdrawAmountHuman = (withdrawAmount / 1_000_000).toFixed(2);
      
      console.log(`[FLOAT] WITHDRAWING ${withdrawAmountHuman} USDC...`);
      
      try {
        const withdrawTxId = await this.circleWallet.executeTransaction(FLOAT_VAULT, "withdraw(uint256)", [withdrawAmountStr]);
        const withdrawResult = await this.circleWallet.waitForTransaction(withdrawTxId);
        
        if (withdrawResult.state !== 'COMPLETE') {
          throw new Error(`Withdraw failed: ${withdrawResult.errorDetails}`);
        }

        this.state.isParked = false;
        this.state.parkedAmount = 0;
        await this.refreshBalance();
        
        this.addActivity({
          type: 'recall',
          action: 'Capital Recalled',
          desc: `${prediction.reasoning}`,
          amount: `$${withdrawAmountHuman}`,
          status: 'completed',
          txHash: withdrawResult.txHash,
        });
        
      } catch (error: any) {
        console.error(`[FLOAT] Withdraw transaction failed:`, error.message);
        this.addActivity({
          type: 'recall',
          action: 'Withdraw Failed',
          desc: error.message,
          amount: `$${withdrawAmountHuman}`,
          status: 'failed',
        });
      }

    } else {
      console.log(`[FLOAT] HOLDING current state.`);
      this.addActivity({
        type: 'detect',
        action: prediction.shouldPark ? 'Already Parked' : 'Staying Liquid',
        desc: prediction.reasoning,
        amount: `$${balance.toFixed(2)}`,
        status: 'completed',
      });
    }
  }
}

// Global singleton so state persists across API route calls in development
const globalForAgent = globalThis as unknown as { floatAgent: FloatAIEngine | undefined };

export const floatAgent =
  globalForAgent.floatAgent ??
  new FloatAIEngine(new CircleWallet(
    process.env.CIRCLE_WALLET_ID ?? "",
    process.env.CIRCLE_API_KEY ?? "",
    process.env.CIRCLE_ENTITY_SECRET ?? ""
  ));

if (process.env.NODE_ENV !== 'production') globalForAgent.floatAgent = floatAgent;
