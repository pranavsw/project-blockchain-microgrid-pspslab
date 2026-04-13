/**
 * simulate.js — Blockchain Microgrid Simulation + Step Control API
 *
 * This runs TWO things simultaneously:
 *   1. An Express API server on port 3001 for the UI to read state & send "proceed" signals
 *   2. The actual simulation loop that submits real transactions to Hardhat
 *
 * The simulation PAUSES at each phase and waits for POST /api/proceed before continuing.
 * This means the Proceed button on the UI *literally* triggers the next on-chain action.
 *
 * Step sequence per round (13 user presses):
 *   For each node 1→4:
 *     [PAUSE] → user sees "Measuring Δf" → presses Proceed
 *     [PAUSE] → user sees "Packaging Transaction" → presses Proceed
 *     [PAUSE] → user sees "Broadcasting" → presses Proceed → REAL TX SENT to Hardhat
 *   [AUTO]  → blockchain runs consensus after Node 4 submitted
 *   [PAUSE] → user sees Block finalized → presses Proceed → next round begins
 *
 * Usage: node simulate.js <CONTRACT_ADDRESS>
 */

const express = require('express');
const cors    = require('cors');
const { ethers } = require('ethers');

// ════════════════════════════════════════════════════════════════════════
//  Config
// ════════════════════════════════════════════════════════════════════════

const CONTRACT_ADDRESS = process.argv[2];
if (!CONTRACT_ADDRESS) {
  console.error('\n  ❌  Usage: node simulate.js <CONTRACT_ADDRESS>\n');
  process.exit(1);
}

const RPC_URL      = 'http://127.0.0.1:8545';
const API_PORT     = 3001;
const TOTAL_ROUNDS = 999;   // Runs indefinitely — stop manually
const NOMINAL_FREQ = 50.0;

const ABI = [
  'function submitFrequency(uint256 _nodeId, int256 _frequency, int256 _activePower)',
  'function getCurrentRound() view returns (uint256)',
  'event FrequencySubmitted(uint256 indexed round, uint256 indexed nodeId, int256 frequency, int256 activePower, int256 deltaF, uint256 timestamp)',
  'event LeadNodeElected(uint256 indexed round, uint256 indexed nodeId)',
  'event BlockVerified(uint256 indexed round, int256 globalFrequency, int256 controlSignal, uint256 leadNodeId, uint256[] nodeIds, bytes32 txHash)',
];

const NODE_DEFS = [
  { id: 1, name: 'Solar Prosumer',  icon: '☀️',  baseLoad: 100, variation: 15, inertia: 5.0 },
  { id: 2, name: 'Wind Generator',  icon: '🌬️', baseLoad: 200, variation: 25, inertia: 8.0 },
  { id: 3, name: 'Battery Storage', icon: '🔋', baseLoad: 150, variation: 10, inertia: 6.0 },
  { id: 4, name: 'Diesel Backup',   icon: '⛽', baseLoad:  80, variation: 20, inertia: 4.0 },
];

// ════════════════════════════════════════════════════════════════════════
//  Simulation State (this is what the UI reads via GET /api/state)
// ════════════════════════════════════════════════════════════════════════

let state = {
  phase: 'starting',          // starting | measuring | packaging | broadcasting | txSent | awaitingBlock | blockVerified | nextRound | complete
  round: 0,
  totalRounds: TOTAL_ROUNDS,
  activeNodeId: null,         // which node is currently in the spotlight
  waitingForProceed: false,   // true = button enabled, false = simulation working
  proceedLabel: 'Proceed',    // what the button should say
  nodeData: {},               // { [nodeId]: { deltaF, frequency, txHash, submitted } }
  completedNodeIds: [],        // which node IDs have fully submitted this round
  block: null,                // { globalFreq, leadNode, hash, controlSignal } — set after block verified
  error: null,
};

function setState(updates) {
  Object.assign(state, updates);
}

// ════════════════════════════════════════════════════════════════════════
//  Proceed mechanism — simulation blocks here until UI sends /api/proceed
// ════════════════════════════════════════════════════════════════════════

let _proceedResolver = null;

function waitForProceed(label = '→ Proceed') {
  setState({ waitingForProceed: true, proceedLabel: label });
  return new Promise(resolve => { _proceedResolver = resolve; });
}

function triggerProceed() {
  if (_proceedResolver) {
    setState({ waitingForProceed: false });
    const r = _proceedResolver;
    _proceedResolver = null;
    r();
    return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════
//  Express API
// ════════════════════════════════════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json());

// GET /api/state — UI polls this to render its view
app.get('/api/state', (_req, res) => res.json(state));

// POST /api/proceed — UI calls this when user presses the button
app.post('/api/proceed', (_req, res) => {
  const ok = triggerProceed();
  res.json({ ok, phase: state.phase });
});

app.listen(API_PORT, () => {
  console.log(`  🌐 UI Control API → http://localhost:${API_PORT}/api/state`);
});

// ════════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════════

function generateDeltaF(node, round) {
  const loadChange = node.variation * Math.sin(round * 0.1 * node.id);
  const noise = (Math.random() - 0.5) * node.variation * 0.6;
  const imbalance = loadChange + noise;
  let df = imbalance / (2.0 * node.inertia * NOMINAL_FREQ);
  return Math.max(-0.5, Math.min(0.5, df));
}

function waitForBlock(contract, round, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      contract.off('BlockVerified', handler);
      reject(new Error(`Timeout waiting for BlockVerified on round ${round}`));
    }, timeoutMs);

    function handler(evtRound, globalFreq, controlSignal, leadNodeId, nodeIds, txHash) {
      if (Number(evtRound) === round) {
        clearTimeout(timer);
        contract.off('BlockVerified', handler);
        resolve({
          globalFreq:    Number(globalFreq)    / 1000,
          controlSignal: Number(controlSignal) / 1000,
          leadNode:      Number(leadNodeId),
          hash:          txHash,
        });
      }
    }
    contract.on('BlockVerified', handler);
  });
}

// ════════════════════════════════════════════════════════════════════════
//  Main simulation loop
// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   MICROGRID BLOCKCHAIN SIMULATION + STEP API     ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  Contract: ${CONTRACT_ADDRESS.substring(0,10)}...${CONTRACT_ADDRESS.slice(-6)}          ║`);
  console.log(`║  API:      http://localhost:${API_PORT}                   ║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await provider.listAccounts();
  const signer   = await provider.getSigner(accounts[0].address);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  // Start from the current on-chain round
  const startRound = Number(await contract.getCurrentRound());
  console.log(`  ▶ Starting from round ${startRound}\n`);

  for (let round = startRound; round <= startRound + TOTAL_ROUNDS; round++) {

    // ── Reset round state ──────────────────────────────────────────
    setState({
      phase: 'startRound',
      round,
      activeNodeId: null,
      waitingForProceed: false,
      nodeData: {},
      completedNodeIds: [],
      block: null,
      error: null,
    });

    console.log(`\n━━━━━  Round ${round}  ━━━━━`);

    // ── Per-node submission with 3 pauses each ─────────────────────
    for (const node of NODE_DEFS) {
      const deltaF    = generateDeltaF(node, round);
      const frequency = NOMINAL_FREQ + deltaF;

      // Update nodeData entry for this node
      setState({
        activeNodeId: node.id,
        nodeData: {
          ...state.nodeData,
          [node.id]: { deltaF, frequency, txHash: null, submitted: false },
        },
      });

      // ── PAUSE 1: Measuring ─────────────────────────────────────
      setState({ phase: 'measuring' });
      console.log(`  [Node ${node.id}] Measuring Δf = ${deltaF >= 0 ? '+' : ''}${deltaF.toFixed(4)} Hz — waiting for proceed…`);
      await waitForProceed(`Proceed: Node ${node.id} measured → package`);

      // ── PAUSE 2: Packaging ────────────────────────────────────
      setState({ phase: 'packaging' });
      console.log(`  [Node ${node.id}] Packaging TX — waiting for proceed…`);
      await waitForProceed(`Proceed: Node ${node.id} packaged → broadcast`);

      // ── PAUSE 3: Broadcasting ─────────────────────────────────
      setState({ phase: 'broadcasting' });
      console.log(`  [Node ${node.id}] Broadcasting — waiting for proceed…`);
      await waitForProceed(`Proceed: Send Node ${node.id} TX on-chain ⚡`);

      // ── ACTUAL TX ─────────────────────────────────────────────
      setState({ phase: 'txSent' });
      console.log(`  [Node ${node.id}] Sending transaction…`);
      try {
        const freqMilliHz  = BigInt(Math.round(frequency * 1000));
        const powerMilliKW = BigInt(node.baseLoad * 1000);
        const tx = await contract.submitFrequency(BigInt(node.id), freqMilliHz, powerMilliKW);
        await tx.wait();

        console.log(`  [Node ${node.id}] ✅ tx: ${tx.hash.substring(0, 20)}…`);

        // Update state with tx hash
        setState({
          nodeData: {
            ...state.nodeData,
            [node.id]: { deltaF, frequency, txHash: tx.hash, submitted: true },
          },
          completedNodeIds: [...state.completedNodeIds, node.id],
          activeNodeId: node.id,
        });
      } catch (err) {
        console.error(`  [Node ${node.id}] ❌ Error: ${err.message}`);
        setState({ error: `Node ${node.id}: ${err.message}` });
      }
    }

    // ── Wait for on-chain consensus (automatic after last tx) ──────
    setState({ phase: 'awaitingBlock', activeNodeId: null });
    console.log(`\n  ⏳ Waiting for BlockVerified event from Hardhat…`);

    let blockResult;
    try {
      blockResult = await waitForBlock(contract, round);
    } catch (err) {
      console.warn(`  ⚠ ${err.message}`);
      setState({ error: err.message });
      continue;
    }

    console.log(`  🎯 Block ${round} verified! Lead: #${blockResult.leadNode}, Global f: ${blockResult.globalFreq.toFixed(3)} Hz`);

    // ── PAUSE 4: Show block result, user acknowledges ──────────────
    setState({
      phase: 'blockVerified',
      block: blockResult,
    });
    await waitForProceed(`✅ Block ${round} sealed — start Round ${round + 1}`);

    setState({ phase: 'nextRound' });
  }

  setState({ phase: 'complete' });
  console.log('\n  🏁 Simulation complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  setState({ phase: 'error', error: err.message });
});
