import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import RoulettePage from "./pages/Roulette";
import TokenABI from "./contracts/abi/GamaToken.json";
import RouletteABI from "./contracts/abi/Roulette.json";

// Add network constants
const NETWORKS = {
  MAINNET: {
    chainId: 50,
    name: "XDC Mainnet",
    rpcUrl: process.env.REACT_APP_XDC_MAINNET_RPC,
    contracts: {
      token: process.env.REACT_APP_TOKEN_ADDRESS,
      roulette: process.env.REACT_APP_ROULETTE_ADDRESS,
    },
  },
  APOTHEM: {
    chainId: 51,
    name: "XDC Apothem Testnet",
    rpcUrl: process.env.REACT_APP_XDC_APOTHEM_RPC,
    contracts: {
      token: process.env.REACT_APP_APOTHEM_TOKEN_ADDRESS,
      roulette: process.env.REACT_APP_APOTHEM_ROULETTE_ADDRESS,
    },
  },
};

const SUPPORTED_CHAIN_IDS = [
  NETWORKS.MAINNET.chainId,
  NETWORKS.APOTHEM.chainId,
];

// Enhanced Toast Component
const Toast = ({ message, type, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    className={`fixed bottom-4 right-4 max-w-md w-full mx-4 p-4 rounded-xl shadow-xl 
                backdrop-blur-md border transition-all duration-300 z-50
                ${
                  type === "success"
                    ? "bg-gaming-success/20 border-gaming-success/50"
                    : type === "error"
                    ? "bg-gaming-error/20 border-gaming-error/50"
                    : type === "warning"
                    ? "bg-gaming-warning/20 border-gaming-warning/50"
                    : "bg-gaming-info/20 border-gaming-info/50"
                }`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div
          className={`p-2 rounded-full 
                      ${
                        type === "success"
                          ? "bg-gaming-success/30"
                          : type === "error"
                          ? "bg-gaming-error/30"
                          : type === "warning"
                          ? "bg-gaming-warning/30"
                          : "bg-gaming-info/30"
                      }`}
        ></div>
        <p className="text-white font-medium text-shadow">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-white/80 hover:text-white transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </motion.div>
);

const NetworkWarning = () => (
  <div className="bg-gaming-error/90 text-white px-4 py-2 text-center">
    <p>
      Please switch to XDC Network(Chain ID: 50) or Apothem Testnet(Chain ID:
      51)
    </p>
    <div className="flex justify-center gap-4 mt-2">
      <button
        onClick={() => switchNetwork("mainnet")}
        className="px-4 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
      >
        Switch to XDC Mainnet
      </button>
      <button
        onClick={() => switchNetwork("testnet")}
        className="px-4 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
      >
        Switch to Apothem Testnet
      </button>
    </div>
  </div>
);

// Add network switching function
const switchNetwork = async (networkType) => {
  if (!window.ethereum) return;

  const network =
    networkType === "mainnet" ? NETWORKS.MAINNET : NETWORKS.APOTHEM;
  const chainIdHex = `0x${network.chainId.toString(16)}`;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    setTimeout(() => window.location.reload(), 1000);
  } catch (switchError) {
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: network.name,
              rpcUrls: [network.rpcUrl],
              nativeCurrency: {
                name: "XDC",
                symbol: "XDC",
                decimals: 18,
              },
            },
          ],
        });
      } catch (addError) {
        throw addError;
      }
    } else {
      throw switchError;
    }
  }
};

function App() {
  const [contracts, setContracts] = useState({
    token: null,
    roulette: null,
  });
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loadingStates, setLoadingStates] = useState({
    provider: true,
    contracts: true,
    wallet: false,
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const queryClient = new QueryClient();

  const dropdownRef = useRef(null);

  const addToast = useCallback((message, type = "info") => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if a toast with the same message already exists
    setToasts((prev) => {
      // Don't add if the same message already exists
      if (prev.some((toast) => toast.message === message)) {
        return prev;
      }

      // Limit to 3 toasts at a time
      const newToasts = [...prev, { id, message, type }];
      if (newToasts.length > 3) {
        return newToasts.slice(-3);
      }
      return newToasts;
    });

    // Clear this specific toast after 5 seconds
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);

    // Store timeout ID for cleanup
    return () => clearTimeout(timeoutId);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const handleError = useCallback(
    (error, context = "") => {
      // Prevent duplicate toasts by checking the error message and timestamp
      const errorKey = `${error.message || "Unknown error"}_${Math.floor(
        Date.now() / 1000
      )}`;

      // Don't show another toast if the same error occurred in the last second
      if (window._lastErrorKey === errorKey) {
        return;
      }
      window._lastErrorKey = errorKey;

      let errorMessage = "Something went wrong. Please try again later.";
      let errorType = "error";

      if (error.code === 4001) {
        errorMessage = "Transaction cancelled by user";
        errorType = "warning";
      } else if (error.code === -32002) {
        errorMessage =
          "Please check your wallet - a connection request is pending";
        errorType = "warning";
      } else if (error.code === -32603) {
        errorMessage =
          "Network connection issue. Please check your wallet connection.";
        errorType = "error";
      } else if (error.message?.includes("insufficient allowance")) {
        errorMessage =
          "Insufficient token allowance. Please approve tokens first.";
        errorType = "error";
      } else if (error.message?.includes("insufficient balance")) {
        errorMessage = "Insufficient token balance for this transaction.";
        errorType = "error";
      }

      addToast(errorMessage, errorType);
      return errorMessage;
    },
    [addToast]
  );

  const initializeContracts = useCallback(
    async (provider, account) => {
      try {
        const network = await provider.getNetwork();
        const currentChainId =
          typeof network.chainId === "bigint"
            ? Number(network.chainId)
            : Number(network.chainId);

        const networkKey = Object.keys(NETWORKS).find(
          (key) => NETWORKS[key].chainId === currentChainId
        );

        const networkConfig = NETWORKS[networkKey];
        if (!networkConfig) {
          throw new Error(
            `Unsupported network. Connected to chain ID: ${currentChainId}. Supported chain IDs: ${SUPPORTED_CHAIN_IDS.join(
              ", "
            )}`
          );
        }

        const tokenContract = new ethers.Contract(
          networkConfig.contracts.token,
          TokenABI.abi,
          provider
        );

        const rouletteContract = new ethers.Contract(
          networkConfig.contracts.roulette,
          RouletteABI.abi,
          provider
        );

        setContracts({
          token: tokenContract,
          roulette: rouletteContract,
        });

        setLoadingStates((prev) => ({ ...prev, contracts: false }));
        return { tokenContract, rouletteContract };
      } catch (error) {
        handleError(error, "initializeContracts");
        setLoadingStates((prev) => ({ ...prev, contracts: false }));
        return null;
      }
    },
    [handleError]
  );

  const handleChainChanged = useCallback(async (newChainId) => {
    const chainIdNumber = parseInt(newChainId);
    setChainId(chainIdNumber);

    if (!SUPPORTED_CHAIN_IDS.includes(chainIdNumber)) {
      setContracts({ token: null, roulette: null });
    } else {
      window.location.reload();
    }
  }, []);

  const validateNetwork = useCallback(async (provider) => {
    try {
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      if (!SUPPORTED_CHAIN_IDS.includes(currentChainId)) {
        throw new Error(
          `Please switch to a supported network. Connected to chain ID: ${currentChainId}`
        );
      }

      const currentNetwork = Object.values(NETWORKS).find(
        (n) => n.chainId === currentChainId
      );
      if (!currentNetwork) throw new Error("Network configuration not found");

      try {
        await provider.getBlockNumber();
      } catch (rpcError) {
        throw new Error(`Failed to connect to ${currentNetwork.name}`);
      }

      return currentChainId;
    } catch (error) {
      throw error;
    }
  }, []);

  const connectWallet = async () => {
    setLoadingStates((prev) => ({ ...prev, wallet: true }));

    try {
      if (!window.ethereum) {
        throw new Error("Please install MetaMask to use this application");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);

      if (!SUPPORTED_CHAIN_IDS.includes(currentChainId)) {
        await switchNetwork("mainnet");
        return;
      }

      await validateNetwork(provider);

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found");
      }

      await initializeContracts(provider, accounts[0]);
      setAccount(accounts[0]);
      addToast("Wallet connected successfully!", "success");
    } catch (err) {
      handleError(err, "connectWallet");
      setContracts({ token: null, roulette: null });
    } finally {
      setLoadingStates((prev) => ({ ...prev, wallet: false }));
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!window.ethereum) {
        setLoadingStates((prev) => ({
          ...prev,
          provider: false,
          contracts: false,
        }));
        return;
      }

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await validateNetwork(provider);

        if (!mounted) return;

        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });

        if (!mounted) return;

        if (accounts.length > 0) {
          await initializeContracts(provider, accounts[0]);
          setAccount(accounts[0]);
        }
      } catch (err) {
        handleError(err, "initialization");
      } finally {
        if (mounted) {
          setLoadingStates((prev) => ({
            ...prev,
            provider: false,
            contracts: false,
          }));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [validateNetwork, initializeContracts, handleError]);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAccount("");
          addToast("Please connect your wallet", "warning");
        } else {
          setAccount(accounts[0]);
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [addToast, handleChainChanged]);

  const handleLogout = () => {
    setAccount("");
    setContracts({ token: null, roulette: null });
    addToast("Logged out successfully", "success");
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-white">
        {chainId && !SUPPORTED_CHAIN_IDS.includes(chainId) && (
          <NetworkWarning />
        )}

        <header className="px-6 border-b border-[#22AD74]/20 bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto flex justify-between items-center h-16">
            <div className="flex items-center">
              <a
                href="https://gamacoin.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-90 transition-all duration-300 group"
              >
                <img
                  src="/assets/gama-logo.svg"
                  alt="GAMA Logo"
                  className="h-8 sm:h-9 group-hover:scale-105 transition-transform duration-300"
                />
                <span className="text-xl sm:text-2xl font-bold text-[#22AD74] bg-gradient-to-r from-[#22AD74] to-[#22AD74]/70 text-transparent bg-clip-text group-hover:to-[#22AD74] transition-all duration-300">
                  Roulette
                </span>
              </a>
            </div>

            <div className="hidden sm:flex items-center gap-4">
              <button
                onClick={() =>
                  window.open(
                    "https://app.xspswap.finance/#/swap?outputCurrency=0x678adf7955d8f6dcaa9e2fcc1c5ba70bccc464e6",
                    "_blank"
                  )
                }
                className="text-gray-600 hover:text-[#22AD74] transition-all duration-300 flex items-center gap-2 font-medium hover:-translate-y-0.5"
              >
                Buy GAMA
              </button>

              <div className="h-4 w-px bg-gray-200"></div>

              <a
                href="https://diceroll.gamacoin.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-[#22AD74] transition-all duration-300 flex items-center gap-2 font-medium hover:-translate-y-0.5"
              >
                Dice
              </a>

              <div className="h-4 w-px bg-gray-200"></div>

              <a
                href="https://flipcoin.gamacoin.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-[#22AD74] transition-all duration-300 flex items-center gap-2 font-medium hover:-translate-y-0.5"
              >
                Coin
              </a>

              <div className="h-4 w-px bg-gray-200"></div>

              <a
                href="https://gamacoin.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-[#22AD74] transition-all duration-300 flex items-center gap-2 font-medium hover:-translate-y-0.5"
              >
                Home
              </a>

              <div className="h-4 w-px bg-gray-200"></div>

              {account ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="px-4 py-2 rounded-lg text-sm bg-[#22AD74]/5 border border-[#22AD74]/20 hover:bg-[#22AD74]/10 transition-colors flex items-center gap-2"
                  >
                    <span className="text-gray-900">
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${
                        dropdownOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-lg border border-gray-200 py-1 z-50"
                      >
                        <button
                          onClick={() => {
                            switchNetwork("mainnet");
                            setDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-[#22AD74]/5 flex items-center gap-2"
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              chainId === 50 ? "bg-[#22AD74]" : "bg-gray-300"
                            }`}
                          />
                          Switch to Mainnet
                        </button>
                        <button
                          onClick={() => {
                            switchNetwork("testnet");
                            setDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-[#22AD74]/5 flex items-center gap-2"
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              chainId === 51 ? "bg-[#22AD74]" : "bg-gray-300"
                            }`}
                          />
                          Switch to Testnet
                        </button>
                        <div className="h-px bg-gray-200 my-1" />
                        <button
                          onClick={() => {
                            handleLogout();
                            setDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          Logout
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  className="px-6 py-2 rounded-lg bg-[#22AD74] text-white border border-[#22AD74]/20 hover:bg-[#22AD74]/90 transition-all duration-300 flex items-center gap-2"
                  disabled={loadingStates.wallet}
                >
                  {loadingStates.wallet ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="responsive-container">
          <RoulettePage
            contracts={contracts}
            account={account}
            onError={handleError}
            addToast={addToast}
          />
        </main>

        <AnimatePresence mode="popLayout">
          <div className="fixed bottom-4 right-4 space-y-2 z-50">
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                layout
              >
                <Toast
                  message={toast.message}
                  type={toast.type}
                  onClose={() => removeToast(toast.id)}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
    </QueryClientProvider>
  );
}

export default App;
