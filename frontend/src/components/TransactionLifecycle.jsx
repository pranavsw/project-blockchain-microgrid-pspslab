/* ═══════════════════════════════════════════════════════════════════════
   TransactionLifecycle.jsx — Pipeline Visualizer Component
   Shows live state transitions for each node's blockchain submission:
   1. Encoding Data → 2. Sending to Blockchain → 3. Block Verified
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import './TransactionLifecycle.css';

const NODE_LABELS = {
  1: { name: 'Solar Prosumer', icon: '☀️' },
  2: { name: 'Wind Generator', icon: '🌬️' },
  3: { name: 'Battery Storage', icon: '🔋' },
  4: { name: 'Diesel Backup', icon: '⛽' },
};

const STAGES = [
  { key: 'encoding', label: 'Encoding Data', icon: '🔐' },
  { key: 'sending',  label: 'Sending to Blockchain', icon: '📡' },
  { key: 'verified', label: 'Block Verified', icon: '✅' },
];

export default function TransactionLifecycle({ contract }) {
  const [nodeStates, setNodeStates] = useState(() => {
    const init = {};
    [1, 2, 3, 4].forEach(id => {
      init[id] = { stage: 'idle', deltaF: null, txHash: null, blockNumber: null, globalFreq: null, round: null };
    });
    return init;
  });
  const [currentRound, setCurrentRound] = useState(null);

  // Poll current round
  useEffect(() => {
    if (!contract) return;

    let cancelled = false;
    const fetchRound = async () => {
      try {
        const round = await contract.getCurrentRound();
        if (!cancelled) setCurrentRound(Number(round));
      } catch (e) {
        // contract not available yet
      }
    };
    fetchRound();
    const interval = setInterval(fetchRound, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [contract]);

  // Listen for contract events
  useEffect(() => {
    if (!contract) return;

    const onSubmitted = (round, nodeId, deltaF) => {
      const nid = Number(nodeId);
      const df = Number(deltaF) / 1000;
      const rid = Number(round);

      // First show encoding, then transition to sending
      setNodeStates(prev => ({
        ...prev,
        [nid]: {
          ...prev[nid],
          round: rid,
          stage: 'encoding',
          deltaF: df,
          timestamp: Date.now(),
        }
      }));

      setTimeout(() => {
        setNodeStates(prev => ({
          ...prev,
          [nid]: { ...prev[nid], stage: 'sending' }
        }));
      }, 800);
    };

    const onVerified = (round, globalFreq, nodeIds, txHash) => {
      const rid = Number(round);
      const gf = Number(globalFreq) / 1000;

      for (let i = 0; i < nodeIds.length; i++) {
        const id = Number(nodeIds[i]);
        setNodeStates(prev => ({
          ...prev,
          [id]: {
            ...prev[id],
            round: rid,
            stage: 'verified',
            txHash: String(txHash),
            blockNumber: rid,
            globalFreq: gf,
          }
        }));
      }
    };

    contract.on('FrequencySubmitted', onSubmitted);
    contract.on('BlockVerified', onVerified);

    return () => {
      contract.off('FrequencySubmitted', onSubmitted);
      contract.off('BlockVerified', onVerified);
    };
  }, [contract]);

  return (
    <div className="lifecycle-container">
      <div className="lifecycle-header">
        <h2 className="lifecycle-title">
          <span className="lifecycle-icon">🔄</span>
          Transaction Lifecycle
        </h2>
        <div className="round-badge">
          Round <span className="round-number">{currentRound ?? '—'}</span>
        </div>
      </div>

      <div className="pipeline-grid">
        {[1, 2, 3, 4].map(nodeId => {
          const state = nodeStates[nodeId];
          const nodeInfo = NODE_LABELS[nodeId];
          const stageIndex = STAGES.findIndex(s => s.key === state.stage);

          return (
            <div key={nodeId} className={`pipeline-card pipeline-node-${nodeId}`}>
              <div className="pipeline-node-header">
                <span className="node-icon">{nodeInfo.icon}</span>
                <span className="node-label">Node {nodeId}</span>
                <span className="node-name">{nodeInfo.name}</span>
              </div>

              {state.deltaF !== null && (
                <div className="delta-display">
                  Δf = <span className={`delta-value ${state.deltaF >= 0 ? 'positive' : 'negative'}`}>
                    {state.deltaF >= 0 ? '+' : ''}{state.deltaF.toFixed(4)} Hz
                  </span>
                </div>
              )}

              <div className="stages-pipeline">
                {STAGES.map((stage, idx) => {
                  const isActive = stage.key === state.stage;
                  const isDone = stageIndex > idx;
                  const isVerified = stage.key === 'verified' && state.stage === 'verified';

                  return (
                    <div key={stage.key} className="stage-wrapper">
                      {idx > 0 && (
                        <div className={`stage-connector ${isDone || isActive ? 'active' : ''}`}>
                          <div className="connector-line" />
                          <div className="connector-arrow">▸</div>
                        </div>
                      )}
                      <div className={`stage-chip ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isVerified ? 'verified' : ''}`}>
                        <span className="stage-icon">
                          {isActive && stage.key === 'sending' ? (
                            <span className="spinner">⟳</span>
                          ) : (
                            stage.icon
                          )}
                        </span>
                        <span className="stage-label">{stage.label}</span>
                        {isActive && stage.key === 'sending' && (
                          <div className="sending-indicator">
                            <div className="pulse-dot" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {state.stage === 'verified' && state.txHash && (
                <div className="verified-info animate-fade-in">
                  <div className="verified-row">
                    <span className="verified-label">TX Hash</span>
                    <span className="verified-value mono">
                      {state.txHash.length > 18
                        ? `${state.txHash.substring(0, 10)}...${state.txHash.substring(state.txHash.length - 8)}`
                        : state.txHash}
                    </span>
                  </div>
                  <div className="verified-row">
                    <span className="verified-label">Round</span>
                    <span className="verified-value mono">#{state.round}</span>
                  </div>
                  {state.globalFreq !== null && (
                    <div className="verified-row">
                      <span className="verified-label">Global f</span>
                      <span className="verified-value global-freq">{state.globalFreq.toFixed(3)} Hz</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
