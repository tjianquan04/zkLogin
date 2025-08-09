"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserIcon,
  WalletIcon,
  PaperAirplaneIcon,
  EyeIcon,
  ClockIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { MultiProviderZkLoginService } from "@/lib/zklogin-service";

// Initialize zkLogin service
const zkLoginService = new MultiProviderZkLoginService();

export default function MultiProviderZkLoginWallet() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Core states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [balance, setBalance] = useState("0");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("wallet");

  // Notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: string;
  } | null>(null);

  // Provider state
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  // Send form state
  const [sendForm, setSendForm] = useState({
    recipient: "",
    amount: "",
    error: "",
  });

  // ✅ Enhanced faucet states
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [lastFaucetRequest, setLastFaucetRequest] = useState<number>(0);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [showDiscordInstructions, setShowDiscordInstructions] = useState(false);

  const WalletStatus = () => {
    const [walletInfo, setWalletInfo] = useState<any>(null);
    const [checking, setChecking] = useState(false);

    const checkWallet = async () => {
      setChecking(true);
      try {
        const info = await zkLoginService.validateWallet();
        setWalletInfo(info);
      } catch (error) {
        console.error("Wallet check failed:", error);
      } finally {
        setChecking(false);
      }
    };

    useEffect(() => {
      if (zkLoginService.walletAddress) {
        checkWallet();
      }
    }, [zkLoginService.walletAddress, balance]);

    if (!walletInfo) return null;

    return (
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 mb-4">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
          <WalletIcon className="w-4 h-4 mr-2" />
          Wallet Status
        </h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Valid Address:</span>
            <span
              className={walletInfo.isValid ? "text-green-600" : "text-red-600"}
            >
              {walletInfo.isValid ? "✅ Yes" : "❌ No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Has Coins:</span>
            <span
              className={
                walletInfo.hasCoins ? "text-green-600" : "text-orange-600"
              }
            >
              {walletInfo.hasCoins ? "✅ Yes" : "⚠️ No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Coin Count:</span>
            <span>{walletInfo.coinCount}</span>
          </div>
          {walletInfo.error && (
            <div className="text-red-600 text-xs mt-2">
              Error: {walletInfo.error}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ✅ NEW: Rate limit states
  const [rateLimitResetTime, setRateLimitResetTime] = useState<number>(0);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);

  // Rate limit countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (rateLimitResetTime > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(
          0,
          Math.ceil((rateLimitResetTime - now) / 1000)
        );
        setRateLimitCountdown(remaining);

        if (remaining <= 0) {
          setRateLimitResetTime(0);
          setRateLimitCountdown(0);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [rateLimitResetTime]);

  // Initialize app and handle OAuth callback
  useEffect(() => {
    const handleOAuthResult = async () => {
      const authResult = searchParams.get("auth");

      if (authResult === "success") {
        // Handle successful OAuth callback
        const githubToken = sessionStorage.getItem("github_token");
        const googleToken = sessionStorage.getItem("google_token");
        const token = githubToken || googleToken;

        if (token) {
          setIsLoading(true);

          // Determine provider based on which token exists
          const provider = githubToken ? "GitHub" : "Google";
          setLoadingStep(`🔒 Processing ${provider} authentication...`);

          try {
            const result = await zkLoginService.handleOAuthCallback(token);
            if (result.success) {
              setIsLoggedIn(true);
              showNotification(
                `Successfully authenticated with ${provider} zkLogin!`
              );
              await loadWalletData();
              // Clear tokens from session storage for security
              sessionStorage.removeItem("github_token");
              sessionStorage.removeItem("google_token");
              // Clean up URL
              router.replace("/");
            } else {
              throw new Error(result.error);
            }
          } catch (error) {
            showNotification((error as Error).message, "error");
          } finally {
            setIsLoading(false);
            setLoadingStep("");
          }
        }
      } else if (authResult === "error") {
        const errorMessage =
          searchParams.get("message") || "Authentication failed";
        showNotification(errorMessage, "error");
        router.replace("/");
      } else {
        // Regular app initialization
        if (zkLoginService.restoreSession()) {
          setIsLoggedIn(true);
          loadWalletData();
        }
      }
    };

    // Check available providers
    setAvailableProviders(zkLoginService.getAvailableProviders());

    handleOAuthResult();
  }, [searchParams, router]);

  // ✅ ENHANCED: Notification system
  const showNotification = (message: string, type: string = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // ✅ ENHANCED: Load wallet data with error handling
  const loadWalletData = async () => {
    try {
      setLoadingStep("📊 Loading wallet data...");
      const [walletBalance, txHistory] = await Promise.all([
        zkLoginService.getBalance(),
        zkLoginService.getTransactionHistory(),
      ]);
      setBalance(walletBalance);
      setTransactions(txHistory);
      setLoadingStep("");
    } catch (error) {
      console.error("Failed to load wallet data:", error);
      showNotification("Failed to load wallet data", "error");
      setLoadingStep("");
    }
  };

  const validateDevnetSetup = async () => {
    console.log("=== DEVNET SETUP VALIDATION ===");
    console.log("🔍 RPC URL:", process.env.NEXT_PUBLIC_SUI_RPC_URL);
    console.log("🔍 Is Devnet:", zkLoginService.isDevnet());
    console.log("🔍 Is Testnet:", zkLoginService.isTestnet());
    console.log("🔍 Network Name:", zkLoginService.getNetworkName());
    console.log("🔍 Faucet Available:", zkLoginService.isFaucetAvailable());

    // Test RPC connection
    try {
      const epoch = await zkLoginService.suiClient.getLatestSuiSystemState();
      console.log("✅ RPC Connection successful, current epoch:", epoch.epoch);
      showNotification("✅ Devnet connection successful!", "success");
    } catch (error) {
      console.error("❌ RPC Connection failed:", error);
      showNotification("❌ Devnet connection failed", "error");
    }

    // Test faucet API endpoint
    try {
      const response = await fetch("/api/faucet", { method: "GET" });
      const data = await response.json();
      console.log("✅ Faucet API status:", data);
      showNotification(`✅ Faucet API ready (${data.network})`, "success");
    } catch (error) {
      console.error("❌ Faucet API test failed:", error);
      showNotification("❌ Faucet API test failed", "error");
    }
  };

  const MockWalletBanner = () => (
  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
    <div className="flex">
      <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mr-3 mt-0.5" />
      <div>
        <h3 className="text-sm font-medium text-yellow-800">
          🎭 MOCK zkLOGIN WALLET (SIMULATION)
        </h3>
        <p className="mt-1 text-sm text-yellow-700">
          This is a demo wallet. All transactions are simulated. 
          No real SUI will be sent or received.
        </p>
      </div>
    </div>
  </div>
);

  // ✅ ENHANCED: Provider login with better error handling
  const handleProviderLogin = async (provider: "github" | "google") => {
    setIsLoading(true);
    setLoadingStep("🔐 Generating ephemeral keypair...");

    try {
      const result = await zkLoginService.initiateLogin(provider);

      if (result.success && result.authUrl) {
        const providerName =
          provider.charAt(0).toUpperCase() + provider.slice(1);
        setLoadingStep(`🌐 Redirecting to ${providerName} OAuth...`);
        // Redirect to OAuth
        window.location.href = result.authUrl;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setIsLoading(false);
      setLoadingStep("");
      showNotification((error as Error).message, "error");
    }
  };

  // ✅ ENHANCED: Logout with cleanup
  const handleLogout = () => {
    zkLoginService.logout();
    setIsLoggedIn(false);
    setBalance("0");
    setTransactions([]);
    setSendForm({ recipient: "", amount: "", error: "" });
    setLastFaucetRequest(0);
    showNotification("Successfully logged out");
  };

  // ✅ ENHANCED: Send transaction with better validation
  const handleSendTransaction = async () => {
    setSendForm((prev) => ({ ...prev, error: "" }));

    // Enhanced validation
    if (!sendForm.recipient?.trim() || !sendForm.amount?.trim()) {
      setSendForm((prev) => ({ ...prev, error: "Please fill in all fields" }));
      return;
    }

    const amount = parseFloat(sendForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setSendForm((prev) => ({
        ...prev,
        error: "Amount must be a valid positive number",
      }));
      return;
    }

    if (amount > parseFloat(balance)) {
      setSendForm((prev) => ({ ...prev, error: "Insufficient balance" }));
      return;
    }

    if (!sendForm.recipient.match(/^0x[a-fA-F0-9]{64}$/)) {
      setSendForm((prev) => ({
        ...prev,
        error:
          "Invalid recipient address format (must be 0x followed by 64 hex characters)",
      }));
      return;
    }

    setIsLoading(true);
    setLoadingStep("🔍 Validating wallet...");

    try {
      // ✅ NEW: Validate wallet first
      const walletValidation = await zkLoginService.validateWallet();

      if (!walletValidation.isValid) {
        throw new Error(`Wallet validation failed: ${walletValidation.error}`);
      }

      if (!walletValidation.hasCoins) {
        throw new Error(
          "Wallet has no SUI coins. Please use the faucet first."
        );
      }

      setLoadingStep("📝 Creating transaction...");

      const result = await zkLoginService.sendTransaction(
        sendForm.recipient,
        sendForm.amount
      );

      if (result.success && result.txId) {
        setLoadingStep("✅ Transaction successful!");
        const explorerUrl = zkLoginService.getExplorerUrl(result.txId);
        showNotification(
          `Transaction sent! View: ${result.txId.substring(0, 10)}...`
        );
        setSendForm({ recipient: "", amount: "", error: "" });
        await loadWalletData();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Provide helpful guidance based on error type
      if (errorMessage.includes("mock zkLogin")) {
        setSendForm((prev) => ({
          ...prev,
          error:
            "This demo uses mock zkLogin. Real transactions require proper zkLogin setup with valid OAuth tokens and proofs.",
        }));
      } else if (
        errorMessage.includes("No SUI coins") ||
        errorMessage.includes("faucet")
      ) {
        setSendForm((prev) => ({
          ...prev,
          error: "No SUI in wallet. Use the faucet to get test SUI first.",
        }));
      } else if (
        errorMessage.includes("BigInt") ||
        errorMessage.includes("null")
      ) {
        setSendForm((prev) => ({
          ...prev,
          error:
            "Transaction failed due to insufficient funds or network issues. Try using the faucet first.",
        }));
      } else {
        setSendForm((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }

      showNotification(errorMessage, "error");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // ✅ ENHANCED: Copy to clipboard with feedback
  const copyToClipboard = async (text: string, label: string = "Text") => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification(`${label} copied to clipboard!`);
    } catch (error) {
      showNotification("Failed to copy to clipboard", "error");
    }
  };

  // ✅ NEW: Enhanced balance refresh
  const refreshBalance = async () => {
    setIsRefreshingBalance(true);
    try {
      const newBalance = await zkLoginService.getBalance();
      setBalance(newBalance);
      showNotification("Balance updated!");
    } catch (error) {
      console.error("Failed to refresh balance:", error);
      showNotification("Failed to refresh balance", "error");
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  // ✅ NEW: Complete faucet handler with all improvements
  const handleRequestFaucet = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastFaucetRequest;
    const minWaitTime = 60000; // 1 minute

    if (timeSinceLastRequest < minWaitTime) {
      const waitSeconds = Math.ceil(
        (minWaitTime - timeSinceLastRequest) / 1000
      );
      showNotification(
        `Please wait ${waitSeconds} seconds before requesting again`,
        "error"
      );
      return;
    }

    setFaucetLoading(true);
    setLoadingStep("🚰 Requesting SUI from faucet...");
    setLastFaucetRequest(now);

    try {
      const result = await zkLoginService.requestFaucetSui();

      if (result.success) {
        // Success - reset any rate limit timers
        setRateLimitResetTime(0);

        const successMessage = result.txId
          ? `🎉 Received ${
              result.amount || "1.0"
            } SUI! TX: ${result.txId.substring(0, 8)}...`
          : "🎉 Received testnet SUI! Check your balance.";

        showNotification(successMessage, "success");

        // Refresh balance after delay
        setTimeout(async () => {
          try {
            await refreshBalance();
            setLoadingStep("✅ Balance updated!");
          } catch (error) {
            console.warn("Failed to refresh balance after faucet:", error);
          }
        }, 3000);
      } else {
        // Handle rate limit specifically
        if (
          result.error?.includes("rate limit") ||
          result.error?.includes("Rate limit")
        ) {
          // Set rate limit reset time (typical faucet cooldown is 1 hour)
          const resetTime = now + 60 * 60 * 1000; // 1 hour from now
          setRateLimitResetTime(resetTime);

          showNotification(
            "Rate limited by faucet. Try again in 1 hour or use Discord faucet.",
            "error"
          );
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      console.error("Faucet request error:", error);
      showNotification((error as Error).message, "error");
    } finally {
      setFaucetLoading(false);
      setTimeout(() => setLoadingStep(""), 2000);
    }
  };

  const renderFaucetButton = () => {
    const isRateLimited = rateLimitCountdown > 0;
    const isFaucetAvailable = zkLoginService.isFaucetAvailable(); // Uses both testnet and devnet
    const canRequest =
      isFaucetAvailable && !faucetLoading && !isLoading && !isRateLimited;

    if (!isFaucetAvailable) {
      return (
        <button
          disabled
          className="w-full bg-gray-300 text-gray-500 cursor-not-allowed py-3 px-4 rounded-xl font-medium"
        >
          🚫 Testnet/Devnet Only
        </button>
      );
    }

    if (isRateLimited) {
      const hours = Math.floor(rateLimitCountdown / 3600);
      const minutes = Math.floor((rateLimitCountdown % 3600) / 60);
      const seconds = rateLimitCountdown % 60;

      return (
        <div className="space-y-2">
          <button
            disabled
            className="w-full bg-orange-300 text-orange-700 cursor-not-allowed py-3 px-4 rounded-xl font-medium"
          >
            ⏰ Rate Limited
          </button>
          <p className="text-xs text-orange-600 text-center">
            Try again in: {hours > 0 && `${hours}h `}
            {minutes > 0 && `${minutes}m `}
            {seconds}s
          </p>
          <button
            onClick={() => setShowDiscordInstructions(!showDiscordInstructions)}
            className="w-full bg-blue-100 text-blue-700 py-2 px-4 rounded-lg text-sm hover:bg-blue-200 transition"
          >
            💬 Use Discord Faucet Instead
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={handleRequestFaucet}
        disabled={!canRequest}
        className={`w-full py-3 px-4 rounded-xl font-medium transition duration-200 flex items-center justify-center space-x-2 ${
          faucetLoading || isLoading
            ? "bg-emerald-400 text-white cursor-not-allowed"
            : "bg-emerald-600 hover:bg-emerald-700 text-white"
        }`}
      >
        {faucetLoading ? (
          <>
            <div className="w-4 h-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
            <span>Getting SUI...</span>
          </>
        ) : (
          <>
            <span>🚰 Get Free {zkLoginService.getNetworkName()} SUI</span>
          </>
        )}
      </button>
    );
  };

  // Provider-specific UI components
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "github":
        return (
          <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
            <svg
              className="w-4 h-4 text-gray-900"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
      case "google":
        return (
          <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getProviderButton = (provider: string) => {
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const baseClasses =
      "w-full font-semibold py-4 px-6 rounded-xl transition duration-200 flex items-center justify-center space-x-3 shadow-sm";

    switch (provider) {
      case "github":
        return (
          <button
            onClick={() => handleProviderLogin("github")}
            disabled={isLoading}
            className={`${baseClasses} bg-gray-900 hover:bg-gray-800 disabled:bg-gray-600 text-white`}
          >
            {getProviderIcon(provider)}
            <span>Continue with {providerName}</span>
          </button>
        );
      case "google":
        return (
          <button
            onClick={() => handleProviderLogin("google")}
            disabled={isLoading}
            className={`${baseClasses} bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-900 border border-gray-300`}
          >
            {getProviderIcon(provider)}
            <span>Continue with {providerName}</span>
          </button>
        );
      default:
        return null;
    }
  };

  const getCurrentProviderDisplay = () => {
    const provider = zkLoginService.getCurrentProvider();
    if (!provider) return "Unknown";
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
        {/* Notification */}
        {notification && (
          <div
            className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
              notification.type === "success"
                ? "bg-green-500 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircleIcon className="w-5 h-5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <ShieldCheckIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              zkLogin Wallet
            </h1>
            <p className="text-gray-600">
              Secure Web3 access with your favorite account
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 animate-spin mx-auto mb-4">
                <div className="w-full h-full border-4 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
              <p className="text-lg font-medium text-gray-700 mb-4">
                {loadingStep}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full animate-pulse"></div>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Generating zero-knowledge proof... This may take a few seconds.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {availableProviders.length > 0 ? (
                <div className="space-y-4">
                  {availableProviders.map((provider) => (
                    <div key={provider}>{getProviderButton(provider)}</div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No Providers Configured
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Please configure your OAuth providers in the environment
                    variables:
                  </p>
                  <div className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 text-left">
                    <p>NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_id</p>
                    <p>NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_id</p>
                  </div>
                </div>
              )}

              {availableProviders.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                    <ShieldCheckIcon className="w-5 h-5 mr-2" />
                    How zkLogin Works
                  </h3>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Login with your existing social account
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      We generate a zero-knowledge proof of your identity
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Get a Sui wallet without seed phrases
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Your privacy is protected by cryptography
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const DiscordFaucetInstructions = () => (
    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 mt-4">
      <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
        💬 Discord Faucet (Alternative)
      </h4>
      <div className="space-y-3 text-sm text-blue-800">
        <div className="flex items-start space-x-2">
          <span className="font-medium text-blue-600">1.</span>
          <div>
            <p>Join Sui Discord:</p>
            <a
              href="https://discord.gg/sui"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              https://discord.gg/sui
            </a>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <span className="font-medium text-blue-600">2.</span>
          <p>
            Go to{" "}
            <code className="bg-blue-100 px-1 rounded">#devnet-faucet</code>{" "}
            channel
          </p>
        </div>

        <div className="flex items-start space-x-2">
          <span className="font-medium text-blue-600">3.</span>
          <div>
            <p>Send this message:</p>
            <div className="bg-gray-800 text-green-400 p-2 rounded mt-1 font-mono text-xs flex items-center justify-between">
              <span>!faucet {zkLoginService.walletAddress}</span>
              <button
                onClick={() =>
                  copyToClipboard(
                    `!faucet ${zkLoginService.walletAddress}`,
                    "Discord command"
                  )
                }
                className="text-blue-400 hover:text-blue-300 ml-2"
                title="Copy command"
              >
                📋
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <span className="font-medium text-blue-600">4.</span>
          <p>Wait for the bot to send you SUI (usually takes 1-2 minutes)</p>
        </div>
      </div>
    </div>
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
        {/* Your existing login screen JSX */}

        {/* 🧪 OPTIONAL: Add validation button for testing */}
        {process.env.NODE_ENV === "development" && (
          <button
            onClick={validateDevnetSetup}
            className="fixed bottom-4 left-4 bg-white/20 text-white px-3 py-2 rounded-lg text-sm"
          >
            🧪 Test Devnet Setup
          </button>
        )}
      </div>
    );
  }

  // Main Wallet Interface

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
            notification.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircleIcon className="w-5 h-5" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-3">
                <WalletIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  zkLogin Wallet
                </h1>
                <div className="flex items-center space-x-2">
                  <UserIcon className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">
                    {zkLoginService.user?.email}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {getCurrentProviderDisplay()}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                    {zkLoginService.getNetworkName()}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition duration-200"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex space-x-8">
            {[
              { key: "wallet", label: "Wallet", icon: WalletIcon },
              { key: "send", label: "Send", icon: PaperAirplaneIcon },
              { key: "history", label: "History", icon: ClockIcon },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition duration-200 ${
                  activeTab === key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Wallet Tab */}
        {activeTab === "wallet" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Balance Card */}
            <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-blue-100 text-sm mb-2">Total Balance</p>
                  <div className="flex items-center space-x-3">
                    <p className="text-4xl font-bold">{balance} SUI</p>
                    <button
                      onClick={refreshBalance}
                      disabled={isRefreshingBalance}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition disabled:opacity-50"
                      title="Refresh balance"
                    >
                      <ArrowPathIcon
                        className={`w-4 h-4 ${
                          isRefreshingBalance ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-blue-100 text-sm">
                    ≈ ${(parseFloat(balance) * 2.45).toFixed(2)} USD
                  </p>
                </div>
                <div className="bg-white/20 rounded-xl p-3">
                  <WalletIcon className="w-8 h-8 text-white" />
                </div>
              </div>

              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                <p className="text-blue-100 text-xs mb-2">
                  Your zkLogin Wallet Address
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-white font-mono text-sm break-all mr-4">
                    {zkLoginService.walletAddress}
                  </p>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        zkLoginService.walletAddress || "",
                        "Address"
                      )
                    }
                    className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition"
                    title="Copy address"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setActiveTab("send")}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                    <span>Send SUI</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("history")}
                    className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2"
                  >
                    <EyeIcon className="w-4 h-4" />
                    <span>View History</span>
                  </button>

                  {/* ✅ USE renderFaucetButton HERE */}
                  {renderFaucetButton()}

                  {/* Discord instructions (conditionally shown) */}
                  {showDiscordInstructions && <DiscordFaucetInstructions />}

                  {/* ✅ OPTIONAL: Add validation button for debugging */}
                  {process.env.NODE_ENV === "development" && (
                    <button
                      onClick={validateDevnetSetup}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 px-4 rounded-lg transition text-sm"
                    >
                      🧪 Test Devnet Setup
                    </button>
                  )}

                  {/* Explorer link */}
                  {zkLoginService.walletAddress && (
                    <a
                      href={zkLoginService.getWalletExplorerUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                      <span>View on Explorer</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Security Status */}
              <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-3 flex items-center">
                  <ShieldCheckIcon className="w-5 h-5 mr-2" />
                  Security Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    {getCurrentProviderDisplay()} zkLogin authenticated
                  </div>
                  <div className="flex items-center text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    Session secure (24h)
                  </div>
                  <div className="flex items-center text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    Privacy protected
                  </div>
                  <div className="flex items-center text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    Network: {zkLoginService.getNetworkName()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Send Tab */}
        {activeTab === "send" && (
          <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow-sm border">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Send SUI</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={sendForm.recipient}
                  onChange={(e) =>
                    setSendForm((prev) => ({
                      ...prev,
                      recipient: e.target.value.trim(),
                    }))
                  }
                  placeholder="0x..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be a valid Sui address (0x followed by 64 hex characters)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (SUI)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={sendForm.amount}
                  onChange={(e) =>
                    setSendForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-500">
                    Available: {balance} SUI
                  </p>
                  <button
                    onClick={() =>
                      setSendForm((prev) => ({
                        ...prev,
                        amount: (parseFloat(balance) * 0.9).toFixed(6),
                      }))
                    }
                    className="text-xs text-blue-600 hover:text-blue-800"
                    disabled={isLoading || parseFloat(balance) === 0}
                  >
                    Max (90%)
                  </button>
                </div>
              </div>

              {sendForm.error && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                  {sendForm.error}
                </div>
              )}

              <button
                onClick={handleSendTransaction}
                disabled={isLoading || !sendForm.recipient || !sendForm.amount}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 animate-spin border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <PaperAirplaneIcon className="w-5 h-5" />
                )}
                <span>{isLoading ? "Sending..." : "Send Transaction"}</span>
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Transaction History
              </h2>
              <button
                onClick={loadWalletData}
                disabled={isLoading}
                className="flex items-center space-x-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
              >
                <ArrowPathIcon
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No transactions yet</p>
                <p className="text-sm">
                  Your transaction history will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {transactions.map((tx, index) => (
                  <div
                    key={tx.id || index}
                    className="p-6 flex items-center justify-between hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center space-x-4">
                      <div
                        className={`p-2 rounded-full ${
                          tx.type === "Sent" ? "bg-red-100" : "bg-green-100"
                        }`}
                      >
                        <PaperAirplaneIcon
                          className={`w-4 h-4 ${
                            tx.type === "Sent"
                              ? "text-red-600"
                              : "text-green-600 rotate-180"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {tx.type} SUI
                        </p>
                        <div className="text-sm text-gray-500">
                          <p>{tx.date}</p>
                          {tx.recipient && (
                            <p>
                              To: {tx.recipient.substring(0, 8)}...
                              {tx.recipient.substring(58)}
                            </p>
                          )}
                          {tx.sender && (
                            <p>
                              From: {tx.sender.substring(0, 8)}...
                              {tx.sender.substring(58)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          tx.type === "Sent" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {tx.type === "Sent" ? "-" : "+"}
                        {tx.amount} SUI
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            tx.status === "Success"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {tx.status}
                        </span>
                        {tx.id && tx.id !== "mock_faucet_tx" && (
                          <a
                            href={zkLoginService.getExplorerUrl(tx.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="View on explorer"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex flex-col items-center space-y-4 max-w-sm mx-4">
            <div className="w-8 h-8 animate-spin border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="text-lg font-medium text-gray-800 text-center">
              {loadingStep}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
