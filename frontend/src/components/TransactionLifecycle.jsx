/* ═══════════════════════════════════════════════════════════════════════
   TransactionLifecycle.jsx — Live Blockchain Step-by-Step Visualizer
   
   Polls GET /api/state every 400ms to see what the simulation is doing.
   The "Proceed" button sends POST /api/proceed which unblocks the simulation
   and triggers the REAL next on-chain action on Hardhat.
   
   All data shown is REAL: actual Δf values computed by the simulation,
   real tx hashes from Hardhat, real block hashes from the smart contract.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import './TransactionLifecycle.css';

// ── Constants ─────────────────────────────────────────────────────────

const NODE_META = {
  1: { name: 'Solar Prosumer',  icon: '☀️',  color: 'node-1' },
  2: { name: 'Wind Generator',  icon: '🌬️', color: 'node-2' },
  3: { name: 'Battery Storage', icon: '🔋', color: 'node-3' },
  4: { name: 'Diesel Backup',   icon: '⛽', color: 'node-4' },
};

const PHASE_LABELS = {
  starting:       { icon: '⚡', text: 'Simulation starting…',            detail: 'Connecting to Hardhat node and contract…' },
  startRound:     { icon: '🔄', text: 'New round starting…',             detail: 'Initialising node submissions for this round.' },
  measuring:      { icon: '📡', text: 'Measuring frequency deviation',   detail: 'Sampling local grid frequency via swing equation: Δf = ΔP / (2H·f₀)' },
  packaging:      { icon: '📦', text: 'Packaging transaction',           detail: 'ABI-encoding payload: submitFrequency(nodeId, frequency, activePower)' },
  broadcasting:   { icon: '📤', text: 'Ready to broadcast',              detail: 'Transaction signed. Press Proceed to send to Hardhat JSON-RPC (port 8545).' },
  txSent:         { icon: '✈️', text: 'Transaction sent — confirming…',  detail: 'Waiting for Hardhat to mine the block and confirm the tx…' },
  awaitingBlock:  { icon: '⏳', text: 'Awaiting blockchain consensus…',  detail: 'All 4 nodes submitted. Contract running PBFT lead election + consensus calculation.' },
  blockVerified:  { icon: '🎯', text: 'Block sealed by consensus!',       detail: 'BlockVerified event received. Block is immutably written to the distributed ledger.' },
  nextRound:      { icon: '🔁', text: 'Advancing to next round…',        detail: 'Resetting submission state. Next round beginning momentarily.' },
  complete:       { icon: '🏁', text: 'Simulation complete!',             detail: 'All rounds processed successfully.' },
  error:          { icon: '❌', text: 'Error occurred',                   detail: '' },
};

const STAGE_FOR_PHASE = {
  measuring:   0,
  packaging:   1,
  broadcasting: 2,
  txSent:      2,
};

const STAGE_LABELS = ['📡 Measure Δf', '📦 Package TX', '📤 Broadcast'];

// Polling interval
const POLL_MS = 400;

// ════════════════════════════════════════════════════════════════════════
//  Component
// ════════════════════════════════════════════════════════════════════════

export default function TransactionLifecycle({ onBlockFinalized }) {
  const [simState, setSimState]       = useState(null);
  const [apiOnline, setApiOnline]     = useState(false);
  const [proceeding, setProceeding]   = useState(false);  // button spinner
  const [prevRound, setPrevRound]     = useState(null);
  const prevRoundRef = useRef(null);

  // ── Poll /api/state ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('non-200');
        const data = await res.json();
        if (!cancelled) {
          setSimState(data);
          setApiOnline(true);
        }
      } catch {
        if (!cancelled) setApiOnline(false);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Detect block finalization → notify parent for history table ──
  useEffect(() => {
    if (!simState) return;
    if (simState.phase === 'blockVerified' && simState.block && simState.round !== prevRoundRef.current) {
      prevRoundRef.current = simState.round;
      // Build a block record from real on-chain data
      const record = {
        round:      simState.round,
        leadNode:   simState.block.leadNode,
        globalFreq: simState.block.globalFreq,
        avgDeltaF:  computeAvgDeltaF(simState.nodeData),
        nodes:      Object.entries(simState.nodeData).map(([id, d]) => ({
          id: Number(id), deltaF: d.deltaF,
        })),
        hash:       simState.block.hash,
        timestamp:  new Date().toLocaleTimeString(),
      };
      if (onBlockFinalized) onBlockFinalized(record);
    }
  }, [simState, onBlockFinalized]);

  // ── Proceed button handler ───────────────────────────────────────
  const handleProceed = useCallback(async () => {
    if (proceeding) return;
    setProceeding(true);
    try {
      await fetch('/api/proceed', { method: 'POST' });
    } catch (e) {
      console.warn('Proceed call failed:', e);
    } finally {
      // Small debounce so button doesn't immediately re-enable
      setTimeout(() => setProceeding(false), 300);
    }
  }, [proceeding]);

  // ── Derived display values ───────────────────────────────────────
  if (!apiOnline) {
    return (
      <div className="lc-container">
        <div className="lc-header">
          <div className="lc-title-group">
            <span className="lc-title-icon">🔗</span>
            <div>
              <h2 className="lc-title">Blockchain Step-by-Step Demo</h2>
              <p className="lc-subtitle">Waiting for simulation server…</p>
            </div>
          </div>
        </div>
        <div className="lc-api-offline">
          <span className="offline-icon">⚠️</span>
          <div>
            <strong>Simulation API offline</strong>
            <p>Run <code>.\run_simulation.ps1</code> to start the simulation server</p>
          </div>
        </div>
      </div>
    );
  }

  const phase      = simState?.phase ?? 'starting';
  const round      = simState?.round ?? 0;
  const nodeId     = simState?.activeNodeId;
  const nodeData   = simState?.nodeData ?? {};
  const completed  = simState?.completedNodeIds ?? [];
  const waiting    = simState?.waitingForProceed ?? false;
  const block      = simState?.block ?? null;
  const phaseInfo  = PHASE_LABELS[phase] ?? PHASE_LABELS['starting'];
  const activeStageIndex = STAGE_FOR_PHASE[phase] ?? -1;

  // Progress indicator (how many of 13 steps done this round)
  // 3 steps per node × 4 nodes + 1 block step = 13
  const nodeStepsCompleted = completed.length * 3 + (nodeId && activeStageIndex >= 0 ? activeStageIndex : 0);
  const totalSteps = 13;
  const blockStep  = phase === 'blockVerified' ? 1 : 0;
  const progressPct = Math.min(100, Math.round(((nodeStepsCompleted + blockStep) / totalSteps) * 100));

  // Button enabled only when simulation is paused
  const btnEnabled = waiting && !proceeding;

  // Button text
  const btnText = phase === 'blockVerified'
    ? `✅ Block ${round} sealed — Start Round ${round + 1} →`
    : phase === 'broadcasting'
    ? `⚡ Send Node ${nodeId} Transaction On-Chain →`
    : `⚡ Proceed →`;

  return (
    <div className="lc-container">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="lc-header">
        <div className="lc-title-group">
          <span className="lc-title-icon">🔗</span>
          <div>
            <h2 className="lc-title">Live Blockchain Demo</h2>
            <p className="lc-subtitle">Each step triggers a real transaction on Hardhat</p>
          </div>
        </div>
        <div className="lc-meta">
          <div className="lc-round-badge">Round {round || '—'}</div>
          <div className={`lc-api-dot ${apiOnline ? 'online' : 'offline'}`} title="Simulation API" />
        </div>
      </div>

      {/* ── Progress Bar ─────────────────────────────────────────── */}
      <div className="lc-progress-track">
        <div className="lc-progress-fill" style={{ width: `${progressPct}%` }} />
        <span className="lc-progress-label">{progressPct}%</span>
      </div>

      {/* ── Current Phase Description ─────────────────────────────── */}
      <div className={`lc-current-step ${phase === 'blockVerified' ? 'lc-step-finalized' : ''}`}>
        <span className="lc-step-icon">{phaseInfo.icon}</span>
        <div className="lc-step-text">
          <div className="lc-step-title">
            {nodeId && ['measuring','packaging','broadcasting','txSent'].includes(phase)
              ? `Node ${nodeId} (${NODE_META[nodeId]?.name}) — ${phaseInfo.text}`
              : phaseInfo.text}
          </div>
          <div className="lc-step-detail">
            {phase === 'error' ? simState?.error : phaseInfo.detail}
          </div>
        </div>
        {!waiting && !['blockVerified','complete','error'].includes(phase) && (
          <div className="lc-working-spinner">⟳</div>
        )}
      </div>

      {/* ── Node Pipeline Cards ───────────────────────────────────── */}
      <div className="lc-node-grid">
        {[1, 2, 3, 4].map(nid => {
          const meta        = NODE_META[nid];
          const data        = nodeData[nid];
          const isDone      = completed.includes(nid);
          const isActive    = nodeId === nid && !isDone;
          const isPending   = !isDone && !isActive;

          // Which stages are complete for this node?
          let stagesDone = [];
          if (isDone) {
            stagesDone = [0, 1, 2]; // all done
          } else if (isActive) {
            // stages before current phase are done
            stagesDone = Array.from({ length: activeStageIndex }, (_, i) => i);
          }

          return (
            <div
              key={nid}
              className={`lc-node-card ${meta.color}
                ${isActive ? 'lc-node-active' : ''}
                ${isDone   ? 'lc-node-done'   : ''}
                ${isPending ? 'lc-node-pending': ''}`}
            >
              <div className="lc-node-head">
                <span className="lc-node-icon">{meta.icon}</span>
                <div className="lc-node-info">
                  <span className="lc-node-label">Node {nid}</span>
                  <span className="lc-node-name">{meta.name}</span>
                </div>
                {isDone  && <span className="lc-done-check">✓</span>}
                {isActive && <span className="lc-active-pulse" />}
              </div>

              {/* Real Δf value — only shown once measuring starts */}
              {data ? (
                <div className="lc-delta">
                  Δf = <span className={data.deltaF >= 0 ? 'df-pos' : 'df-neg'}>
                    {data.deltaF >= 0 ? '+' : ''}{data.deltaF.toFixed(4)} Hz
                  </span>
                  <span className="lc-freq-local"> (f = {data.frequency.toFixed(3)} Hz)</span>
                </div>
              ) : (
                <div className="lc-delta lc-delta-pending">Δf = — waiting…</div>
              )}

              {/* Stage indicators */}
              <div className="lc-stages">
                {STAGE_LABELS.map((label, idx) => {
                  const done   = stagesDone.includes(idx);
                  const active = isActive && idx === activeStageIndex;
                  return (
                    <div key={idx} className="lc-stage-row">
                      <div className={`lc-stage-dot ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                        {done ? '✓' : active ? '◉' : '○'}
                      </div>
                      <span className={`lc-stage-name ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Real tx hash once submitted */}
              {data?.txHash && (
                <div className="lc-txhash">
                  <span className="lc-txhash-label">TX:</span>
                  <span className="lc-txhash-value mono">
                    {data.txHash.substring(0, 12)}…{data.txHash.slice(-6)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Block Finalization Panel ──────────────────────────────── */}
      <div className={`lc-finalization ${phase === 'awaitingBlock' || phase === 'blockVerified' ? 'lc-final-active' : ''}`}>
        <div className="lc-final-title">⛓️ Block Finalization (On-Chain)</div>

        <div className="lc-final-stages">
          {[
            { key: 'elect',  icon: '👑', label: 'Lead Node Election',     active: phase === 'awaitingBlock' || phase === 'blockVerified' },
            { key: 'pbft',   icon: '🗳️', label: 'PBFT Consensus',         active: phase === 'awaitingBlock' || phase === 'blockVerified' },
            { key: 'seal',   icon: '🔐', label: 'Block Sealed',            active: phase === 'blockVerified' },
            { key: 'append', icon: '✅', label: 'Written to Ledger',        active: phase === 'blockVerified' },
          ].map(s => (
            <div
              key={s.key}
              className={`lc-final-stage
                ${phase === 'blockVerified' ? 'done' : ''}
                ${phase === 'awaitingBlock' && (s.key === 'elect' || s.key === 'pbft') ? 'active' : ''}
              `}
            >
              <span className="lc-final-stage-icon">{s.icon}</span>
              <span className="lc-final-stage-label">{s.label}</span>
              {phase === 'blockVerified' && <span className="lc-final-check">✓</span>}
              {phase === 'awaitingBlock' && (s.key === 'elect' || s.key === 'pbft') && (
                <span className="lc-final-spinner">⟳</span>
              )}
            </div>
          ))}
        </div>

        {/* Real block data from the chain */}
        {block && (
          <div className="lc-final-info">
            <span className="lc-info-item">👑 Lead: Node {block.leadNode} ({NODE_META[block.leadNode]?.name})</span>
            <span className="lc-info-item">🌐 Global f = <strong>{block.globalFreq.toFixed(3)} Hz</strong></span>
            <span className="lc-info-item mono">🔑 {block.hash.substring(0, 18)}…</span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          PROCEED BUTTON — THE ONLY WAY TO ADVANCE THE SIMULATION
          ════════════════════════════════════════════════════════════ */}
      <div className="lc-proceed-wrapper">
        <button
          id="proceed-btn"
          className={`lc-proceed-btn ${!btnEnabled ? 'lc-btn-disabled' : ''} ${phase === 'blockVerified' ? 'lc-btn-finalized' : ''}`}
          onClick={handleProceed}
          disabled={!btnEnabled}
        >
          <span className="lc-btn-icon">
            {proceeding ? '⟳' : waiting ? '⚡' : '⏳'}
          </span>
          <span className="lc-btn-text">
            {proceeding
              ? 'Sending…'
              : waiting
              ? btnText
              : phase === 'txSent'
              ? 'Mining transaction…'
              : phase === 'awaitingBlock'
              ? 'Blockchain running consensus…'
              : 'Simulation computing…'}
          </span>
        </button>
        <div className="lc-step-hint">
          {waiting
            ? '▼ Press to execute the next step on-chain'
            : '⟳ Working — button will activate when ready'}
        </div>
      </div>

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function computeAvgDeltaF(nodeData) {
  const values = Object.values(nodeData).map(d => d.deltaF).filter(v => v != null);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
