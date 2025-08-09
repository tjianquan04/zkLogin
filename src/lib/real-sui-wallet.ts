import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

interface User {
  email: string;
  loginTime: string;
  provider: "github" | "google";
  login?: string;
  name?: string;
  picture?: string;
}

type SupportedProvider = "github" | "google";

interface ProviderConfig {
  clientId: string;
  authUrl: string;
  scope: string;
  issuer: string;
}

export class HybridWalletService {
  private keypair: Ed25519Keypair | null = null;
  public suiClient: SuiClient;
  public user: User | null = null;
  public walletAddress: string | null = null;
  public sessionExpiry: number | null = null;

  private providerConfigs: Record<SupportedProvider, ProviderConfig> = {
    github: {
      clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
      authUrl: "https://github.com/login/oauth/authorize",
      scope: "user:email",
      issuer: "https://github.com",
    },
    google: {
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      scope: "openid email profile",
      issuer: "https://accounts.google.com",
    },
  };

  constructor() {
    this.suiClient = new SuiClient({
      url: process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("devnet"),
    });
  }

  // ===== OAUTH LOGIN =====

  async initiateLogin(provider: SupportedProvider): Promise<{
    success: boolean;
    error?: string;
    authUrl?: string;
  }> {
    try {
      const config = this.providerConfigs[provider];
      if (!config.clientId) {
        throw new Error(`${provider} client ID not configured`);
      }

      console.log(`🔐 Initiating ${provider} OAuth login...`);

      // Store provider for callback
      sessionStorage.setItem("oauth_provider", provider);

      // Create OAuth URL
      const redirectUri = window.location.origin + "/api/auth/callback";
      const state = `${provider}-hybrid-` + Date.now();

      let authUrl: string;

      if (provider === "github") {
        authUrl =
          `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${config.scope}&` +
          `state=${state}`;
      } else if (provider === "google") {
        authUrl =
          `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(config.scope)}&` +
          `response_type=code&` +
          `state=${state}`;
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      return { success: true, authUrl };
    } catch (error) {
      console.error(`Failed to initiate ${provider} login:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ===== OAUTH CALLBACK + REAL WALLET CREATION =====

  async handleOAuthCallback(userToken: string) {
    try {
      // Read from localStorage as fallback
      // let provider = sessionStorage.getItem(
      //   "oauth_provider"
      // ) as SupportedProvider;
      // if (!provider) {
      //   provider = localStorage.getItem("oauth_provider") as SupportedProvider;
      // }
      // if (!provider) {
      //   throw new Error("No provider information found in session");
      // }

        // Get the provider from session storage
      const provider = sessionStorage.getItem(
        "oauth_provider"
      ) as SupportedProvider;
      if (!provider) {
        throw new Error("No provider information found in session");
      }

      // Decode user data
      const userData = JSON.parse(atob(userToken));
      const normalizedUserData = this.normalizeUserData(userData, provider);

      // Create deterministic wallet
      const deterministicSeed = this.createDeterministicSeed(
        normalizedUserData,
        provider
      );
      this.keypair = this.createKeypairFromSeed(deterministicSeed);
      this.walletAddress = this.keypair.getPublicKey().toSuiAddress();

      // Save user session
      this.user = {
        email: normalizedUserData.email,
        loginTime: new Date().toISOString(),
        provider,
        login: normalizedUserData.login,
        name: normalizedUserData.name,
        picture: normalizedUserData.picture,
      };
      this.sessionExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      this.saveSession();

  

      const privateKey = Buffer.from(this.keypair.getSecretKey()).toString(
        "hex"
      );

      return { success: true, address: this.walletAddress, privateKey };
    } catch (error) {
      console.error("OAuth callback failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }
  // ===== DETERMINISTIC WALLET GENERATION =====

  private createDeterministicSeed(userData: any, provider: string): string {
    // Create deterministic seed from user identity
    // Same user will ALWAYS get the same wallet
    const identity = `${provider}-${userData.sub || userData.id}-${
      userData.email
    }`;

    // Simple but effective hash function
    let hash = 0;
    for (let i = 0; i < identity.length; i++) {
      const char = identity.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to hex and ensure 64 characters
    const seed = Math.abs(hash)
      .toString(16)
      .padStart(16, "0")
      .repeat(4)
      .substring(0, 64);
    console.log("🔑 Generated deterministic seed for user:", userData.email);

    return seed;
  }

  private createKeypairFromSeed(seed: string): Ed25519Keypair {
    // Convert hex seed to bytes
    const seedBytes = new Uint8Array(
      seed.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Ensure we have exactly 32 bytes for Ed25519
    const privateKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      privateKey[i] = seedBytes[i % seedBytes.length];
    }

    return Ed25519Keypair.fromSecretKey(privateKey);
  }

  private normalizeUserData(userData: any, provider: SupportedProvider): any {
    switch (provider) {
      case "github":
        return {
          sub: userData.sub || userData.id?.toString(),
          id: userData.id,
          email: userData.email,
          login: userData.login,
          name: userData.name,
          picture: userData.avatar_url,
          provider: "github",
        };

      case "google":
        return {
          sub: userData.sub,
          id: userData.sub,
          email: userData.email,
          login: userData.email?.split("@")[0],
          name: userData.name,
          picture: userData.picture,
          provider: "google",
        };

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ===== REAL WALLET FUNCTIONS =====

  async getBalance(): Promise<string> {
    try {
      if (!this.walletAddress) return "0";

      const balance = await this.suiClient.getBalance({
        owner: this.walletAddress,
      });

      const suiBalance = (Number(balance.totalBalance) / 1_000_000_000).toFixed(
        6
      );
      return suiBalance;
    } catch (error) {
      console.error("Failed to get balance:", error);
      return "0";
    }
  }

  async requestFaucetSui(): Promise<{
    success: boolean;
    error?: string;
    txId?: string;
    amount?: string;
  }> {
    try {
      if (!this.walletAddress) {
        throw new Error("No wallet address available");
      }

      console.log(
        "🚰 Requesting REAL SUI for OAuth-generated wallet:",
        this.walletAddress
      );

      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: this.walletAddress }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Server error" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const txId =
          data.result?.transferredGasObjects?.[0]?.id || "faucet-success";
        return { success: true, txId: txId, amount: "1.0" };
      } else {
        throw new Error(data.error || "Faucet request failed");
      }
    } catch (error) {
      console.error("Faucet failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // Add this property at the top of your class
  private latestTransactions: any[] = [];

  // Optional: a getter so your UI can read it
  public get transactions() {
    return this.latestTransactions;
  }

  async sendTransaction(
    recipient: string,
    amount: string
  ): Promise<{
    success: boolean;
    error?: string;
    txId?: string;
    gasUsed?: string;
  }> {
    try {
      if (!this.keypair || !this.walletAddress) {
        throw new Error("Wallet not initialized");
      }

      console.log("📤 Creating REAL transaction from OAuth wallet...");
      console.log("- From:", this.walletAddress);
      console.log("- To:", recipient);
      console.log("- Amount:", amount, "SUI");

      const tx = new Transaction();
      const amountInMist = BigInt(
        Math.floor(parseFloat(amount) * 1_000_000_000)
      );

      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
      tx.transferObjects([coin], recipient);

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      console.log("✅ REAL transaction successful:", result.digest);

      if (result.effects?.status?.status === "success") {
        const gasUsed = result.effects.gasUsed;
        const totalGas =
          (Number(gasUsed?.computationCost || 0) +
            Number(gasUsed?.storageCost || 0) -
            Number(gasUsed?.storageRebate || 0)) /
          1_000_000_000;

     

        return {
          success: true,
          txId: result.digest,
          gasUsed: totalGas.toFixed(6),
        };
      } else {
        throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
      }
    } catch (error) {
      console.error("Real transaction failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  async getTransactionHistory(): Promise<any[]> {
    try {
      if (!this.walletAddress) return [];

      // Fetch sent txs
      const sent = await this.suiClient.queryTransactionBlocks({
        filter: { FromAddress: this.walletAddress },
        options: {
          showInput: true,
          showEffects: true,
          showObjectChanges: true,
        },
        order: "descending",
        limit: 20,
      });

      // Fetch received txs
      const received = await this.suiClient.queryTransactionBlocks({
        filter: { ToAddress: this.walletAddress },
        options: {
          showInput: true,
          showEffects: true,
          showObjectChanges: true,
        },
        order: "descending",
        limit: 20,
      });

      // Merge and dedupe
      const allTxs = [...sent.data, ...received.data];
      const uniqueTxs = allTxs.filter(
        (tx, index, self) =>
          index === self.findIndex((t) => t.digest === tx.digest)
      );
      function extractAmount(tx: any): string {
        if (!Array.isArray(tx.objectChanges)) {
          console.warn("Transaction missing objectChanges:", tx.digest);
          return "0";
        }

        for (const change of tx.objectChanges) {
          if (change.type === "TransferObject") {
            const obj = change.object;
            if (!obj || !obj.data || !obj.data.type || !obj.data.fields)
              continue;

            if (obj.data.type.includes("coin::Coin")) {
              const balanceField =
                obj.data.fields.balance ||
                obj.data.fields.value ||
                obj.data.fields.amount;
              if (balanceField) {
                const amountNum = Number(balanceField);
                if (!isNaN(amountNum)) {
                  return (amountNum / 1_000_000_000).toFixed(9);
                }
              }
            }
          }
        }

        return "0";
      }

      return uniqueTxs.map((tx) => ({
        id: tx.digest,
        type:
          tx.transaction?.data?.sender === this.walletAddress
            ? "Sent"
            : "Received",
        amount: extractAmount.call(this, tx),
        date: new Date(Number(tx.timestampMs || 0)).toLocaleDateString(),
        status: tx.effects?.status?.status === "success" ? "Success" : "Failed",
      }));
    } catch (error) {
      console.error("Failed to get transaction history:", error);
      return [];
    }
  }

  // ===== NETWORK UTILITIES =====

  isDevnet(): boolean {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("devnet");
    return rpcUrl.includes("devnet");
  }

  isTestnet(): boolean {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("devnet");
    return rpcUrl.includes("testnet");
  }

  getNetworkName(): string {
    if (this.isTestnet()) return "Testnet";
    if (this.isDevnet()) return "Devnet";
    return "Mainnet";
  }

  isFaucetAvailable(): boolean {
    return this.isTestnet() || this.isDevnet();
  }

  getWalletExplorerUrl(): string {
    if (!this.walletAddress) return "";
    const network = this.getNetworkName().toLowerCase();
    return `https://explorer.sui.io/address/${this.walletAddress}?network=${network}`;
  }

  getExplorerUrl(txId: string): string {
    const network = this.getNetworkName().toLowerCase();
    return `https://explorer.sui.io/txblock/${txId}?network=${network}`;
  }

  exportPrivateKey(): string | null {
    if (!this.keypair) return null;
    return Buffer.from(this.keypair.getSecretKey()).toString("hex");
  }

  // ===== SESSION MANAGEMENT =====

  private saveSession(): void {
    if (!this.keypair || !this.user) return;

    const sessionData = {
      privateKey: Buffer.from(this.keypair.getSecretKey()).toString("hex"),
      user: this.user,
      walletAddress: this.walletAddress,
      sessionExpiry: this.sessionExpiry,
    };

    localStorage.setItem("hybrid_wallet_session", JSON.stringify(sessionData));
  }

  restoreSession(): boolean {
    try {
      const data = localStorage.getItem("hybrid_wallet_session");
      if (!data) return false;

      const session = JSON.parse(data);

      if (Date.now() > session.sessionExpiry) {
        this.logout();
        return false;
      }

      // Restore keypair safely (use first 32 bytes)
      const keyBytes = new Uint8Array(Buffer.from(session.privateKey, "hex"));
      this.keypair = Ed25519Keypair.fromSecretKey(keyBytes.slice(0, 32));
      this.walletAddress = this.keypair.getPublicKey().toSuiAddress();

      this.user = session.user;
      this.sessionExpiry = session.sessionExpiry;

      console.log(
        "✅ Hybrid session restored for:",
        this.user.email,
        "→",
        this.walletAddress
      );
      return true;
    } catch (error) {
      console.error("Failed to restore session:", error);
      return false;
    }
  }

  logout(): void {
    this.keypair = null;
    this.user = null;
    this.walletAddress = null;
    this.sessionExpiry = null;

    localStorage.removeItem("hybrid_wallet_session");
    console.log("🔓 Logged out from hybrid wallet");

    sessionStorage.clear();
  }

  isLoggedIn(): boolean {
    return this.user !== null && Date.now() < (this.sessionExpiry || 0);
  }

  getCurrentProvider(): SupportedProvider | null {
    return this.user?.provider || null;
  }

  isProviderConfigured(provider: SupportedProvider): boolean {
    return !!this.providerConfigs[provider].clientId;
  }

  getAvailableProviders(): SupportedProvider[] {
    return Object.keys(this.providerConfigs).filter((provider) =>
      this.isProviderConfigured(provider as SupportedProvider)
    ) as SupportedProvider[];
  }
}
