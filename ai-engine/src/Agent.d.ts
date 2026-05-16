import { CircleWallet } from './CircleWallet.js';
export declare class FloatAIEngine {
    private circleWallet;
    private isParked;
    private intervalId;
    constructor(wallet: CircleWallet);
    /**
     * Uses Vercel AI SDK / OpenAI to predict the Time-To-Next-Action (TTNA)
     * for a specific ecosystem protocol (e.g. ArcPerps Margin Vault).
     */
    predictTTNA(protocolState: any): Promise<{
        shouldPark: boolean;
        confidence: number;
        reasoning: string;
    }>;
    startMonitoring(): void;
    stopMonitoring(): void;
}
//# sourceMappingURL=Agent.d.ts.map