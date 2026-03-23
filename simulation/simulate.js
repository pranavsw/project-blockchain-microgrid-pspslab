/*
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║       Microgrid Frequency Simulation — Cyber-Physical Layer         ║
 * ║                                                                     ║
 * ║  Simulates 4 independent prosumer/generator nodes in an islanded    ║
 * ║  microgrid. Each node generates realistic frequency deviations      ║
 * ║  (Δf) based on load changes, computes the combined local frequency, ║
 * ║  and sends submissions to the FrequencyConsensus smart contract     ║
 * ║  via ethers.js to a local Hardhat node.                             ║
 * ║                                                                     ║
 * ║  In real systems, frequency updates occur every ~50μs. For this     ║
 * ║  simulation demo, a 15-second delay loop represents block mining    ║
 * ║  time and variable communication delays in cyber-physical systems.  ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

const { ethers } = require("ethers");

// ════════════════════════════════════════════════════════════════════════
//  Configuration
// ════════════════════════════════════════════════════════════════════════

const NOMINAL_FREQ       = 50.0;        // Hz — Grid nominal
const NODE_COUNT         = 4;
const CONSENSUS_DELAY_SEC = 15;         // Simulated block mining delay (real: ~50μs)
const TOTAL_ROUNDS       = 5;

const RPC_URL = "http://127.0.0.1:8545";

// Hardhat account #0 (deterministic for local dev)
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const CONTRACT_ABI = [
  "function submitFrequency(uint256 _nodeId, int256 _deltaF)",
  "function getCurrentRound() view returns (uint256)",
  "function getNodeCount() view returns (uint256)",
  "function getResult(uint256 _round) view returns (tuple(int256 globalFrequency, int256 totalDeltaF, int256 averageDeltaF, uint256 nodeCount, uint256 timestamp, bytes32 dataHash))",
  "event BlockVerified(uint256 indexed round, int256 globalFrequency, uint256[] nodeIds, bytes32 txHash)",
];

// ════════════════════════════════════════════════════════════════════════
//  Node Definitions
// ════════════════════════════════════════════════════════════════════════

const nodes = [
  { id: 1, name: "Solar Prosumer",  icon: "☀️",  baseLoad: 100, loadVariation: 15, inertia: 5.0 },
  { id: 2, name: "Wind Generator",  icon: "🌬️",  baseLoad: 200, loadVariation: 25, inertia: 8.0 },
  { id: 3, name: "Battery Storage", icon: "🔋", baseLoad: 150, loadVariation: 10, inertia: 6.0 },
  { id: 4, name: "Diesel Backup",   icon: "⛽", baseLoad: 80,  loadVariation: 20, inertia: 4.0 },
];

// ════════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════════

/** Gaussian random using Box-Muller transform */
function gaussianRandom(mean = 0, stdDev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Generate frequency deviation for a node based on sinusoidal load pattern
 * plus random noise (simulating real-world prosumer behaviour).
 *
 * Uses simplified swing equation: Δf = ΔP / (2 * H * f_nominal)
 */
function generateFrequencyDeviation(node, timeStep) {
  // Sinusoidal load variation (simulates demand cycle, sped up)
  const loadChange = node.loadVariation * Math.sin(timeStep * 0.1 * node.id);

  // Random perturbation (solar intermittency, sudden load switch)
  const noise = gaussianRandom(0, node.loadVariation * 0.3);

  // Total power imbalance
  const powerImbalance = loadChange + noise;

  // Frequency deviation via swing equation
  let deltaF = powerImbalance / (2.0 * node.inertia * NOMINAL_FREQ);

  // Clamp to realistic range (±0.5 Hz)
  deltaF = Math.max(-0.5, Math.min(0.5, deltaF));

  return deltaF;
}

/** Sleep for ms milliseconds */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Format number with sign */
function signed(val, decimals = 4) {
  return (val >= 0 ? "+" : "") + val.toFixed(decimals);
}

function printSeparator() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

// ════════════════════════════════════════════════════════════════════════
//  Main Simulation
// ════════════════════════════════════════════════════════════════════════

async function main() {
  // ── Parse contract address from CLI ──────────────────────────
  const contractAddress = process.argv[2];
  if (!contractAddress) {
    console.log("⚠  Usage: node simulate.js <CONTRACT_ADDRESS>");
    console.log("   Example: node simulate.js 0x5FbDB2315678afecb367f032d93F642f64180aa3");
    console.log("");
    console.log("   Deploy the contract first:");
    console.log("   Terminal 1:  cd ../contracts && npx hardhat node");
    console.log("   Terminal 2:  cd ../contracts && npx hardhat run scripts/deploy.js --network localhost");
    process.exit(1);
  }

  // ── Connect to Hardhat node ──────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

  // Verify connection
  try {
    const nodeCount = await contract.getNodeCount();
    const currentRound = await contract.getCurrentRound();
    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║     DECENTRALIZED MICROGRID FREQUENCY CONTROL DEMO       ║");
    console.log("║     Delay-Tolerant Cyber-Physical Consensus Protocol     ║");
    console.log("╠═══════════════════════════════════════════════════════════╣");
    console.log(`║  Nodes:    ${nodeCount} (Solar, Wind, Battery, Diesel)              ║`);
    console.log("║  Nominal:  50.000 Hz                                     ║");
    console.log(`║  Delay:    ${CONSENSUS_DELAY_SEC}s (simulated mining + network latency)     ║`);
    console.log(`║  Rounds:   ${TOTAL_ROUNDS}                                              ║`);
    console.log(`║  Contract: ${contractAddress.substring(0, 10)}...${contractAddress.slice(-6)}                    ║`);
    console.log(`║  Round:    ${currentRound} (current)                                    ║`);
    console.log("╚═══════════════════════════════════════════════════════════╝");
  } catch (err) {
    console.error("❌ Cannot connect to Hardhat node. Is it running?");
    console.error("   Error:", err.message);
    process.exit(1);
  }

  // ── Simulation loop ──────────────────────────────────────────
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    console.log("");
    printSeparator();
    console.log(`  ⚡ MICROGRID FREQUENCY SIMULATION — Round ${round}`);
    printSeparator();

    const timeStep = round;

    // ── Phase 1: Generate frequency deviations ─────────────
    console.log("\n  📊 Generating frequency deviations...\n");

    let sumDeltaF = 0;
    const deviations = [];

    for (const node of nodes) {
      const deltaF = generateFrequencyDeviation(node, timeStep);
      sumDeltaF += deltaF;
      deviations.push({ nodeId: node.id, deltaF, name: node.name, icon: node.icon });

      const localFreq = NOMINAL_FREQ + deltaF;
      console.log(`     Node ${node.id} ${node.icon}  │  Δf = ${signed(deltaF)} Hz  │  f_local = ${localFreq.toFixed(4)} Hz`);
    }

    const avgDeltaF    = sumDeltaF / NODE_COUNT;
    const combinedFreq = NOMINAL_FREQ + avgDeltaF;

    console.log("\n     ────────────────────────────────────────────");
    console.log(`     Combined f = 50 + Σ(Δf)/N = ${combinedFreq.toFixed(4)} Hz`);
    console.log(`     Avg Δf     = ${signed(avgDeltaF)} Hz`);

    // ── Phase 2: 15-second consensus delay ─────────────────
    console.log(`\n  ⏳ Simulating block mining & network delay (${CONSENSUS_DELAY_SEC}s)...`);

    for (let sec = CONSENSUS_DELAY_SEC; sec > 0; sec--) {
      const filled = CONSENSUS_DELAY_SEC - sec;
      const bar = "█".repeat(filled) + "░".repeat(sec);
      process.stdout.write(`\r     ⏱  ${String(sec).padStart(2)}s remaining...  ${bar}  `);
      await sleep(1000);
    }
    console.log("\r     ✅ Delay complete — transmitting to blockchain...                              ");

    // ── Phase 3: Send transactions ─────────────────────────
    console.log("\n  🔗 Submitting to FrequencyConsensus contract...\n");

    let allSuccess = true;

    // Get the current nonce explicitly to avoid stale cache with Hardhat automining
    let nonce = await provider.getTransactionCount(signer.address, "latest");

    for (const { nodeId, deltaF, name } of deviations) {
      // Convert Δf to milli-Hz (int256 scaled ×1000)
      const deltaFMilliHz = Math.round(deltaF * 1000);

      try {
        const tx = await contract.submitFrequency(nodeId, deltaFMilliHz, { nonce: nonce });
        const receipt = await tx.wait();
        console.log(`     Node ${nodeId}  │  ✅ tx: ${receipt.hash.substring(0, 18)}...  block: #${receipt.blockNumber}`);
        nonce++; // Manually increment nonce for next transaction
      } catch (err) {
        const reason = err.reason || (err.info?.error?.data?.message) || err.message;
        console.log(`     Node ${nodeId}  │  ❌ Error: ${reason}`);
        allSuccess = false;
        // Re-fetch nonce in case of failure
        nonce = await provider.getTransactionCount(signer.address, "latest");
      }
    }

    if (allSuccess) {
      // Fetch the consensus result
      try {
        const currentRound = await contract.getCurrentRound();
        const result = await contract.getResult(Number(currentRound) - 1);
        const globalFreq = Number(result.globalFrequency) / 1000;
        console.log(`\n  🎯 SCPM Consensus reached! Global frequency: ${globalFreq.toFixed(3)} Hz`);
        console.log(`     Data hash: ${result.dataHash}`);
      } catch (e) {
        console.log("\n  🎯 All 4 nodes submitted — SCPM consensus triggered on-chain!");
      }
    } else {
      console.log("\n  ⚠  Some submissions failed. Check Hardhat node.");
    }

    printSeparator();

    // Brief pause between rounds
    if (round < TOTAL_ROUNDS) {
      console.log("\n  Waiting 5s before next round...\n");
      await sleep(5000);
    }
  }

  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║              SIMULATION COMPLETE                         ║");
  console.log(`║  All ${TOTAL_ROUNDS} consensus rounds processed.                    ║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
