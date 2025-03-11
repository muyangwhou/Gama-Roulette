import React, { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import bgOverlay from "../assets/bg-overlay1.jpg";

// Contract constants
const CONTRACT_CONSTANTS = {
  MAX_BETS_PER_SPIN: 15,
  MAX_BET_AMOUNT: BigInt("100000000000000000000000"), // 100k tokens
  MAX_TOTAL_BET_AMOUNT: BigInt("500000000000000000000000"), // 500k tokens
  MAX_POSSIBLE_PAYOUT: BigInt("17500000000000000000000000"), // 17.5M tokens
  MINTER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")),
  BURNER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE")),
};

// Contract error messages
const CONTRACT_ERRORS = {
  InvalidBetParameters: "Invalid bet parameters. Please check your bets.",
  InvalidBetType: "Invalid bet type selected.",
  InsufficientUserBalance: "Insufficient balance to place bet.",
  TransferFailed: "Token transfer failed.",
  BurnFailed: "Token burn failed.",
  MintFailed: "Token mint failed.",
  MissingContractRole: "Contract is missing required roles.",
  InsufficientAllowance: "Insufficient token allowance.",
  MaxPayoutExceeded: "Maximum potential payout exceeded.",
};

// Updated BetTypes to match contract exactly
const BetTypes = {
  // Base types (matching contract)
  STRAIGHT: 0,
  DOZEN_FIRST: 1,
  DOZEN_SECOND: 2,
  DOZEN_THIRD: 3,
  COLUMN_FIRST: 4,
  COLUMN_SECOND: 5,
  COLUMN_THIRD: 6,
  RED: 7,
  BLACK: 8,
  EVEN: 9,
  ODD: 10,
  LOW: 11,
  HIGH: 12,

  // Helper functions
  isValid: function (type) {
    return type >= 0 && type <= 12;
  },

  // Get numbers for a bet type
  getNumbers: function (type) {
    switch (type) {
      case this.STRAIGHT:
        return []; // Numbers provided directly for straight bets
      case this.DOZEN_FIRST:
        return Array.from({ length: 12 }, (_, i) => i + 1);
      case this.DOZEN_SECOND:
        return Array.from({ length: 12 }, (_, i) => i + 13);
      case this.DOZEN_THIRD:
        return Array.from({ length: 12 }, (_, i) => i + 25);
      case this.COLUMN_FIRST:
        return Array.from({ length: 12 }, (_, i) => 1 + i * 3);
      case this.COLUMN_SECOND:
        return Array.from({ length: 12 }, (_, i) => 2 + i * 3);
      case this.COLUMN_THIRD:
        return Array.from({ length: 12 }, (_, i) => 3 + i * 3);
      case this.RED:
        return [
          1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
        ];
      case this.BLACK:
        return [
          2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
        ];
      case this.EVEN:
        return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
      case this.ODD:
        return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
      case this.LOW:
        return Array.from({ length: 18 }, (_, i) => i + 1);
      case this.HIGH:
        return Array.from({ length: 18 }, (_, i) => i + 19);
      default:
        return [];
    }
  },
};

// Update betting options arrays to match contract order
const dozenBettingOptions = [
  { label: "1st 12", type: BetTypes.DOZEN_FIRST },
  { label: "2nd 12", type: BetTypes.DOZEN_SECOND },
  { label: "3rd 12", type: BetTypes.DOZEN_THIRD },
];

const bottomBettingOptions = [
  { label: "1-18", type: BetTypes.LOW },
  { label: "EVEN", type: BetTypes.EVEN },
  { label: "RED", type: BetTypes.RED },
  { label: "BLACK", type: BetTypes.BLACK },
  { label: "ODD", type: BetTypes.ODD },
  { label: "19-36", type: BetTypes.HIGH },
];

// Chip values for betting
const CHIP_VALUES = [
  { value: "1000000000000000000", label: "1" },
  { value: "5000000000000000000", label: "5" },
  { value: "50000000000000000000", label: "50" },
  { value: "500000000000000000000", label: "500" },
  { value: "1000000000000000000000", label: "1K" },
  { value: "5000000000000000000000", label: "5K" },
];

// Define red numbers for the roulette board
const redNumbers = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

// Helper function to check if a number is red
const isRed = (number) => redNumbers.includes(Number(number));

// Last Number Display component
const LastNumberDisplay = ({ number, getNumberBackgroundClass }) => {
  const bgClass = getNumberBackgroundClass(number);
  const isPlaceholder =
    number === null || number === undefined || isNaN(number);

  return (
    <div className="flex items-center justify-center w-24">
      <div className="relative w-full">
        <div className="text-sm text-gray-600 font-medium text-center mb-2">
          Last Number
        </div>
        <div
          className={`aspect-square w-full rounded-xl flex items-center justify-center font-bold relative transform transition-all duration-500 hover:scale-105 ${bgClass} shadow-lg hover:shadow-2xl animate-float`}
        >
          <span className="text-3xl font-bold animate-fadeIn">
            {isPlaceholder ? "-" : number}
          </span>
        </div>
      </div>
    </div>
  );
};

// Add BetChip component before BettingBoard
const BetChip = ({ amount, className = "", style = {} }) => {
  // Helper function to format large numbers
  const formatAmount = (value) => {
    const num = Number(value);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    // For small numbers, ensure at least one decimal place if not whole
    return num % 1 === 0 ? num.toString() : num.toFixed(1);
  };

  return (
    <div
      className={`absolute w-8 h-8 rounded-full bg-[#22AD74] border-2 border-white/50 flex items-center justify-center text-[11px] font-bold shadow-lg text-white transform hover:scale-110 transition-all duration-300 group ${className}`}
      style={style}
    >
      <span className="group-hover:opacity-0 transition-opacity duration-200">
        {formatAmount(amount)}
      </span>
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {amount}
      </span>
    </div>
  );
};

const BettingBoard = ({
  onBetSelect,
  selectedBets,
  disabled,
  selectedChipValue,
  lastWinningNumber,
  getNumberBackgroundClass,
  onUndoBet,
  onClearBets,
}) => {
  // Add hover state
  const [hoveredNumbers, setHoveredNumbers] = useState([]);

  // Helper function to check if a number is currently hovered
  const isNumberHovered = useCallback(
    (number) => {
      return hoveredNumbers.includes(number);
    },
    [hoveredNumbers]
  );

  // Update hover handlers
  const handleMouseEnter = useCallback((number) => {
    setHoveredNumbers([number]);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredNumbers([]);
  }, []);

  // Helper function to check if a bet type is currently hovered
  const isBetTypeHovered = useCallback(
    (type, numbers) => {
      if (!hoveredNumbers.length) return false;
      // Only consider this bet type hovered if ALL its numbers are hovered AND
      // the number of hovered numbers matches exactly (prevents overlap highlighting)
      return (
        numbers.every((num) => hoveredNumbers.includes(num)) &&
        hoveredNumbers.length === numbers.length
      );
    },
    [hoveredNumbers]
  );

  // Helper function to get total bet amount for a position
  const getBetAmount = useCallback(
    (numbers, type) => {
      try {
        // For straight bets
        if (type === BetTypes.STRAIGHT) {
          const bet = selectedBets.find(
            (bet) =>
              bet.type === type &&
              bet.numbers?.[0] ===
                (Array.isArray(numbers) ? numbers[0] : numbers)
          );
          // Return exact amount without rounding for small numbers
          return bet ? parseFloat(ethers.formatEther(bet.amount)) : 0;
        }

        // For all other bets
        const bet = selectedBets.find((bet) => bet.type === type);
        // Return exact amount without rounding for small numbers
        return bet ? parseFloat(ethers.formatEther(bet.amount)) : 0;
      } catch (error) {
        console.error("Error in getBetAmount:", error);
        return 0;
      }
    },
    [selectedBets]
  );

  const handleBet = useCallback(
    (numbers, type) => {
      if (!disabled) {
        onBetSelect(numbers, type);
      }
    },
    [disabled, onBetSelect]
  );

  // Define the grid layout in rows (top to bottom)
  const numberGrid = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
  ];

  return (
    <div className="flex flex-col gap-3 relative">
      {/* Main betting grid */}
      <div className="grid grid-cols-[auto_45px_1fr] gap-2">
        <div className="flex flex-col gap-2">
          {/* Last Winning Number Display */}
          <LastNumberDisplay
            number={lastWinningNumber}
            getNumberBackgroundClass={getNumberBackgroundClass}
          />

          {/* Action Buttons under Last Number */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onUndoBet}
              className="w-24 h-10 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 border border-gray-200"
              disabled={disabled || selectedBets.length === 0}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
              </svg>
              Undo
            </button>
            <button
              onClick={onClearBets}
              className="w-24 h-10 bg-white hover:bg-red-50 text-red-600 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 border border-red-200"
              disabled={disabled || selectedBets.length === 0}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Zero */}
        <div className="row-span-3 flex items-stretch">
          <button
            onClick={() => handleBet([0], BetTypes.STRAIGHT)}
            onMouseEnter={() => handleMouseEnter(0)}
            onMouseLeave={handleMouseLeave}
            disabled={disabled}
            className={`relative rounded-xl text-xl font-bold transition-all duration-300 transform border hover:z-10 active:scale-95 cursor-pointer w-[45px] h-[147px] flex items-center justify-center shadow-lg
              ${
                isNumberHovered(0)
                  ? "bg-gradient-to-br from-[#22AD74] to-[#22AD74]/80 ring-2 ring-offset-2 ring-[#22AD74] scale-105 z-10 border-[#22AD74]"
                  : "bg-gradient-to-br from-[#22AD74]/90 to-[#22AD74]/70 border-[#22AD74]/20 hover:scale-105 hover:from-[#22AD74] hover:to-[#22AD74]"
              }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-white text-2xl">0</span>
              {getBetAmount([0], BetTypes.STRAIGHT) > 0 && (
                <BetChip
                  amount={getBetAmount([0], BetTypes.STRAIGHT)}
                  className="absolute -top-3 -right-3 z-30"
                />
              )}
            </div>
          </button>
        </div>

        {/* Numbers grid */}
        <div className="grid grid-rows-3 gap-2 h-[147px]">
          {numberGrid.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[repeat(12,minmax(45px,1fr))_45px] gap-2 h-[45px]"
            >
              {row.map((number) => (
                <button
                  key={number}
                  onClick={() => handleBet([number], BetTypes.STRAIGHT)}
                  onMouseEnter={() => handleMouseEnter(number)}
                  onMouseLeave={handleMouseLeave}
                  disabled={disabled}
                  className={`relative rounded-xl text-xl font-bold transition-all duration-300 transform border border-gray-200 hover:scale-105 hover:z-10 active:scale-95 cursor-pointer bg-white shadow-lg hover:shadow-2xl text-gray-900 ${
                    isRed(number)
                      ? "bg-gradient-to-br from-gaming-primary/90 to-gaming-accent/90 hover:from-gaming-primary hover:to-gaming-accent border-gaming-primary/20 hover:shadow-gaming-primary/30"
                      : "bg-gradient-to-br from-gray-800/90 to-gray-900/90 hover:from-gray-700 hover:to-gray-800 border-gray-700/20 hover:shadow-gray-500/30"
                  } ${
                    isNumberHovered(number)
                      ? "ring-2 ring-offset-2 ring-[#22AD74] scale-105 z-10 bg-[#22AD74]/10"
                      : ""
                  }`}
                >
                  <span className="text-white/90 text-xl">{number}</span>
                  {getBetAmount([number], BetTypes.STRAIGHT) > 0 && (
                    <BetChip
                      amount={getBetAmount([number], BetTypes.STRAIGHT)}
                      className="absolute -top-3 -right-3"
                    />
                  )}
                </button>
              ))}
              {/* 2:1 button for each row */}
              <button
                onClick={() => {
                  const columnType =
                    rowIndex === 0
                      ? BetTypes.COLUMN_THIRD // Top row (3,6,9...)
                      : rowIndex === 1
                      ? BetTypes.COLUMN_SECOND // Middle row (2,5,8...)
                      : BetTypes.COLUMN_FIRST; // Bottom row (1,4,7...)
                  const numbers = BetTypes.getNumbers(columnType);
                  handleBet(numbers, columnType);
                }}
                onMouseEnter={() => {
                  const columnType =
                    rowIndex === 0
                      ? BetTypes.COLUMN_THIRD
                      : rowIndex === 1
                      ? BetTypes.COLUMN_SECOND
                      : BetTypes.COLUMN_FIRST;
                  const numbers = BetTypes.getNumbers(columnType);
                  setHoveredNumbers(numbers);
                }}
                onMouseLeave={handleMouseLeave}
                disabled={disabled}
                className={`h-[45px] rounded-xl relative text-[#22AD74] border border-[#22AD74] shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-105 
                bg-white hover:bg-[#22AD74]/5 hover:shadow-[#22AD74]/30`}
              >
                2:1
                {(() => {
                  const columnType =
                    rowIndex === 0
                      ? BetTypes.COLUMN_THIRD
                      : rowIndex === 1
                      ? BetTypes.COLUMN_SECOND
                      : BetTypes.COLUMN_FIRST;
                  const amount = getBetAmount([], columnType);
                  return (
                    amount > 0 && (
                      <BetChip
                        amount={amount}
                        className="absolute -top-3 -right-3"
                      />
                    )
                  );
                })()}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dozen bets */}
      <div className="grid grid-cols-3 gap-2 -mt-20 w-[calc(85%-92px)] ml-[160px]">
        {dozenBettingOptions.map((option) => (
          <button
            key={option.label}
            onClick={() => {
              const numbers = BetTypes.getNumbers(option.type);
              handleBet(numbers, option.type);
            }}
            onMouseEnter={() => {
              const numbers = BetTypes.getNumbers(option.type);
              setHoveredNumbers(numbers);
            }}
            onMouseLeave={handleMouseLeave}
            disabled={disabled}
            className={`h-[45px] rounded-xl relative text-[#22AD74] border border-[#22AD74] shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-105 
              bg-white hover:bg-[#22AD74]/5 hover:shadow-[#22AD74]/30`}
          >
            {option.label}
            {getBetAmount(BetTypes.getNumbers(option.type), option.type) >
              0 && (
              <BetChip
                amount={getBetAmount(
                  BetTypes.getNumbers(option.type),
                  option.type
                )}
                className="absolute -top-3 -right-3"
              />
            )}
          </button>
        ))}
      </div>

      {/* Bottom betting options */}
      <div className="grid grid-cols-6 gap-2 -mt-1 w-[calc(85%-92px)] ml-[160px]">
        {bottomBettingOptions.map((option) => (
          <button
            key={option.label}
            onClick={() => {
              const numbers = BetTypes.getNumbers(option.type);
              handleBet(numbers, option.type);
            }}
            onMouseEnter={() => {
              const numbers = BetTypes.getNumbers(option.type);
              setHoveredNumbers(numbers);
            }}
            onMouseLeave={handleMouseLeave}
            disabled={disabled}
            className={`h-[45px] rounded-xl relative ${
              option.type === BetTypes.RED
                ? "bg-gradient-to-br from-gaming-primary/90 to-gaming-accent/90 hover:from-gaming-primary hover:to-gaming-accent border-gaming-primary/20 hover:shadow-gaming-primary/30 text-white"
                : option.type === BetTypes.BLACK
                ? "bg-gradient-to-br from-gray-800/90 to-gray-900/90 hover:from-gray-700 hover:to-gray-800 border-gray-700/20 hover:shadow-gray-500/30 text-white"
                : "text-[#22AD74] border border-[#22AD74] bg-white hover:bg-[#22AD74]/10 hover:shadow-[#22AD74]/30"
            } shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-105 ${
              isBetTypeHovered(option.type, BetTypes.getNumbers(option.type))
                ? "ring-2 ring-offset-2 ring-[#22AD74] scale-105 z-10 bg-[#22AD74]/10"
                : ""
            }`}
          >
            {option.label}
            {getBetAmount(BetTypes.getNumbers(option.type), option.type) >
              0 && (
              <BetChip
                amount={getBetAmount(
                  BetTypes.getNumbers(option.type),
                  option.type
                )}
                className="absolute -top-3 -right-3"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

//85%-92px160px

// Add helper function to get bet type name
const getBetTypeName = (betType, numbers) => {
  // Convert contract bet type (0-8) to our format (0-12)
  const convertContractBetType = (type, numbers) => {
    const t = Number(type);
    switch (t) {
      case 0:
        return BetTypes.STRAIGHT;
      case 1: // Dozen
        if (!numbers || !numbers.length) return BetTypes.DOZEN_FIRST;
        if (numbers[0] <= 12) return BetTypes.DOZEN_FIRST;
        if (numbers[0] <= 24) return BetTypes.DOZEN_SECOND;
        return BetTypes.DOZEN_THIRD;
      case 2: // Column
        if (!numbers || !numbers.length) return BetTypes.COLUMN_FIRST;
        const remainder = numbers[0] % 3;
        if (remainder === 1) return BetTypes.COLUMN_FIRST;
        if (remainder === 2) return BetTypes.COLUMN_SECOND;
        return BetTypes.COLUMN_THIRD;
      case 3:
        return BetTypes.RED;
      case 4:
        return BetTypes.BLACK;
      case 5:
        return BetTypes.EVEN;
      case 6:
        return BetTypes.ODD;
      case 7:
        return BetTypes.LOW;
      case 8:
        return BetTypes.HIGH;
      default:
        return type; // Already in our format
    }
  };

  const convertedType = convertContractBetType(betType, numbers);

  switch (convertedType) {
    case BetTypes.STRAIGHT:
      return `Number ${numbers[0]}`;
    case BetTypes.DOZEN_FIRST:
      return "First Dozen (1-12)";
    case BetTypes.DOZEN_SECOND:
      return "Second Dozen (13-24)";
    case BetTypes.DOZEN_THIRD:
      return "Third Dozen (25-36)";
    case BetTypes.COLUMN_FIRST:
      return "First Column";
    case BetTypes.COLUMN_SECOND:
      return "Second Column";
    case BetTypes.COLUMN_THIRD:
      return "Third Column";
    case BetTypes.RED:
      return "Red";
    case BetTypes.BLACK:
      return "Black";
    case BetTypes.EVEN:
      return "Even";
    case BetTypes.ODD:
      return "Odd";
    case BetTypes.LOW:
      return "Low (1-18)";
    case BetTypes.HIGH:
      return "High (19-36)";
    default:
      return "Unknown Bet";
  }
};

// Add BettingHistory component
const BettingHistory = ({ userData, isLoading, error }) => {
  const [filter, setFilter] = useState("all");
  const [isExpanded, setIsExpanded] = useState(false);

  // Group bets by timestamp
  const groupedBets = useMemo(() => {
    if (!userData || !Array.isArray(userData) || userData.length === 0) {
      return [];
    }

    return userData
      .map((bet) => ({
        timestamp: bet.timestamp,
        winningNumber: bet.winningNumber,
        bets: bet.bets,
        totalAmount: bet.totalAmount,
        totalPayout: bet.totalPayout,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [userData]);

  // Filter bets based on selected filter
  const filteredBets = useMemo(() => {
    if (!groupedBets) return [];

    switch (filter) {
      case "wins":
        return groupedBets.filter((bet) => bet.totalPayout > bet.totalAmount);
      case "losses":
        return groupedBets.filter((bet) => bet.totalPayout < bet.totalAmount);
      default:
        return groupedBets;
    }
  }, [groupedBets, filter]);

  if (isLoading) {
    return (
      <div className="betting-history bg-white p-6 space-y-6 rounded-xl border border-gray-200">
        <h3 className="text-2xl font-bold text-gray-900">Recent Bets</h3>
        <div className="flex justify-center items-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="betting-history bg-white p-6 space-y-6 rounded-xl border border-gray-200">
        <h3 className="text-2xl font-bold text-gray-900">Recent Bets</h3>
        <div className="text-center text-red-600 py-4">
          Failed to load betting history. Please try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="betting-history bg-white rounded-2xl border border-gray-200 shadow-2xl hover:shadow-3xl transition-all duration-300 p-6">
      {/* History Header with Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Betting History
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === "all"
                  ? "bg-white text-gray-900 border-2 border-gray-200"
                  : "text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("wins")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === "wins"
                  ? "bg-white text-[#22AD74] border-2 border-[#22AD74]"
                  : "text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200"
              }`}
            >
              Wins
            </button>
            <button
              onClick={() => setFilter("losses")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === "losses"
                  ? "bg-white text-red-600 border-2 border-red-200"
                  : "text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200"
              }`}
            >
              Losses
            </button>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-600 hover:text-gray-900 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 border border-gray-200"
        >
          {isExpanded ? "↑" : "↓"}
        </button>
      </div>

      {/* History List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {filteredBets.map((group, index) => (
                <motion.div
                  key={`${group.timestamp}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                    delay: index * 0.05,
                  }}
                  className={`history-item p-4 rounded-xl border transition-all duration-300 hover:shadow-[0_0_15px_rgba(34,173,116,0.15)] ${
                    group.totalPayout > group.totalAmount
                      ? "bg-[#22AD74]/5 border-[#22AD74]/20"
                      : group.totalPayout < group.totalAmount
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold ${
                          group.winningNumber === 0
                            ? "bg-emerald-50 text-emerald-600"
                            : isRed(group.winningNumber)
                            ? "bg-red-50 text-red-600"
                            : "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {group.winningNumber}
                      </div>
                      <div className="text-sm text-gray-600">
                        {group.bets.length > 4 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {group.bets.map((bet, idx) => {
                              const betType = Number(bet.betType);
                              const numbers = bet.numbers.map((n) => Number(n));
                              return (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-lg bg-white text-xs border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all duration-300"
                                >
                                  {getBetTypeName(betType, numbers)}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-1">
                            {group.bets.map((bet, idx) => {
                              const betType = Number(bet.betType);
                              const numbers = bet.numbers.map((n) => Number(n));
                              return (
                                <span key={idx} className="mr-2 text-gray-600">
                                  {getBetTypeName(betType, numbers)}
                                  {idx < group.bets.length - 1 ? ", " : ""}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-medium ${
                        group.totalPayout > group.totalAmount
                          ? "text-[#22AD74]"
                          : group.totalPayout < group.totalAmount
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {group.totalPayout > group.totalAmount
                        ? "WIN"
                        : group.totalPayout < group.totalAmount
                        ? "LOSS"
                        : "EVEN"}
                    </div>
                  </div>

                  {/* Bets */}
                  <div className="space-y-2">
                    {group.bets.map((bet, i) => {
                      const betType = Number(bet.betType);
                      const numbers = bet.numbers.map((n) => Number(n));
                      return (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {getBetTypeName(betType, numbers)}
                          </span>
                          <span className="font-medium text-gray-900">
                            {parseFloat(ethers.formatEther(bet.amount)).toFixed(
                              0
                            )}{" "}
                            GAMA
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total */}
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Total Payout
                      </span>
                      <span className="font-bold text-gray-900">
                        {parseFloat(
                          ethers.formatEther(group.totalPayout)
                        ).toFixed(0)}{" "}
                        GAMA
                        {group.totalPayout > group.totalAmount && (
                          <span className="text-[#22AD74] ml-1">
                            (+
                            {parseFloat(
                              ethers.formatEther(
                                BigInt(group.totalPayout) -
                                  BigInt(group.totalAmount)
                              )
                            ).toFixed(0)}
                            )
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredBets.length === 0 && (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <div className="text-3xl mb-2 opacity-20">🎲</div>
          <div className="text-gray-900 font-medium">
            No betting history available
          </div>
          <div className="text-gray-600 text-sm mt-1">
            Place your first bet to start your journey
          </div>
        </div>
      )}
    </div>
  );
};

// Add helper functions to match contract functionality
const BetHelpers = {
  // Get bet type info (matches contract's getBetTypeInfo)
  getBetTypeInfo: (betTypeId) => {
    const type = Number(betTypeId);
    switch (type) {
      case BetTypes.STRAIGHT:
        return { name: "Straight", requiresNumber: true, multiplier: 35000 }; // 35x
      case BetTypes.DOZEN_FIRST:
        return {
          name: "First Dozen (1-12)",
          requiresNumber: false,
          multiplier: 20000,
        }; // 2x
      case BetTypes.DOZEN_SECOND:
        return {
          name: "Second Dozen (13-24)",
          requiresNumber: false,
          multiplier: 20000,
        };
      case BetTypes.DOZEN_THIRD:
        return {
          name: "Third Dozen (25-36)",
          requiresNumber: false,
          multiplier: 20000,
        };
      case BetTypes.COLUMN_FIRST:
        return {
          name: "First Column",
          requiresNumber: false,
          multiplier: 20000,
        };
      case BetTypes.COLUMN_SECOND:
        return {
          name: "Second Column",
          requiresNumber: false,
          multiplier: 20000,
        };
      case BetTypes.COLUMN_THIRD:
        return {
          name: "Third Column",
          requiresNumber: false,
          multiplier: 20000,
        };
      case BetTypes.RED:
        return { name: "Red", requiresNumber: false, multiplier: 10000 }; // 1x
      case BetTypes.BLACK:
        return { name: "Black", requiresNumber: false, multiplier: 10000 };
      case BetTypes.EVEN:
        return { name: "Even", requiresNumber: false, multiplier: 10000 };
      case BetTypes.ODD:
        return { name: "Odd", requiresNumber: false, multiplier: 10000 };
      case BetTypes.LOW:
        return { name: "Low (1-18)", requiresNumber: false, multiplier: 10000 };
      case BetTypes.HIGH:
        return {
          name: "High (19-36)",
          requiresNumber: false,
          multiplier: 10000,
        };
      default:
        throw new Error("Invalid bet type");
    }
  },

  // Validate bet parameters (matches contract's validation)
  validateBetParameters: (bet) => {
    try {
      // Check bet type range
      if (!BetTypes.isValid(bet.type)) {
        throw new Error("Invalid bet type");
      }

      // Check bet amount
      if (
        !bet.amount ||
        bet.amount <= 0 ||
        bet.amount > CONTRACT_CONSTANTS.MAX_BET_AMOUNT
      ) {
        throw new Error("Invalid bet amount");
      }

      // Check if numbers array exists
      if (!bet.numbers || !Array.isArray(bet.numbers)) {
        throw new Error("Invalid bet numbers");
      }

      // For straight bets, validate number
      if (bet.type === BetTypes.STRAIGHT) {
        if (
          bet.numbers.length !== 1 ||
          bet.numbers[0] < 0 ||
          bet.numbers[0] > 36
        ) {
          throw new Error("Invalid number for straight bet");
        }
        return true;
      }

      // Get expected numbers for this bet type
      const expectedNumbers = BetTypes.getNumbers(bet.type);

      // For dozen and column bets, check exact sequence match
      if (
        [
          BetTypes.DOZEN_FIRST,
          BetTypes.DOZEN_SECOND,
          BetTypes.DOZEN_THIRD,
          BetTypes.COLUMN_FIRST,
          BetTypes.COLUMN_SECOND,
          BetTypes.COLUMN_THIRD,
        ].includes(bet.type)
      ) {
        // Check length first
        if (bet.numbers.length !== expectedNumbers.length) {
          return true; // Allow partial matches for these bet types
        }
        // Check if all numbers are in the expected set
        const isValid = bet.numbers.every((num) =>
          expectedNumbers.includes(num)
        );
        if (!isValid) {
          throw new Error(
            `Invalid numbers for ${BetHelpers.getBetTypeInfo(bet.type).name}`
          );
        }
        return true;
      }

      // For other bet types (RED, BLACK, EVEN, ODD, LOW, HIGH)
      // Check if all numbers are in the expected set
      const isValid = bet.numbers.every((num) => expectedNumbers.includes(num));
      if (!isValid) {
        throw new Error(
          `Invalid numbers for ${BetHelpers.getBetTypeInfo(bet.type).name}`
        );
      }

      return true;
    } catch (error) {
      throw error;
    }
  },
};

const RoulettePage = ({ contracts, account, onError, addToast, chainId }) => {
  // State management
  const [selectedBets, setSelectedBets] = useState([]);
  const [selectedChipValue, setSelectedChipValue] = useState(
    CHIP_VALUES[0].value
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalBetAmount, setTotalBetAmount] = useState(BigInt(0));
  const [isApproved, setIsApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(true);

  // Get React Query client
  const queryClient = useQueryClient();

  // Add balance query
  const { data: balanceData } = useQuery({
    queryKey: ["balance", account, contracts?.token?.target],
    queryFn: async () => {
      if (!contracts?.token || !account) return null;

      const balance = await contracts.token.balanceOf(account);
      return { balance };
    },
    enabled: !!contracts?.token && !!account,
    refetchInterval: 5000,
  });

  // Fetch user's betting data
  const {
    data: userData,
    isLoading: isLoadingUserData,
    error: userDataError,
  } = useQuery({
    queryKey: ["rouletteHistory", account],
    queryFn: async () => {
      if (!contracts?.roulette || !account) return null;

      try {
        const [bets] = await contracts.roulette.getUserBetHistory(
          account,
          0,
          10
        );

        if (!bets || !Array.isArray(bets) || bets.length === 0) {
          return [];
        }

        const processedBets = bets.map((bet) => {
          // Process individual bet details first
          const processedBetDetails = bet.bets.map((betDetail) => ({
            betType: Number(betDetail.betType),
            numbers: betDetail.numbers.map((n) => Number(n)),
            amount: betDetail.amount.toString(),
            payout: betDetail.payout.toString(),
          }));

          // Calculate totals after processing details
          const totalAmount = processedBetDetails.reduce(
            (sum, b) => sum + BigInt(b.amount),
            BigInt(0)
          );
          const totalPayout = processedBetDetails.reduce(
            (sum, b) => sum + BigInt(b.payout),
            BigInt(0)
          );

          return {
            timestamp: Number(bet.timestamp),
            winningNumber: Number(bet.winningNumber),
            bets: processedBetDetails,
            totalAmount,
            totalPayout,
          };
        });

        return processedBets;
      } catch (error) {
        if (chainId === 51) {
          return [];
        } else {
          throw error;
        }
        // Throw the error to be handled by React Query's error state
      }
    },
    enabled: !!contracts?.roulette && !!account,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 3,
  });

  // If there's an error fetching user data, show it to the user
  useEffect(() => {
    if (userDataError) {
      addToast(
        "Failed to load betting history. Please try again later.",
        "error"
      );
      onError(userDataError);
    }
  }, [userDataError, addToast, onError]);

  // Check token approval
  useEffect(() => {
    let mounted = true;

    const checkApproval = async () => {
      if (!contracts?.token || !account || !contracts?.roulette) {
        if (mounted) {
          setIsApproved(false);
          setIsCheckingApproval(false);
        }
        return;
      }

      try {
        // Check if roulette contract has required roles
        const [hasMinterRole, hasBurnerRole, allowance] = await Promise.all([
          contracts.token.hasRole(
            CONTRACT_CONSTANTS.MINTER_ROLE,
            contracts.roulette.target
          ),
          contracts.token.hasRole(
            CONTRACT_CONSTANTS.BURNER_ROLE,
            contracts.roulette.target
          ),
          contracts.token.allowance(account, contracts.roulette.target),
          contracts.token.balanceOf(account),
        ]);

        // Contract must have both roles and sufficient allowance
        const hasRequiredRoles = hasMinterRole && hasBurnerRole;
        const hasSufficientAllowance =
          allowance >= CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT;

        if (mounted) {
          setIsApproved(hasRequiredRoles && hasSufficientAllowance);
          setIsCheckingApproval(false);
        }
      } catch (error) {
        if (mounted) {
          setIsApproved(false);
          setIsCheckingApproval(false);
        }
      }
    };

    setIsCheckingApproval(true);
    checkApproval();

    return () => {
      mounted = false;
    };
  }, [contracts?.token, contracts?.roulette, account]);

  // Handler functions
  const handleBetSelect = useCallback(
    (numbers, type) => {
      if (isProcessing) return;

      setSelectedBets((prev) => {
        try {
          // Validate bet type matches contract expectations
          if (!BetTypes.isValid(type)) {
            addToast("Invalid bet type selected", "error");
            return prev;
          }

          // Check max bets per spin limit
          if (prev.length >= CONTRACT_CONSTANTS.MAX_BETS_PER_SPIN) {
            addToast(
              `Maximum ${CONTRACT_CONSTANTS.MAX_BETS_PER_SPIN} bets allowed per spin`,
              "error"
            );
            return prev;
          }

          // Format and validate numbers array
          const formattedNumbers = numbers.map((n) => {
            const num = Number(n);
            if (isNaN(num) || num < 0 || num > 36) {
              throw new Error(`Invalid number: ${n}`);
            }
            return num;
          });

          // Additional validation for straight bets
          if (type === BetTypes.STRAIGHT) {
            if (formattedNumbers.length !== 1) {
              addToast("Straight bets must have exactly one number", "error");
              return prev;
            }
          }

          // Validate numbers match bet type
          const expectedNumbers = BetTypes.getNumbers(type);
          if (type !== BetTypes.STRAIGHT) {
            const isValid = formattedNumbers.every((num) =>
              expectedNumbers.includes(num)
            );
            if (!isValid) {
              addToast(`Invalid numbers for selected bet type`, "error");
              return prev;
            }
          }

          const betAmount = BigInt(selectedChipValue);

          // Validate single bet amount early
          if (betAmount > CONTRACT_CONSTANTS.MAX_BET_AMOUNT) {
            addToast(
              `Maximum bet amount per position is ${ethers.formatEther(
                CONTRACT_CONSTANTS.MAX_BET_AMOUNT
              )} GAMA`,
              "error"
            );
            return prev;
          }

          // Calculate new total amount including this bet
          const newTotalAmount = prev.reduce(
            (sum, bet) => sum + BigInt(bet.amount),
            betAmount
          );

          // Validate total amount early
          if (newTotalAmount > CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT) {
            addToast(
              `Maximum total bet amount is ${ethers.formatEther(
                CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT
              )} GAMA`,
              "error"
            );
            return prev;
          }

          // Calculate potential payout for all bets including new bet
          const allBets = [...prev, { type, amount: betAmount.toString() }];
          const totalPotentialPayout = allBets.reduce((sum, bet) => {
            const { multiplier } = BetHelpers.getBetTypeInfo(bet.type);
            const potentialWinnings =
              (BigInt(bet.amount) * BigInt(multiplier)) / BigInt(10000);
            return sum + potentialWinnings + BigInt(bet.amount);
          }, BigInt(0));

          // Validate maximum potential payout early
          if (totalPotentialPayout > CONTRACT_CONSTANTS.MAX_POSSIBLE_PAYOUT) {
            addToast(
              `Maximum potential payout of ${ethers.formatEther(
                CONTRACT_CONSTANTS.MAX_POSSIBLE_PAYOUT
              )} GAMA would be exceeded`,
              "error"
            );
            return prev;
          }

          // Add new bet
          const newBets = [...prev];
          const existingBetIndex = prev.findIndex(
            (bet) =>
              bet.type === type &&
              JSON.stringify((bet.numbers || []).sort()) ===
                JSON.stringify((formattedNumbers || []).sort())
          );

          if (existingBetIndex !== -1) {
            // Update existing bet
            const newAmount =
              BigInt(newBets[existingBetIndex].amount) + betAmount;
            if (newAmount > CONTRACT_CONSTANTS.MAX_BET_AMOUNT) {
              addToast(
                `Maximum bet amount per position is ${ethers.formatEther(
                  CONTRACT_CONSTANTS.MAX_BET_AMOUNT
                )} GAMA`,
                "error"
              );
              return prev;
            }
            newBets[existingBetIndex] = {
              ...newBets[existingBetIndex],
              amount: newAmount.toString(),
            };
          } else {
            // Add new bet
            newBets.push({
              numbers: formattedNumbers,
              type,
              amount: betAmount.toString(),
            });
          }

          setTotalBetAmount(newTotalAmount);
          return newBets;
        } catch (error) {
          console.error("Bet selection error:", error);
          addToast(
            error.message || "Invalid bet parameters. Please try again.",
            "error"
          );
          return prev;
        }
      });
    },
    [isProcessing, selectedChipValue, addToast]
  );

  const handlePlaceBets = useCallback(async () => {
    if (!contracts?.roulette || !account || selectedBets.length === 0) return;

    // Store previous state for rollback
    const previousState = {
      bets: [...selectedBets],
      totalAmount: totalBetAmount,
    };

    // Constants for retry and timeout
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    const TRANSACTION_TIMEOUT = 60000; // 60 seconds
    const MIN_BET_AMOUNT = ethers.parseEther("1"); // 1 token minimum bet

    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      try {
        setIsProcessing(true);

        // 1. Validate and format bets
        const seenBetTypes = new Set();
        const betRequests = selectedBets.map((bet) => {
          // Validate bet type
          if (!BetTypes.isValid(bet.type)) {
            throw new Error(`Invalid bet type: ${bet.type}`);
          }

          // Prevent duplicate bet types except for straight bets
          if (bet.type !== BetTypes.STRAIGHT && seenBetTypes.has(bet.type)) {
            throw new Error(
              `Duplicate bet type detected: ${getBetTypeName(bet.type)}`
            );
          }
          seenBetTypes.add(bet.type);

          // Get the correct number parameter based on bet type
          let number;
          switch (bet.type) {
            case BetTypes.STRAIGHT:
              // Improved straight bet validation
              if (!bet.numbers || bet.numbers.length !== 1) {
                throw new Error("Straight bet must have exactly one number");
              }

              const straightNumber = Number(bet.numbers[0]);

              // Check if it's a valid number (0-36)
              if (
                !Number.isInteger(straightNumber) ||
                straightNumber < 0 ||
                straightNumber > 36
              ) {
                throw new Error(
                  `Invalid number for straight bet: ${bet.numbers[0]}. Must be between 0 and 36`
                );
              }

              number = straightNumber;
              break;

            case BetTypes.DOZEN_FIRST:
              // Validate dozen bet numbers
              if (!bet.numbers?.every((n) => n >= 1 && n <= 12)) {
                throw new Error("Invalid numbers for first dozen bet");
              }
              number = 1;
              break;

            case BetTypes.DOZEN_SECOND:
              if (!bet.numbers?.every((n) => n >= 13 && n <= 24)) {
                throw new Error("Invalid numbers for second dozen bet");
              }
              number = 13;
              break;

            case BetTypes.DOZEN_THIRD:
              if (!bet.numbers?.every((n) => n >= 25 && n <= 36)) {
                throw new Error("Invalid numbers for third dozen bet");
              }
              number = 25;
              break;

            case BetTypes.COLUMN_FIRST:
              if (!bet.numbers?.every((n) => (n - 1) % 3 === 0)) {
                throw new Error("Invalid numbers for first column bet");
              }
              number = 1;
              break;

            case BetTypes.COLUMN_SECOND:
              if (!bet.numbers?.every((n) => (n - 2) % 3 === 0)) {
                throw new Error("Invalid numbers for second column bet");
              }
              number = 2;
              break;

            case BetTypes.COLUMN_THIRD:
              if (!bet.numbers?.every((n) => n % 3 === 0)) {
                throw new Error("Invalid numbers for third column bet");
              }
              number = 3;
              break;

            case BetTypes.RED:
              if (!bet.numbers?.every((n) => isRed(n))) {
                throw new Error("Invalid numbers for red bet");
              }
              number = 0;
              break;

            case BetTypes.BLACK:
              if (!bet.numbers?.every((n) => !isRed(n) && n !== 0)) {
                throw new Error("Invalid numbers for black bet");
              }
              number = 0;
              break;

            case BetTypes.EVEN:
              if (!bet.numbers?.every((n) => n % 2 === 0 && n !== 0)) {
                throw new Error("Invalid numbers for even bet");
              }
              number = 0;
              break;

            case BetTypes.ODD:
              if (!bet.numbers?.every((n) => n % 2 === 1)) {
                throw new Error("Invalid numbers for odd bet");
              }
              number = 0;
              break;

            case BetTypes.LOW:
              if (!bet.numbers?.every((n) => n >= 1 && n <= 18)) {
                throw new Error("Invalid numbers for low bet");
              }
              number = 0;
              break;

            case BetTypes.HIGH:
              if (!bet.numbers?.every((n) => n >= 19 && n <= 36)) {
                throw new Error("Invalid numbers for high bet");
              }
              number = 0;
              break;

            default:
              throw new Error(`Unsupported bet type: ${bet.type}`);
          }

          // Validate amount
          const amount = BigInt(bet.amount);
          if (amount < MIN_BET_AMOUNT) {
            throw new Error(`Minimum bet amount is 1 GAMA token`);
          }
          if (amount > CONTRACT_CONSTANTS.MAX_BET_AMOUNT) {
            throw new Error(
              `Maximum bet amount per position is ${ethers.formatEther(
                CONTRACT_CONSTANTS.MAX_BET_AMOUNT
              )} GAMA`
            );
          }

          return {
            betTypeId: bet.type,
            number: number,
            amount: amount.toString(),
          };
        });

        // 2. Validate total bets and amounts
        if (betRequests.length > CONTRACT_CONSTANTS.MAX_BETS_PER_SPIN) {
          throw new Error(
            `Maximum ${CONTRACT_CONSTANTS.MAX_BETS_PER_SPIN} bets allowed per spin`
          );
        }

        const totalAmount = betRequests.reduce(
          (sum, bet) => sum + BigInt(bet.amount),
          BigInt(0)
        );

        if (totalAmount > CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT) {
          throw new Error(
            `Total bet amount cannot exceed ${ethers.formatEther(
              CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT
            )} GAMA`
          );
        }

        // 3. Pre-transaction checks
        const [balance, allowance] = await Promise.all([
          contracts.token.balanceOf(account),
          contracts.token.allowance(account, contracts.roulette.target),
        ]);

        if (balance < totalAmount) {
          throw new Error(
            `Insufficient balance. Required: ${ethers.formatEther(
              totalAmount
            )} GAMA`
          );
        }

        if (allowance < totalAmount) {
          throw new Error(`Insufficient allowance. Please approve more tokens`);
        }

        // 4. Gas estimation and optimization
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const rouletteWithSigner = contracts.roulette.connect(signer);

        // Dynamic gas estimation
        const gasEstimate = await rouletteWithSigner.placeBet.estimateGas(
          betRequests
        );
        const feeData = await provider.getFeeData();
        const adjustedGasLimit = (gasEstimate * BigInt(120)) / BigInt(100); // 20% buffer
        const adjustedGasPrice = (feeData.gasPrice * BigInt(120)) / BigInt(100); // 20% buffer

        // 5. Execute transaction with timeout
        const tx = await rouletteWithSigner.placeBet(betRequests, {
          gasLimit: adjustedGasLimit,
          gasPrice: adjustedGasPrice,
        });

        // Wait for confirmation with timeout
        const confirmationPromise = tx.wait(2); // Wait for 2 confirmations
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Transaction confirmation timeout")),
            TRANSACTION_TIMEOUT
          )
        );

        await Promise.race([confirmationPromise, timeoutPromise]);

        // 6. Success handling
        setSelectedBets([]);
        setTotalBetAmount(BigInt(0));
        addToast("Bets placed successfully!", "success");

        // 7. Refresh data
        queryClient.invalidateQueries(["rouletteHistory", account]);
        queryClient.invalidateQueries(["balance", account]);

        break; // Exit retry loop on success
      } catch (error) {
        console.error("Bet placement error:", error);

        // Rollback state on failure
        setSelectedBets(previousState.bets);
        setTotalBetAmount(previousState.totalAmount);

        // Handle specific error cases
        if (error.code === "CALL_EXCEPTION") {
          const errorName = error.data ? error.data.split("(")[0] : null;
          const errorMessage =
            CONTRACT_ERRORS[errorName] ||
            "Transaction failed. Please try again.";
          addToast(errorMessage, "error");
          break; // Don't retry on contract errors
        } else if (error.code === "ACTION_REJECTED") {
          addToast("Transaction rejected by user", "warning");
          break; // Don't retry on user rejection
        } else if (error.code === "INSUFFICIENT_FUNDS") {
          addToast("Insufficient funds to cover gas fees", "error");
          break; // Don't retry on insufficient funds
        } else if (error.code === "REPLACEMENT_UNDERPRICED") {
          retryCount++;
          if (retryCount < MAX_RETRIES) {
            addToast(
              `Transaction underpriced. Retrying... (${retryCount}/${MAX_RETRIES})`,
              "warning"
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            continue; // Retry with higher gas price
          }
        }

        // Generic error handling for other cases
        addToast(error.message || "Failed to place bets", "error");
        onError(error);
      } finally {
        setIsProcessing(false);
      }
    }
  }, [
    contracts?.roulette,
    contracts?.token,
    account,
    selectedBets,
    totalBetAmount,
    addToast,
    onError,
    queryClient,
  ]);

  const handleChipValueChange = useCallback((value) => {
    setSelectedChipValue(value);
  }, []);

  const handleClearBets = useCallback(() => {
    setSelectedBets([]);
    setTotalBetAmount(BigInt(0));
  }, []);

  const handleUndoBet = useCallback(() => {
    setSelectedBets((prev) => {
      const newBets = [...prev];
      newBets.pop(); // Remove the last bet

      // Update total bet amount
      const newTotalAmount = newBets.reduce(
        (sum, bet) => sum + BigInt(bet.amount),
        BigInt(0)
      );
      setTotalBetAmount(newTotalAmount);

      return newBets;
    });
  }, []);

  // Get the last winning number from the user's bet history
  const { data: lastWinningNumber } = useQuery({
    queryKey: ["lastWinningNumber", account],
    queryFn: async () => {
      if (!contracts?.roulette || !account) {
        return null;
      }
      try {
        // Get all recent bets to ensure we get the latest one
        const [bets] = await contracts.roulette.getUserBetHistory(
          account,
          0,
          10 // Get more bets to ensure we have the latest
        );

        // Return the winning number from most recent bet if exists
        if (bets && bets.length > 0) {
          // Sort bets by timestamp in descending order to get the most recent
          const sortedBets = [...bets].sort(
            (a, b) => Number(b.timestamp) - Number(a.timestamp)
          );
          const lastNumber = Number(sortedBets[0].winningNumber);
          return lastNumber;
        }
        return null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!contracts?.roulette && !!account,
    refetchInterval: 10000,
    staleTime: 5000,
    cacheTime: 30000,
    retry: 3,
    retryDelay: 1000,
    structuralSharing: false,
  });

  // Get background color class based on number
  const getNumberBackgroundClass = useCallback((number) => {
    if (number === null || number === undefined) {
      return "bg-white border-gray-200";
    }
    const num = Number(number);
    if (num === 0) {
      return "bg-gradient-to-br from-[#22AD74]/90 to-[#22AD74]/70 border-[#22AD74]/20 text-white";
    }
    if (isRed(num)) {
      return "bg-gradient-to-br from-gaming-primary/90 to-gaming-accent/90 border-gaming-primary/20 text-white";
    }
    return "bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/20 text-white";
  }, []);

  // Handle token approval
  const handleApprove = async () => {
    if (!contracts?.token || !account || !contracts?.roulette) {
      return;
    }

    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    const attemptApproval = async () => {
      try {
        setIsProcessing(true);

        // First check if roulette contract has required roles
        const [hasMinterRole, hasBurnerRole, currentAllowance] =
          await Promise.all([
            contracts.token.hasRole(
              CONTRACT_CONSTANTS.MINTER_ROLE,
              contracts.roulette.target
            ),
            contracts.token.hasRole(
              CONTRACT_CONSTANTS.BURNER_ROLE,
              contracts.roulette.target
            ),
            contracts.token.allowance(account, contracts.roulette.target),
          ]);

        // Check if already approved
        if (currentAllowance >= CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT) {
          setIsApproved(true);
          addToast("Token already approved", "success");
          return;
        }

        if (!hasMinterRole || !hasBurnerRole) {
          addToast(
            "Roulette contract is missing required roles. Please contact support.",
            "error"
          );
          return;
        }

        // Get current gas price and add 20% buffer for approval
        const provider = new ethers.BrowserProvider(window.ethereum);
        const feeData = await provider.getFeeData();
        const adjustedGasPrice = (feeData.gasPrice * BigInt(120)) / BigInt(100);

        // Get signer and connect to contract
        const signer = await provider.getSigner();
        const tokenWithSigner = contracts.token.connect(signer);

        // If there's an existing non-zero allowance, first reset it to 0
        if (currentAllowance > 0) {
          const resetTx = await tokenWithSigner.approve(
            contracts.roulette.target,
            0,
            {
              gasPrice: adjustedGasPrice,
            }
          );
          await resetTx.wait(1);
        }

        // Approve exact amount instead of max uint256 to match contract's expectations
        const tx = await tokenWithSigner.approve(
          contracts.roulette.target,
          CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT,
          {
            gasPrice: adjustedGasPrice,
          }
        );

        // Wait for confirmations with timeout
        const CONFIRMATION_TIMEOUT = 60000; // 60 seconds
        const confirmationPromise = tx.wait(2);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Approval confirmation timeout")),
            CONFIRMATION_TIMEOUT
          )
        );

        await Promise.race([confirmationPromise, timeoutPromise]);

        // Verify the new allowance
        const newAllowance = await contracts.token.allowance(
          account,
          contracts.roulette.target
        );

        if (newAllowance < CONTRACT_CONSTANTS.MAX_TOTAL_BET_AMOUNT) {
          throw new Error("Approval failed - insufficient allowance");
        }

        setIsApproved(true);
        addToast("Token approval successful", "success");

        // Invalidate balance queries
        queryClient.invalidateQueries(["balance", account]);
      } catch (error) {
        console.error("Token approval error:", error);

        // Check if error is due to network or transaction issues
        const retryableErrors = [
          "NETWORK_ERROR",
          "TIMEOUT",
          "UNPREDICTABLE_GAS_LIMIT",
          "transaction failed",
          "timeout",
          "replacement underpriced",
          "nonce has already been used",
        ];

        const shouldRetry = retryableErrors.some(
          (errMsg) =>
            error.code === errMsg ||
            error.message?.toLowerCase().includes(errMsg.toLowerCase())
        );

        if (shouldRetry && retryCount < MAX_RETRIES) {
          retryCount++;
          addToast(
            `Approval failed, retrying... (Attempt ${retryCount}/${MAX_RETRIES})`,
            "warning"
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          return attemptApproval();
        }

        setIsApproved(false);

        // Handle specific error cases
        if (error.code === "ACTION_REJECTED") {
          addToast("Token approval was rejected by user", "warning");
        } else if (error.code === "INSUFFICIENT_FUNDS") {
          addToast("Insufficient funds to cover gas fees", "error");
        } else if (error.code === "REPLACEMENT_UNDERPRICED") {
          addToast("Transaction gas price too low. Please try again.", "error");
        } else if (error.message?.includes("insufficient allowance")) {
          addToast("Failed to approve tokens. Please try again.", "error");
        } else {
          addToast("Something went wrong. Please try again later.", "error");
          onError(error);
        }
      } finally {
        setIsProcessing(false);
      }
    };

    // Start the first attempt
    await attemptApproval();
  };

  return (
    <div className="min-h-screen bg-white relative overflow-x-hidden">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-50 pointer-events-none"
        style={{
          backgroundImage: `url(${bgOverlay})`,
          zIndex: 0,
        }}
      />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        <div className="space-y-8">
          {/* Game Title and Description */}
          <div className="text-center space-y-6 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-[#22AD74]/10 blur-3xl rounded-full transform -translate-y-1/2"></div>
              <h1 className="text-6xl font-bold bg-gradient-to-r from-[#22AD74] to-[#22AD74]/70 bg-clip-text text-transparent drop-shadow-xl relative">
                Roulette
              </h1>
            </div>
            <div className="relative">
              <div className="h-px w-24 bg-gradient-to-r from-[#22AD74] to-transparent absolute left-1/2 -translate-x-1/2"></div>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto mt-6 font-light tracking-wide">
                Play with GAMA Token on XDC Network for lightning-fast, secure,
                and provably fair gaming.
              </p>
            </div>
          </div>

          {/* Main Game Section */}
          <div className="grid lg:grid-cols-[2fr_1fr] gap-8 h-full">
            {/* Left Column - Betting Board */}
            <div className="h-full">
              <div className="bg-white p-6 rounded-xl border border-gray-200 transform hover:scale-[1.01] transition-all duration-300 hover:shadow-lg h-full">
                <BettingBoard
                  onBetSelect={handleBetSelect}
                  selectedBets={selectedBets}
                  disabled={isProcessing}
                  selectedChipValue={selectedChipValue}
                  lastWinningNumber={lastWinningNumber}
                  getNumberBackgroundClass={getNumberBackgroundClass}
                  onUndoBet={handleUndoBet}
                  onClearBets={handleClearBets}
                />
              </div>
            </div>

            {/* Right Column - Betting Controls */}
            <div className="h-full">
              <div className="lg:sticky lg:top-6 h-full">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] hover:border-[#22AD74]/20 flex flex-col h-full">
                  {/* Stats Cards */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 transform hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:border-[#22AD74]/20 group">
                        <div className="text-gray-400 text-[10px] uppercase tracking-wider font-medium group-hover:text-[#22AD74] transition-colors">
                          Bets
                        </div>
                        <div className="flex items-center gap-1 whitespace-nowrap mt-0.5 w-full overflow-hidden">
                          <span className="text-gray-900 text-sm font-semibold min-w-[10px] text-right shrink-0 group-hover:text-[#22AD74] transition-colors">
                            {selectedBets.length}
                          </span>
                          <span className="text-[#22AD74] text-[9px] uppercase tracking-wider font-medium shrink-0">
                            positions
                          </span>
                        </div>
                      </div>
                      <div className="bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 transform hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:border-[#22AD74]/20 group">
                        <div className="text-gray-400 text-[10px] uppercase tracking-wider font-medium group-hover:text-[#22AD74] transition-colors">
                          Amount
                        </div>
                        <div className="flex items-center gap-1 whitespace-nowrap mt-0.5 w-full overflow-hidden">
                          <span className="text-gray-900 text-sm font-semibold min-w-[10px] text-right shrink-0 group-hover:text-[#22AD74] transition-colors">
                            {parseFloat(
                              ethers.formatEther(totalBetAmount)
                            ).toFixed(0)}
                          </span>
                          <span className="text-[#22AD74] text-[9px] uppercase tracking-wider font-medium shrink-0">
                            GAMA
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Balance Display */}
                    <div className="bg-white px-2.5 py-2 rounded-lg border border-gray-200 transform hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:border-[#22AD74]/20 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-[10px] uppercase tracking-wider font-medium group-hover:text-[#22AD74] transition-colors">
                            Balance
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-900 text-sm font-semibold tracking-tight group-hover:text-[#22AD74] transition-colors">
                            {balanceData?.balance
                              ? Number(
                                  ethers.formatEther(balanceData.balance)
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                })
                              : "0"}
                          </span>
                          <span className="text-[#22AD74] text-[9px] uppercase tracking-wider font-medium">
                            GAMA
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Chip Selection */}
                    <div className="space-y-2 transform hover:scale-[1.01] transition-all duration-300">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[10px] uppercase tracking-wider font-medium text-gray-400">
                          Chip Value
                        </h3>
                      </div>
                      <div className="chip-selector grid grid-cols-3 grid-rows-2 gap-2.5">
                        {CHIP_VALUES.map((chip) => (
                          <button
                            key={chip.value}
                            onClick={() => handleChipValueChange(chip.value)}
                            disabled={isProcessing}
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all duration-300 relative group
                              ${
                                selectedChipValue === chip.value
                                  ? "bg-gradient-to-br from-[#22AD74] to-[#1a8f5e] text-white shadow-xl ring-2 ring-[#22AD74]/20 ring-offset-2 scale-110 z-10"
                                  : "bg-gradient-to-br from-white to-gray-50 text-gray-700 hover:text-[#22AD74] border border-gray-200 hover:border-[#22AD74]/20 hover:shadow-lg hover:z-10"
                              } ${
                              isProcessing
                                ? "opacity-50 cursor-not-allowed"
                                : "cursor-pointer hover:scale-105"
                            }`}
                          >
                            <span className="text-[13px] transform -translate-y-px">
                              {chip.label}
                            </span>
                            {selectedChipValue === chip.value && (
                              <div className="absolute -inset-0.5 rounded-full bg-[#22AD74]/10 animate-pulse pointer-events-none" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Place Bet Button */}
                  <div className="mt-4 transform hover:scale-[1.01] transition-all duration-300">
                    {isCheckingApproval ? (
                      <button
                        className="h-9 w-full bg-white text-gray-600 rounded-lg font-medium text-xs flex items-center justify-center gap-2 disabled:opacity-50 border border-gray-200 hover:shadow-lg transition-all duration-300"
                        disabled={true}
                      >
                        <LoadingSpinner size="small" />
                        Checking Approval...
                      </button>
                    ) : isApproved ? (
                      <button
                        onClick={handlePlaceBets}
                        disabled={isProcessing || selectedBets.length === 0}
                        className={`h-9 w-full rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg
                          ${
                            isProcessing || selectedBets.length === 0
                              ? "bg-white text-gray-400 border border-gray-200"
                              : "bg-[#22AD74] text-white hover:scale-[1.02] shadow-md hover:shadow-lg border border-[#22AD74] hover:bg-[#22AD74]/90"
                          }`}
                      >
                        {isProcessing ? (
                          <>
                            <LoadingSpinner size="small" />
                            Processing...
                          </>
                        ) : (
                          "Place Bets"
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleApprove}
                        disabled={isProcessing}
                        className={`h-9 w-full rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg
                          ${
                            isProcessing
                              ? "bg-white text-gray-400 border border-gray-200"
                              : "bg-white text-[#22AD74] hover:scale-[1.02] shadow-md hover:shadow-lg border border-[#22AD74] hover:bg-[#22AD74]/5"
                          }`}
                      >
                        Approve Token
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section - Detailed History */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 transform hover:scale-[1.01] transition-all duration-300">
            <div className="mb-4">
              <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                Betting History
              </h3>
              <div className="h-0.5 w-24 bg-gradient-to-r from-[#22AD74] to-[#22AD74]/20"></div>
            </div>
            <BettingHistory
              userData={userData}
              isLoading={isLoadingUserData}
              error={userDataError}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 py-8 text-center">
        <div className="space-y-2">
          <p className="text-gray-600 text-sm">
            Crafted with <span className="text-[#22AD74] mx-1">♥</span> and
            built on{" "}
            <a
              href="https://xdc.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#22AD74] hover:text-[#1a8f5e] transition-colors cursor-pointer"
            >
              XDC
            </a>
          </p>
          <p className="text-gray-500 text-xs">
            GAMA © 2024. Open source, for everyone.{" "}
            <span className="text-[#22AD74]">#BuildOnXDC</span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Add LoadingSpinner component
const LoadingSpinner = ({ size = "default" }) => (
  <div
    className={`inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite] ${
      size === "small" ? "h-4 w-4" : "h-6 w-6"
    }`}
    role="status"
  />
);

export default RoulettePage;
