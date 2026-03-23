// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrequencyConsensus
 * @notice Implements a simplified Smart Contract Participation Matrix (SCPM)
 *         for secondary frequency control in an islanded microgrid.
 *
 * The contract collects frequency deviations (Δf) from registered microgrid
 * nodes and, once all nodes have reported for a given round, calculates the
 * combined secondary frequency adjustment required to restore the grid to
 * the nominal 50 Hz.
 *
 * All frequency values are stored as int256 scaled by 1000 (milli-Hz) to
 * avoid floating-point arithmetic:
 *   50 Hz  →  50000
 *   49.95 Hz → 49950
 *   Δf of -0.05 Hz → -50
 */
contract FrequencyConsensus {

    // ────────── State Variables ──────────

    address public owner;

    /// Registered node IDs (1-indexed identifiers)
    uint256[] public registeredNodes;
    mapping(uint256 => bool) public isRegistered;

    /// Current consensus round (auto-increments after each consensus)
    uint256 public currentRound;

    /// Nominal grid frequency in milli-Hz (50 Hz = 50000)
    int256 public constant NOMINAL_FREQ = 50000;

    /// Per-round submissions: round → nodeId → deltaF (milli-Hz)
    mapping(uint256 => mapping(uint256 => int256)) public submissions;

    /// Track which nodes have submitted in the current round
    mapping(uint256 => mapping(uint256 => bool)) public hasSubmitted;
    mapping(uint256 => uint256) public submissionCount;

    /// Historical consensus results
    struct ConsensusResult {
        int256  globalFrequency;     // Corrected frequency (milli-Hz)
        int256  totalDeltaF;         // Sum of all Δf
        int256  averageDeltaF;       // Average Δf
        uint256 nodeCount;           // Nodes that participated
        uint256 timestamp;           // Block timestamp
        bytes32 dataHash;            // Keccak hash of the submission data
    }
    mapping(uint256 => ConsensusResult) public results;

    // ────────── Events ──────────

    /// Emitted when a node submits its frequency deviation
    event FrequencySubmitted(
        uint256 indexed round,
        uint256 indexed nodeId,
        int256  deltaF,
        uint256 timestamp
    );

    /// Emitted when all nodes have reported and consensus is reached
    event BlockVerified(
        uint256 indexed round,
        int256  globalFrequency,
        uint256[] nodeIds,
        bytes32 txHash
    );

    /// Emitted when a new node is registered
    event NodeRegistered(uint256 indexed nodeId);

    // ────────── Modifiers ──────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ────────── Constructor ──────────

    constructor() {
        owner = msg.sender;
        currentRound = 1;
    }

    // ────────── Node Registration ──────────

    /**
     * @notice Register a microgrid node by its numeric ID.
     * @param _nodeId Unique identifier for the prosumer/generator node.
     */
    function registerNode(uint256 _nodeId) external onlyOwner {
        require(!isRegistered[_nodeId], "Node already registered");
        require(_nodeId > 0, "Node ID must be > 0");

        isRegistered[_nodeId] = true;
        registeredNodes.push(_nodeId);

        emit NodeRegistered(_nodeId);
    }

    // ────────── Frequency Submission ──────────

    /**
     * @notice Submit a frequency deviation for the current round.
     * @param _nodeId  The reporting node's ID.
     * @param _deltaF  Frequency deviation in milli-Hz (e.g. -50 means −0.05 Hz).
     */
    function submitFrequency(uint256 _nodeId, int256 _deltaF) external {
        require(isRegistered[_nodeId], "Node not registered");
        require(!hasSubmitted[currentRound][_nodeId], "Already submitted this round");

        // Record the submission
        submissions[currentRound][_nodeId] = _deltaF;
        hasSubmitted[currentRound][_nodeId] = true;
        submissionCount[currentRound]++;

        emit FrequencySubmitted(currentRound, _nodeId, _deltaF, block.timestamp);

        // ── SCPM Consensus Check ──
        if (submissionCount[currentRound] == registeredNodes.length) {
            _calculateConsensus();
        }
    }

    // ────────── Internal SCPM Logic ──────────

    /**
     * @dev Simplified Smart Contract Participation Matrix (SCPM):
     *      1. Sum all node Δf values.
     *      2. Compute the average deviation.
     *      3. The corrective global frequency = NOMINAL − avg(Δf),
     *         representing the secondary control action needed.
     *      4. Hash the submission data for immutability proof.
     */
    function _calculateConsensus() internal {
        uint256 round = currentRound;
        uint256 nodeCount = registeredNodes.length;

        int256 totalDeltaF = 0;
        uint256[] memory nodeIds = new uint256[](nodeCount);

        // Build the SCPM row — collect all participating node deviations
        for (uint256 i = 0; i < nodeCount; i++) {
            uint256 nid = registeredNodes[i];
            nodeIds[i] = nid;
            totalDeltaF += submissions[round][nid];
        }

        int256 averageDeltaF = totalDeltaF / int256(nodeCount);

        // Secondary frequency correction: compensate for the average deviation
        int256 globalFrequency = NOMINAL_FREQ - averageDeltaF;

        // Cryptographic hash of all submissions for this round
        bytes32 dataHash = keccak256(
            abi.encodePacked(round, totalDeltaF, averageDeltaF, globalFrequency, block.timestamp)
        );

        // Store the result
        results[round] = ConsensusResult({
            globalFrequency: globalFrequency,
            totalDeltaF:     totalDeltaF,
            averageDeltaF:   averageDeltaF,
            nodeCount:       nodeCount,
            timestamp:       block.timestamp,
            dataHash:        dataHash
        });

        emit BlockVerified(round, globalFrequency, nodeIds, dataHash);

        // Advance to the next round
        currentRound++;
    }

    // ────────── View Helpers ──────────

    function getRegisteredNodes() external view returns (uint256[] memory) {
        return registeredNodes;
    }

    function getNodeCount() external view returns (uint256) {
        return registeredNodes.length;
    }

    function getResult(uint256 _round) external view returns (ConsensusResult memory) {
        return results[_round];
    }

    function getCurrentRound() external view returns (uint256) {
        return currentRound;
    }
}
