/* ═══════════════════════════════════════════════════════════════════════
   contractConfig.js — Contract ABI and address
   Aligned with Dai et al. (2024) FrequencyConsensus contract
   (FDIA/Attack detection removed — distributed control only)
   ═══════════════════════════════════════════════════════════════════════ */

// Default Hardhat first-deploy address (deterministic)
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const FREQUENCY_CONSENSUS_ABI = [
  // ── Write Functions ──
  "function submitFrequency(uint256 _nodeId, int256 _frequency, int256 _activePower)",

  // ── Read Functions ──
  "function getCurrentRound() view returns (uint256)",
  "function getNodeCount() view returns (uint256)",
  "function getLeadNode(uint256 _round) view returns (uint256)",
  "function getNeighbors(uint256 _nodeId) view returns (uint256[])",
  "function getSubmission(uint256 _round, uint256 _nodeId) view returns (tuple(int256 frequency, int256 activePower, int256 deltaF, bool submitted))",
  "function getResult(uint256 _round) view returns (tuple(int256 globalFrequency, int256 totalDeltaF, int256 averageDeltaF, int256 controlSignal, uint256 nodeCount, uint256 leadNodeId, uint256 timestamp, bytes32 dataHash))",

  // ── Events ──
  "event FrequencySubmitted(uint256 indexed round, uint256 indexed nodeId, int256 frequency, int256 activePower, int256 deltaF, uint256 timestamp)",
  "event LeadNodeElected(uint256 indexed round, uint256 indexed nodeId)",
  "event BlockVerified(uint256 indexed round, int256 globalFrequency, int256 controlSignal, uint256 leadNodeId, uint256[] nodeIds, bytes32 txHash)",
  "event NodeRegistered(uint256 indexed nodeId, uint256[] neighborIds)",
];
