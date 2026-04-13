// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrequencyConsensus
 * @notice Blockchain-Enabled Distributed Secondary Frequency Control for
 *         Microgrid (Dai et al., IEEE Trans. Smart Grid, 2024).
 *
 * Implements:
 *   - Smart Contract Participation Matrix (SCPM) with neighbor topology
 *   - PBFT-style Lead Node election (round-robin rotation)
 *   - Distributed secondary frequency control law:
 *         u_fi = Σ a_ij(f_j − f_i) + g_i(f* − f_i)
 *
 * All frequency values are int256 scaled ×1000 (milli-Hz):
 *   50 Hz  →  50000    |    Δf = −0.05 Hz  →  −50
 *
 * Power values are int256 scaled ×1000 (milli-kW):
 *   100 kW → 100000
 */
contract FrequencyConsensus {

    // ════════════════════════════════════════════════════════════════
    //  Constants
    // ════════════════════════════════════════════════════════════════

    int256 public constant NOMINAL_FREQ = 50000;     // 50.000 Hz in milli-Hz

    // ════════════════════════════════════════════════════════════════
    //  State Variables
    // ════════════════════════════════════════════════════════════════

    address public owner;
    uint256 public currentRound;

    // ── Node Registry (SCPM) ──────────────────────────────────────
    uint256[] public registeredNodes;
    mapping(uint256 => bool) public isRegistered;

    // ── Neighbor Topology (adjacency matrix a_ij) ─────────────────
    // neighbors[nodeId] = list of neighbor node IDs
    mapping(uint256 => uint256[]) public neighbors;
    mapping(uint256 => mapping(uint256 => bool)) public isNeighbor;

    // ── Droop Coefficients ────────────────────────────────────────
    // kp[nodeId] = droop coefficient (scaled ×1000)
    mapping(uint256 => int256) public droopCoefficient;
    // Pinning gain g_i: whether this node has reference to nominal freq
    mapping(uint256 => int256) public pinningGain;

    // ── Per-Round Submissions ─────────────────────────────────────
    struct NodeSubmission {
        int256 frequency;       // Measured f_i in milli-Hz
        int256 activePower;     // P_i in milli-kW
        int256 deltaF;          // Δf = f_i - f* (computed)
        bool   submitted;
    }
    mapping(uint256 => mapping(uint256 => NodeSubmission)) public submissions;
    mapping(uint256 => uint256) public submissionCount;

    // ── Lead Node (PBFT) ──────────────────────────────────────────
    mapping(uint256 => uint256) public leadNode;  // round → elected lead node

    // ── Consensus Results ─────────────────────────────────────────
    struct ConsensusResult {
        int256  globalFrequency;        // Corrected frequency (milli-Hz)
        int256  totalDeltaF;            // Sum of all Δf
        int256  averageDeltaF;          // Average Δf
        int256  controlSignal;          // u_f: secondary control output
        uint256 nodeCount;
        uint256 leadNodeId;             // Which node was leader
        uint256 timestamp;
        bytes32 dataHash;               // Keccak hash for immutability proof
    }
    mapping(uint256 => ConsensusResult) public results;

    // ════════════════════════════════════════════════════════════════
    //  Events
    // ════════════════════════════════════════════════════════════════

    event NodeRegistered(uint256 indexed nodeId, uint256[] neighborIds);

    event FrequencySubmitted(
        uint256 indexed round,
        uint256 indexed nodeId,
        int256  frequency,
        int256  activePower,
        int256  deltaF,
        uint256 timestamp
    );

    event LeadNodeElected(uint256 indexed round, uint256 indexed nodeId);

    event BlockVerified(
        uint256 indexed round,
        int256  globalFrequency,
        int256  controlSignal,
        uint256 leadNodeId,
        uint256[] nodeIds,
        bytes32 txHash
    );

    // ════════════════════════════════════════════════════════════════
    //  Modifiers
    // ════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ════════════════════════════════════════════════════════════════
    //  Constructor
    // ════════════════════════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
        currentRound = 1;
    }

    // ════════════════════════════════════════════════════════════════
    //  Node Registration with Neighbor Topology
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Register a DG node with its neighbor list and droop parameters.
     * @param _nodeId       Unique node identifier (1-indexed)
     * @param _neighborIds  List of neighbor node IDs (adjacency: a_ij = 1)
     * @param _kp           Droop coefficient ×1000
     * @param _gi           Pinning gain ×1000 (>0 if node has reference to f*)
     */
    function registerNode(
        uint256 _nodeId,
        uint256[] calldata _neighborIds,
        int256 _kp,
        int256 _gi
    ) external onlyOwner {
        require(!isRegistered[_nodeId], "Node already registered");
        require(_nodeId > 0, "Node ID must be > 0");

        isRegistered[_nodeId] = true;
        registeredNodes.push(_nodeId);
        droopCoefficient[_nodeId] = _kp;
        pinningGain[_nodeId] = _gi;

        // Set neighbor topology
        for (uint256 i = 0; i < _neighborIds.length; i++) {
            neighbors[_nodeId].push(_neighborIds[i]);
            isNeighbor[_nodeId][_neighborIds[i]] = true;
        }

        emit NodeRegistered(_nodeId, _neighborIds);
    }

    // ════════════════════════════════════════════════════════════════
    //  Frequency & Power Submission
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Submit measured frequency and active power for current round.
     *         Implements the paper's "transaction packing" step.
     * @param _nodeId      Reporting node's ID
     * @param _frequency   Measured frequency in milli-Hz (e.g., 49950 = 49.95 Hz)
     * @param _activePower Active power in milli-kW (e.g., 100000 = 100 kW)
     */
    function submitFrequency(
        uint256 _nodeId,
        int256 _frequency,
        int256 _activePower
    ) external {
        require(isRegistered[_nodeId], "Node not registered");
        require(!submissions[currentRound][_nodeId].submitted, "Already submitted this round");

        // Compute Δf = f_i - f*
        int256 deltaF = _frequency - NOMINAL_FREQ;

        // Store submission
        submissions[currentRound][_nodeId] = NodeSubmission({
            frequency:   _frequency,
            activePower: _activePower,
            deltaF:      deltaF,
            submitted:   true
        });
        submissionCount[currentRound]++;

        emit FrequencySubmitted(
            currentRound, _nodeId, _frequency, _activePower, deltaF, block.timestamp
        );

        // ── Check if all nodes submitted → trigger PBFT consensus ──
        if (submissionCount[currentRound] == registeredNodes.length) {
            _electLeadNode();
            _calculateConsensus();
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  PBFT Lead Node Election (Round-Robin)
    // ════════════════════════════════════════════════════════════════

    /**
     * @dev Elect the lead node for the current round using round-robin.
     *      In the paper, the lead node proposes the block and other nodes
     *      validate. We simulate this in the contract.
     */
    function _electLeadNode() internal {
        uint256 round = currentRound;
        uint256 nodeCount = registeredNodes.length;

        // Round-robin: rotate through registered nodes
        uint256 leaderIndex = (round - 1) % nodeCount;
        uint256 leaderId = registeredNodes[leaderIndex];

        leadNode[round] = leaderId;
        emit LeadNodeElected(round, leaderId);
    }

    // ════════════════════════════════════════════════════════════════
    //  Consensus Calculation (Paper's Secondary Control Law)
    // ════════════════════════════════════════════════════════════════

    /**
     * @dev Implements the paper's distributed secondary control:
     *
     *   For each node i:
     *     u_fi = Σ_{j ∈ N_i} a_ij(f_j − f_i) + g_i(f* − f_i)
     *
     *   Global frequency = f* − avg(Δf) after corrections
     */
    function _calculateConsensus() internal {
        uint256 round = currentRound;
        uint256 nodeCount = registeredNodes.length;

        int256 totalDeltaF = 0;
        int256 totalControlSignal = 0;

        uint256[] memory nodeIds = new uint256[](nodeCount);

        // ── Compute per-node control signals using neighbor consensus ──
        for (uint256 i = 0; i < nodeCount; i++) {
            uint256 nid = registeredNodes[i];
            nodeIds[i] = nid;

            int256 fi = submissions[round][nid].frequency;
            int256 deltaFi = submissions[round][nid].deltaF;
            totalDeltaF += deltaFi;

            // Compute u_fi = Σ a_ij(f_j - f_i) + g_i(f* - f_i)
            int256 neighborSum = 0;
            uint256[] storage nodeNeighbors = neighbors[nid];

            for (uint256 j = 0; j < nodeNeighbors.length; j++) {
                uint256 neighborId = nodeNeighbors[j];
                if (submissions[round][neighborId].submitted) {
                    int256 fj = submissions[round][neighborId].frequency;
                    neighborSum += (fj - fi);
                }
            }

            int256 pinning = pinningGain[nid] * (NOMINAL_FREQ - fi) / 1000;
            int256 controlSignal = neighborSum + pinning;

            totalControlSignal += controlSignal;
        }

        // ── Compute global frequency ──
        int256 averageDeltaF = totalDeltaF / int256(nodeCount);
        int256 globalFrequency = NOMINAL_FREQ - averageDeltaF;

        // ── Create immutability proof ──
        bytes32 dataHash = keccak256(
            abi.encodePacked(
                round,
                globalFrequency,
                totalControlSignal,
                totalDeltaF,
                leadNode[round],
                block.timestamp
            )
        );

        // ── Store result ──
        results[round] = ConsensusResult({
            globalFrequency:  globalFrequency,
            totalDeltaF:      totalDeltaF,
            averageDeltaF:    averageDeltaF,
            controlSignal:    totalControlSignal,
            nodeCount:        nodeCount,
            leadNodeId:       leadNode[round],
            timestamp:        block.timestamp,
            dataHash:         dataHash
        });

        emit BlockVerified(
            round,
            globalFrequency,
            totalControlSignal,
            leadNode[round],
            nodeIds,
            dataHash
        );

        // Advance to next round
        currentRound++;
    }

    // ════════════════════════════════════════════════════════════════
    //  View Functions
    // ════════════════════════════════════════════════════════════════

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

    function getLeadNode(uint256 _round) external view returns (uint256) {
        return leadNode[_round];
    }

    function getNeighbors(uint256 _nodeId) external view returns (uint256[] memory) {
        return neighbors[_nodeId];
    }

    function getSubmission(uint256 _round, uint256 _nodeId) external view returns (NodeSubmission memory) {
        return submissions[_round][_nodeId];
    }
}
