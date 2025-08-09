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
  KeyIcon,
} from "@heroicons/react/24/outline";
import { HybridWalletService } from "@/lib/real-sui-wallet";

// Initialize hybrid wallet service
const hybridWallet = new HybridWalletService();

export default function HybridOAuthWalletComponent() {
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

  // Faucet states
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [exportedKey, setExportedKey] = useState<string | null>(null);

  // ----------------------
  // Lifecycle
  // ----------------------
  useEffect(() => {
    const handleOAuthResult = async () => {
      const authResult = searchParams.get("auth");

      if (authResult === "success") {
        const githubToken = sessionStorage.getItem("github_token");
        const googleToken = sessionStorage.getItem("google_token");
        const token = githubToken || googleToken;

        if (token) {
          setIsLoading(true);
          const provider = githubToken ? "GitHub" : "Google";
          setLoadingStep(`🔒 Creating real wallet from ${provider} login...`);

          try {
            const result = await hybridWallet.handleOAuthCallback(token);
            if (result.success) {
              setIsLoggedIn(true);
              setExportedKey(result.privateKey!); // Show private key for backup
              showNotification(`✅ Real wallet created from ${provider} login!`);
              await loadWalletData();

              sessionStorage.removeItem("github_token");
              sessionStorage.removeItem("google_token");
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
        const errorMessage = searchParams.get("message") || "Authentication failed";
        showNotification(errorMessage, "error");
        router.replace("/");
      } else {
        // Regular app initialization
        if (hybridWallet.restoreSession()) {
          setIsLoggedIn(true);
          loadWalletData();
        }
      }
    };

    setAvailableProviders(hybridWallet.getAvailableProviders());
    handleOAuthResult();
  }, [searchParams, router]);

  // ----------------------
  // Helpers
  // ----------------------
  const showNotification = (message: string, type: string = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const isRealWallet = () => {
    // Fallback local method to determine if this is a "real" wallet.
    // The HybridWalletService in your repo doesn't expose isRealWallet() consistently,
    // so we infer based on presence of a wallet address.
    return !!hybridWallet.walletAddress;
  };

  // ----------------------
  // Core actions
  // ----------------------
  const loadWalletData = async () => {
    try {
      setLoadingStep("📊 Loading wallet data...");
      const [walletBalance, txHistory] = await Promise.all([
        hybridWallet.getBalance(),
        hybridWallet.getTransactionHistory(),
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

  const handleProviderLogin = async (provider: "github" | "google") => {
    setIsLoading(true);
    setLoadingStep(`🔐 Redirecting to ${provider} OAuth...`);

    try {
      const result = await hybridWallet.initiateLogin(provider);

      if (result.success && result.authUrl) {
        // navigate away to provider
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

  const handleLogout = () => {
    hybridWallet.logout();
    setIsLoggedIn(false);
    setBalance("0");
    setTransactions([]);
    setSendForm({ recipient: "", amount: "", error: "" });
    setExportedKey(null);
    showNotification("Logged out successfully");
  };

  const refreshBalance = async () => {
    setIsRefreshingBalance(true);
    try {
      const newBalance = await hybridWallet.getBalance();
      setBalance(newBalance);
      showNotification("Balance updated!");
    } catch (error) {
      showNotification("Failed to refresh balance", "error");
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  const handleRequestFaucet = async () => {
    setFaucetLoading(true);
    setLoadingStep(`🚰 Requesting ${hybridWallet.getNetworkName()} SUI...`);

    try {
      const result = await hybridWallet.requestFaucetSui();

      if (result.success) {
        showNotification(`🎉 Received REAL ${hybridWallet.getNetworkName()} SUI!`, "success");
        // small delay then refresh
        setTimeout(async () => {
          await refreshBalance();
        }, 3000);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      showNotification((error as Error).message, "error");
    } finally {
      setFaucetLoading(false);
      setLoadingStep("");
    }
  };

  const handleSendTransaction = async () => {
    setSendForm((prev) => ({ ...prev, error: "" }));

    // Validation
    if (!sendForm.recipient?.trim() || !sendForm.amount?.trim()) {
      setSendForm((prev) => ({ ...prev, error: "Please fill in all fields" }));
      return;
    }

    const amount = parseFloat(sendForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setSendForm((prev) => ({ ...prev, error: "Amount must be a positive number" }));
      return;
    }

    if (amount > parseFloat(balance)) {
      setSendForm((prev) => ({ ...prev, error: "Insufficient balance" }));
      return;
    }

    if (!sendForm.recipient.match(/^0x[a-fA-F0-9]{64}$/)) {
      setSendForm((prev) => ({
        ...prev,
        error: "Invalid recipient address format (must be 0x followed by 64 hex characters)",
      }));
      return;
    }

    setIsLoading(true);
    setLoadingStep("📝 Creating REAL transaction...");

    try {
      const result = await hybridWallet.sendTransaction(sendForm.recipient, sendForm.amount);

      if (result.success && result.txId) {
        showNotification(`✅ REAL transaction sent! ${result.txId.substring(0, 10)}...`);
        setSendForm({ recipient: "", amount: "", error: "" });
        await loadWalletData();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setSendForm((prev) => ({ ...prev, error: (error as Error).message }));
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // small helper to populate inputs
  const updateSendForm = (changes: Partial<typeof sendForm>) => {
    setSendForm((prev) => ({ ...prev, ...changes }));
  };

  const copyToClipboard = async (text: string, label: string = "Text") => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification(`${label} copied!`);
    } catch (error) {
      showNotification("Failed to copy", "error");
    }
  };

  // ----------------------
  // Provider UI components
  // ----------------------
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "github":
        return (
          <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
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
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getProviderButton = (provider: string) => {
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const baseClasses = "w-full font-semibold py-4 px-6 rounded-xl transition duration-200 flex items-center justify-center space-x-3 shadow-sm";

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
    const provider = hybridWallet.getCurrentProvider();
    if (!provider) return "Unknown";
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  // ----------------------
  // Render
  // ----------------------
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 via-blue-600 to-purple-700 flex items-center justify-center p-4">
        {/* Notification */}
        {notification && (
          <div
            className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
              notification.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
            }`}>
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
            <div className="bg-gradient-to-r from-green-500 to-blue-600 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <ShieldCheckIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Hybrid Sui Wallet</h1>
            <p className="text-gray-600">Login with OAuth, get a real Sui wallet</p>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 animate-spin mx-auto mb-4">
                <div className="w-full h-full border-4 border-green-600 border-t-transparent rounded-full"></div>
              </div>
              <p className="text-lg font-medium text-gray-700 mb-4">{loadingStep}</p>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-green-500 to-blue-600 h-full rounded-full animate-pulse"></div>
              </div>
              <p className="text-sm text-gray-500 mt-4">Creating your real Sui wallet from OAuth identity...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Provider Login Buttons */}
              {availableProviders.length > 0 ? (
                <div className="space-y-4">
                  {availableProviders.map((provider) => (
                    <div key={provider}>{getProviderButton(provider)}</div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Providers Configured</h3>
                  <p className="text-gray-600 text-sm">Please configure your OAuth providers in the environment variables:</p>
                  <div className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 text-left">
                    <p>NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_id</p>
                    <p>NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_id</p>
                  </div>
                </div>
              )}

              {availableProviders.length > 0 && (
                <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center">
                    <ShieldCheckIcon className="w-5 h-5 mr-2" />
                    How Hybrid Wallet Works
                  </h3>
                  <ul className="text-sm text-green-800 space-y-2">
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Login with your GitHub/Google account
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      We create a REAL Sui wallet from your identity
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Same login = same wallet every time
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Do REAL transactions on Sui blockchain
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Show private key after creation */}
          {exportedKey && (
            <div className="mt-6 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Save Your Private Key</h3>
              <div className="bg-gray-800 text-green-400 p-2 rounded font-mono text-xs break-all">{exportedKey}</div>
              <button onClick={() => copyToClipboard(exportedKey, "Private key")} className="w-full mt-2 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg text-sm">Copy Private Key</button>
              <p className="text-yellow-700 text-xs mt-2">Save this private key safely! You can use it to restore your wallet later.</p>
            </div>
          )}
        </div>
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
            notification.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
          }`}>
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
              <div className="bg-gradient-to-r from-green-500 to-blue-600 rounded-xl p-3">
                <WalletIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Sui Wallet</h1>
                <div className="flex items-center space-x-2">
                  <UserIcon className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">{hybridWallet.user?.email}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{getCurrentProviderDisplay()}</span>
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">{hybridWallet.getNetworkName()}</span>
                </div>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition duration-200">
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
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition duration-200 ${
                  activeTab === key
                    ? "border-green-600 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
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
            <div className="lg:col-span-2 bg-gradient-to-br from-green-600 via-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-green-100 text-sm mb-2">Balance</p>
                  <div className="flex items-center space-x-3">
                    <p className="text-4xl font-bold">{balance} SUI</p>
                    <button onClick={refreshBalance} disabled={isRefreshingBalance} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition disabled:opacity-50" title="Refresh balance">
                      <ArrowPathIcon className={`w-4 h-4 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <p className="text-green-100 text-sm">OAuth Login{hybridWallet.getNetworkName()} SUI</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3">
                  <WalletIcon className="w-8 h-8 text-white" />
                </div>
              </div>

              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                <p className="text-green-100 text-xs mb-2">Your Wallet Address</p>
                <div className="flex items-center justify-between">
                  <p className="text-white font-mono text-sm break-all mr-4">{hybridWallet.walletAddress}</p>
                  <button onClick={() => copyToClipboard(hybridWallet.walletAddress || "", "Address")} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition" title="Copy address">
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button onClick={() => setActiveTab("send")} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2">
                    <PaperAirplaneIcon className="w-4 h-4" />
                    <span>Send SUI</span>
                  </button>

      

                  {/* Real Faucet Button */}
                  <button onClick={handleRequestFaucet} disabled={!hybridWallet.isFaucetAvailable() || faucetLoading || isLoading} className={`w-full py-3 px-4 rounded-xl font-medium transition duration-200 flex items-center justify-center space-x-2 ${
                    !hybridWallet.isFaucetAvailable()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : faucetLoading || isLoading
                        ? 'bg-emerald-400 text-white cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}>
                    {faucetLoading ? (
                      <>
                        <div className="w-4 h-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                        <span>Getting Real SUI...</span>
                      </>
                    ) : !hybridWallet.isFaucetAvailable() ? (
                      <>
                        <span>🚫 Faucet Not Available</span>
                      </>
                    ) : (
                      <>
                        <span>🚰 Get Real {hybridWallet.getNetworkName()} SUI</span>
                      </>
                    )}
                  </button>

                  {/* Explorer link */}
                  <a href={hybridWallet.getWalletExplorerUrl()} target="_blank" rel="noopener noreferrer" className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2">
                    <EyeIcon className="w-4 h-4" />
                    <span>View on Explorer</span>
                  </a>


                  {/* ✅ WALLET TYPE INDICATOR */}
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2 flex items-center"><ShieldCheckIcon className="w-4 h-4 mr-2" />Wallet Type</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-800">Type:</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isRealWallet() ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {isRealWallet() ? '✅ Real Wallet' : '🎭 Mock Wallet'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-blue-800">Transactions:</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isRealWallet() ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {isRealWallet() ? 'Real' : 'Simulated'}
                        </span>
                      </div>
                      <div className="text-xs text-blue-700 mt-2">{isRealWallet() ? '💰 Can send/receive real SUI on blockchain' : '🎭 Demo mode - transactions are simulated'}</div>
                    </div>
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
                            href={hybridWallet.getExplorerUrl(tx.id)}
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
