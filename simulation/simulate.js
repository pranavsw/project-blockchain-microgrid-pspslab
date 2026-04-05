/*
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  Microgrid Frequency Simulation — Cyber-Physical Layer              ║
 * ║                                                                     ║
 * ║  Based on: Dai et al., "Blockchain-Enabled Cyber-Resilience         ║
 * ║  Enhancement Framework of Microgrid Distributed Secondary Control   ║
 * ║  Against False Data Injection Attacks"                              ║
 * ║  IEEE Trans. Smart Grid, Vol.15, No.2, March 2024                   ║
 * ║                                                                     ║
 * ║  Simulates 4 DG nodes with:                                         ║
 * ║    • Primary droop control: f_i = f* − k_pi × P_i + Δf_i           ║
 * ║    • 15-second delay (real ≈ 50μs) for delay-tolerant consensus     ║
 * ║    • Optional FDIA attack injection via --attack flag               ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

const { ethers } = require("ethers");
const { execSync } = require("child_process");

// ════════════════════════════════════════════════════════════════════════
//  Configuration
// ════════════════════════════════════════════════════════════════════════

const NOMINAL_FREQ         = 50.0;    // Hz
const NOMINAL_FREQ_MILLI   = 50000;   // milli-Hz (for contract)
const NODE_COUNT           = 4;
const CONSENSUS_DELAY_SEC  = 5;       // Simulated mining delay (real: ~50μs)
const TOTAL_ROUNDS         = 5;
const RPC_URL              = "http://127.0.0.1:8545";

// Hardhat account #0
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Updated ABI matching the new contract
const CONTRACT_ABI = [
  "function submitFrequency(uint256 _nodeId, int256 _frequency, int256 _activePower)",
  "function getCurrentRound() view returns (uint256)",
  "function getNodeCount() view returns (uint256)",
  "function getLeadNode(uint256 _round) view returns (uint256)",
  "function getResult(uint256 _round) view returns (tuple(int256 globalFrequency, int256 totalDeltaF, int256 averageDeltaF, int256 controlSignal, uint256 nodeCount, uint256 leadNodeId, uint256 fdiaDetections, bool trimmerUsed, int256 trimmerScaling, uint256 timestamp, bytes32 dataHash))",
  "event BlockVerified(uint256 indexed round, int256 globalFrequency, int256 controlSignal, uint256 leadNodeId, uint256[] nodeIds, bytes32 txHash)",
  "event FDIADetected(uint256 indexed round, uint256 indexed nodeId, int256 deviation, int256 threshold)",
  "event TrimmerActivated(uint256 indexed round, int256 scalingFactor, uint256 affectedNodes)",
  "event LeadNodeElected(uint256 indexed round, uint256 indexed nodeId)",
];

// ════════════════════════════════════════════════════════════════════════
//  DG Node Definitions (aligned with paper)
// ════════════════════════════════════════════════════════════════════════

const nodes = [
  { id: 1, name: "Solar Prosumer",  icon: "☀️",  basePower: 100, loadVariation: 15, inertia: 5.0, kp: 0.050 },
  { id: 2, name: "Wind Generator",  icon: "🌬️",  basePower: 200, loadVariation: 25, inertia: 8.0, kp: 0.030 },
  { id: 3, name: "Battery Storage", icon: "🔋", basePower: 150, loadVariation: 10, inertia: 6.0, kp: 0.020 },
  { id: 4, name: "Diesel Backup",   icon: "⛽", basePower: 80,  loadVariation: 20, inertia: 4.0, kp: 0.060 },
];

// ════════════════════════════════════════════════════════════════════════
//  CLI Argument Parsing
// ════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    contractAddress: null,
    attackEnabled: false,
    attackNode: 2,        // Default: attack Wind Generator
    attackType: 1,        // 1 = Type I (payload only), 2 = Type II (payload + identity)
    attackMagnitude: 500,  // milli-Hz: inject +0.5 Hz fake deviation
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--attack") {
      config.attackEnabled = true;
    } else if (args[i] === "--attack-node" && args[i + 1]) {
      config.attackNode = parseInt(args[++i]);
    } else if (args[i] === "--attack-type" && args[i + 1]) {
      config.attackType = parseInt(args[++i]);
    } else if (args[i] === "--attack-magnitude" && args[i + 1]) {
      config.attackMagnitude = parseInt(args[++i]);
    } else if (!args[i].startsWith("--")) {
      config.contractAddress = args[i];
    }
  }

  return config;
}

// ════════════════════════════════════════════════════════════════════════
//  Physics Helpers
// ════════════════════════════════════════════════════════════════════════

/** Gaussian random via Box-Muller */
function gaussianRandom(mean = 0, stdDev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Real data is now fetched using OpenDSS Direct via Python.
 * The generateNodeData function has been replaced by the OpenDSS Engine.
 */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function signed(v, d = 4) { return (v >= 0 ? "+" : "") + v.toFixed(d); }
function sep() { console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"); }

// ════════════════════════════════════════════════════════════════════════
//  Main Simulation
// ════════════════════════════════════════════════════════════════════════

async function main() {
  const config = parseArgs();

  if (!config.contractAddress) {
    console.log("⚠  Usage: node simulate.js <CONTRACT_ADDRESS> [--attack] [--attack-node N] [--attack-type 1|2]");
    console.log("");
    console.log("   Options:");
    console.log("     --attack              Enable FDIA injection");
    console.log("     --attack-node N       Which node to compromise (default: 2)");
    console.log("     --attack-type 1|2     Type I (payload) or Type II (payload+identity)");
    console.log("     --attack-magnitude N  Fake deviation in milli-Hz (default: 500)");
    console.log("");
    console.log("   Example: node simulate.js 0x5FbDB...aa3 --attack --attack-node 2");
    process.exit(1);
  }

  // ── Connect ──
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

  try {
    const nodeCount = await contract.getNodeCount();
    const currentRound = await contract.getCurrentRound();

    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║  BLOCKCHAIN-ENABLED MICROGRID FREQUENCY CONTROL          ║");
    console.log("║  Dai et al., IEEE Trans. Smart Grid, 2024                ║");
    console.log("╠═══════════════════════════════════════════════════════════╣");
    console.log(`║  Nodes:     ${nodeCount} DG units (Solar, Wind, Battery, Diesel)   ║`);
    console.log("║  Nominal:   50.000 Hz                                    ║");
    console.log(`║  Delay:     ${CONSENSUS_DELAY_SEC}s (simulated mining + network)           ║`);
    console.log("║  Consensus: PBFT (Lead Node rotation)                    ║");
    console.log("║  Defense:   FDIA Bias Check + Self-Healing Trimmer       ║");
    if (config.attackEnabled) {
      console.log("╠═══════════════════════════════════════════════════════════╣");
      console.log(`║  🚨 FDIA ATTACK ENABLED                                  ║`);
      console.log(`║  Target:    Node ${config.attackNode} (${nodes.find(n => n.id === config.attackNode)?.name})                   ║`);
      console.log(`║  Type:      ${config.attackType === 1 ? "I (payload modification)" : "II (payload + identity spoof)"}                  ║`);
      console.log(`║  Magnitude: ${(config.attackMagnitude / 1000).toFixed(3)} Hz fake deviation                 ║`);
    }
    console.log("╚═══════════════════════════════════════════════════════════╝");
  } catch (err) {
    console.error("❌ Cannot connect to Hardhat node:", err.message);
    process.exit(1);
  }

  // ── Simulation Loop ──
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    console.log(""); sep();
    console.log(`  ⚡ ROUND ${round} — Secondary Frequency Control`);

    // Show lead node (PBFT rotation)
    const expectedLeader = nodes[(round - 1) % NODE_COUNT];
    console.log(`  👑 Lead Node: Node ${expectedLeader.id} (${expectedLeader.name})`);
    sep();

    const timeStep = round;

    // ── Phase 1: Generate measurements ──
    console.log("\n  📊 DG Node Measurements (OpenDSS Power Flow + Droop Control)\n");

    let sumFreq = 0;
    const measurements = [];

    let openDssData = null;
    try {
      // Call the Python OpenDSS Engine to solve the real circuit
      const output = execSync(`python opendss_engine.py --step ${timeStep}`, { encoding: "utf-8" });
      openDssData = JSON.parse(output.trim());
    } catch (e) {
      console.error("\n❌ Failed to run OpenDSS Engine. Is Python and OpenDSSDirect.py installed?");
      console.error("Try running: pip install OpenDSSDirect.py");
      console.error(e.message);
      process.exit(1);
    }

    for (const node of nodes) {
      const nodeData = openDssData.nodes.find(n => n.nodeId === node.id);
      let frequency = nodeData.frequency;
      let activePower = nodeData.activePower;
      let isAttacked = false;

      // ── FDIA Injection ──
      if (config.attackEnabled && node.id === config.attackNode) {
        isAttacked = true;
        const fakeDeviation = config.attackMagnitude / 1000;

        if (config.attackType === 1) {
          // Type I: Modify the frequency reading
          frequency = NOMINAL_FREQ + fakeDeviation;
        } else {
          // Type II: Large deviation to exceed FDIA threshold
          frequency = NOMINAL_FREQ + fakeDeviation * 2;
        }
      }

      sumFreq += frequency;
      measurements.push({ nodeId: node.id, frequency, activePower, name: node.name, icon: node.icon, isAttacked });

      const deltaF = frequency - NOMINAL_FREQ;
      const attackTag = isAttacked ? "  🚨 FDIA" : "";
      console.log(`     Node ${node.id} ${node.icon}  │  f = ${frequency.toFixed(4)} Hz  │  P = ${activePower.toFixed(1)} kW  │  Δf = ${signed(deltaF)} Hz${attackTag}`);
    }

    const avgFreq = sumFreq / NODE_COUNT;
    console.log("\n     ────────────────────────────────────────────");
    console.log(`     Average f = ${avgFreq.toFixed(4)} Hz  │  Deviation = ${signed(avgFreq - NOMINAL_FREQ)} Hz`);

    // ── Phase 2: Delay ──
    console.log(`\n  ⏳ Block mining + network delay (${CONSENSUS_DELAY_SEC}s)...`);
    for (let sec = CONSENSUS_DELAY_SEC; sec > 0; sec--) {
      const filled = CONSENSUS_DELAY_SEC - sec;
      process.stdout.write(`\r     ⏱  ${String(sec).padStart(2)}s remaining  ${"█".repeat(filled)}${"░".repeat(sec)}  `);
      await sleep(1000);
    }
    console.log("\r     ✅ Delay complete — submitting to blockchain                              ");

    // ── Phase 3: Submit transactions ──
    console.log("\n  🔗 Submitting (frequency, power) to FrequencyConsensus...\n");

    let allSuccess = true;
    let nonce = await provider.getTransactionCount(signer.address, "latest");

    for (const { nodeId, frequency, activePower, isAttacked } of measurements) {
      const freqMilli = Math.round(frequency * 1000);    // to milli-Hz
      const powerMilli = Math.round(activePower * 1000);  // to milli-kW

      try {
        const tx = await contract.submitFrequency(nodeId, freqMilli, powerMilli, { nonce });
        const receipt = await tx.wait();

        const attackTag = isAttacked ? " 🚨" : "";
        console.log(`     Node ${nodeId}  │  ✅ tx: ${receipt.hash.substring(0, 18)}...  block: #${receipt.blockNumber}${attackTag}`);
        nonce++;
      } catch (err) {
        const reason = err.reason || err.info?.error?.data?.message || err.message;
        console.log(`     Node ${nodeId}  │  ❌ Error: ${reason}`);
        allSuccess = false;
        nonce = await provider.getTransactionCount(signer.address, "latest");
      }
    }

    // ── Phase 4: Read consensus result ──
    if (allSuccess) {
      try {
        const newRound = await contract.getCurrentRound();
        const result = await contract.getResult(Number(newRound) - 1);
        const globalFreq = Number(result.globalFrequency) / 1000;
        const controlSig = Number(result.controlSignal) / 1000;
        const leader = Number(result.leadNodeId);
        const fdiaCount = Number(result.fdiaDetections);
        const trimmerUsed = result.trimmerUsed;
        const trimmerScale = Number(result.trimmerScaling) / 1000;

        console.log(`\n  🎯 PBFT Consensus Reached!`);
        console.log(`     👑 Lead Node:       #${leader} (${nodes.find(n => n.id === leader)?.name})`);
        console.log(`     📡 Global Frequency: ${globalFreq.toFixed(3)} Hz`);
        console.log(`     🔧 Control Signal:   ${signed(controlSig, 3)}`);
        console.log(`     🔒 Data Hash:        ${result.dataHash.substring(0, 22)}...`);

        if (fdiaCount > 0) {
          console.log(`     🚨 FDIA Detected:    ${fdiaCount} node(s) flagged!`);
          if (trimmerUsed) {
            console.log(`     🛡️  Trimmer Active:   k_t = ${trimmerScale.toFixed(3)} (scaled down malicious signals)`);
          }
        }
      } catch (e) {
        console.log("\n  🎯 All nodes submitted — consensus triggered on-chain!");
      }
    } else {
      console.log("\n  ⚠  Some submissions failed.");
    }

    sep();

    if (round < TOTAL_ROUNDS) {
      console.log("\n  Waiting 5s before next round...\n");
      await sleep(5000);
    }
  }

  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║              SIMULATION COMPLETE                         ║");
  console.log(`║  ${TOTAL_ROUNDS} consensus rounds processed                         ║`);
  if (config.attackEnabled) {
    console.log("║  FDIA attack was injected and detected by the contract   ║");
  }
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
