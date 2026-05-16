import { CircleWallet } from './CircleWallet.js';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export class FloatAIEngine {
  private circleWallet: CircleWallet;
  private isParked: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(wallet: CircleWallet) {
    this.circleWallet = wallet;
  }

  /**
   * Uses Vercel AI SDK / OpenAI to predict the Time-To-Next-Action (TTNA)
   * for a specific ecosystem protocol (e.g. ArcPerps Margin Vault).
   */
  async predictTTNA(protocolState: any): Promise<{ shouldPark: boolean, confidence: number, reasoning: string }> {
    console.log(`\n[LLM] Analyzing ${protocolState.name} state...`);
    
    try {
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: `Analyze the following protocol state and predict if it will need liquidity in the next 60 seconds:
        ${JSON.stringify(protocolState, null, 2)}
        
        Respond ONLY with a JSON object strictly matching this schema:
        { "shouldPark": boolean, "confidence": number, "reasoning": "string" }`
      });

      const result = JSON.parse(text);
      return {
        shouldPark: Boolean(result.shouldPark),
        confidence: Number(result.confidence),
        reasoning: String(result.reasoning)
      };
    } catch (error) {
      console.error("[LLM] Inference failed, falling back to safe hold:", error);
      return {
        shouldPark: false,
        confidence: 0,
        reasoning: "LLM error. Defaulting to safe withdrawal."
      };
    }
  }

  startMonitoring() {
    console.log("[FLOAT AI] Starting Ecosystem TTNA monitoring...");
    
    this.intervalId = setInterval(async () => {
      // Example: Monitoring ArcPerps Margin Vault
      const arcPerpsState = { name: "ArcPerps", currentVolume: "Low", recentEvents: [] };
      
      const prediction = await this.predictTTNA(arcPerpsState);
      console.log(`[LLM Output] Reasoning: "${prediction.reasoning}" | Confidence: ${prediction.confidence}`);

      if (prediction.shouldPark && !this.isParked) {
        console.log(`[FLOAT AI] Decision: PARK. Routing idle USDC to USYC via Circle Wallet...`);
        this.isParked = true;
        await this.circleWallet.executeTransaction("0xFloatVault", "park(uint256)", ["4500000000000"]);
      } else if (!prediction.shouldPark && this.isParked) {
        console.log(`[FLOAT AI] Decision: WITHDRAW. Restoring liquidity preemptively via Circle Wallet...`);
        this.isParked = false;
        await this.circleWallet.executeTransaction("0xFloatVault", "withdraw(uint256)", ["4500000000000"]);
      } else {
        console.log(`[FLOAT AI] Decision: HOLD CURRENT STATE.`);
      }

    }, 8000); // Poll every 8 seconds
  }
  
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

// Demo Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const wallet = new CircleWallet("wallet-arc-772", "api-key-hidden", "entity-secret-hidden");
  const agent = new FloatAIEngine(wallet);
  agent.startMonitoring();
}
