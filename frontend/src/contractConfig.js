export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const FREQUENCY_CONSENSUS_ABI = [
  "event BlockVerified(uint256 indexed round, int256 globalFrequency, uint256[] nodeIds, bytes32 txHash)",
  "event FrequencySubmitted(uint256 indexed round, uint256 indexed nodeId, int256 deltaF, uint256 timestamp)",
  "event NodeRegistered(uint256 indexed nodeId)",
  "function registerNode(uint256 _nodeId)",
  "function submitFrequency(uint256 _nodeId, int256 _deltaF)",
  "function getRegisteredNodes() view returns (uint256[])",
  "function getNodeCount() view returns (uint256)",
  "function getResult(uint256 _round) view returns (tuple(int256 globalFrequency, int256 totalDeltaF, int256 averageDeltaF, uint256 nodeCount, uint256 timestamp, bytes32 dataHash))",
  "function getCurrentRound() view returns (uint256)",
  "function currentRound() view returns (uint256)",
  "function NOMINAL_FREQ() view returns (int256)",
  "function registeredNodes(uint256) view returns (uint256)",
  "function isRegistered(uint256) view returns (bool)",
  "function submissions(uint256, uint256) view returns (int256)",
  "function hasSubmitted(uint256, uint256) view returns (bool)",
  "function submissionCount(uint256) view returns (uint256)",
  "function owner() view returns (address)"
];
