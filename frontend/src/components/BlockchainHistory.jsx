/* ═══════════════════════════════════════════════════════════════════════
   BlockchainHistory.jsx — Growing block history table
   Each finalized block from the stepper appears as a new animated row.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import './BlockchainHistory.css';

const NODE_META = {
  1: { name: 'Solar Prosumer', icon: '☀️'  },
  2: { name: 'Wind Generator', icon: '🌬️' },
  3: { name: 'Battery Storage', icon: '🔋' },
  4: { name: 'Diesel Backup',  icon: '⛽' },
};

export default function BlockchainHistory({ blocks }) {
  const [expanded, setExpanded] = useState(null);

  if (!blocks || blocks.length === 0) {
    return (
      <div className="bh-container">
        <div className="bh-header">
          <span className="bh-header-icon">📦</span>
          <div>
            <h2 className="bh-title">Blockchain History</h2>
            <p className="bh-subtitle">Finalized blocks will appear here as the demo advances</p>
          </div>
          <div className="bh-count-badge">0 Blocks</div>
        </div>
        <div className="bh-empty">
          <span className="bh-empty-icon">⛓️</span>
          <p>No blocks yet — press ⚡ Proceed through all 16 steps to seal your first block</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bh-container">
      <div className="bh-header">
        <span className="bh-header-icon">📦</span>
        <div>
          <h2 className="bh-title">Blockchain History</h2>
          <p className="bh-subtitle">Immutable distributed ledger — click any block to expand</p>
        </div>
        <div className="bh-count-badge">{blocks.length} Block{blocks.length !== 1 ? 's' : ''}</div>
      </div>

      {/* ── Table Header ────────────────────────────────────── */}
      <div className="bh-table">
        <div className="bh-thead">
          <div className="bh-th bh-col-block"># Block</div>
          <div className="bh-th bh-col-round">Round</div>
          <div className="bh-th bh-col-lead">Lead Node</div>
          <div className="bh-th bh-col-gf">Global f (Hz)</div>
          <div className="bh-th bh-col-delta">Avg Δf (Hz)</div>
          <div className="bh-th bh-col-nodes">Nodes</div>
          <div className="bh-th bh-col-time">Time</div>
          <div className="bh-th bh-col-hash">Block Hash</div>
        </div>

        <div className="bh-tbody">
          {[...blocks].reverse().map((block, revIdx) => {
            const blockNum = blocks.length - revIdx;
            const isNew = revIdx === 0;
            const isOpen = expanded === block.round;
            const leadMeta = NODE_META[block.leadNode];

            return (
              <div key={block.round} className={`bh-row-wrapper ${isNew ? 'bh-row-new' : ''}`}>
                <div
                  className={`bh-row ${isOpen ? 'bh-row-open' : ''}`}
                  onClick={() => setExpanded(isOpen ? null : block.round)}
                >
                  <div className="bh-td bh-col-block">
                    <span className="bh-block-num">#{blockNum}</span>
                    {isNew && <span className="bh-new-pill">NEW</span>}
                  </div>
                  <div className="bh-td bh-col-round mono">{block.round}</div>
                  <div className="bh-td bh-col-lead">
                    <span className="bh-lead-icon">{leadMeta?.icon}</span>
                    <span className="bh-lead-name">Node {block.leadNode}</span>
                  </div>
                  <div className="bh-td bh-col-gf">
                    <span className="bh-freq">{block.globalFreq.toFixed(3)}</span>
                  </div>
                  <div className="bh-td bh-col-delta">
                    <span className={block.avgDeltaF >= 0 ? 'df-pos' : 'df-neg'}>
                      {block.avgDeltaF >= 0 ? '+' : ''}{block.avgDeltaF.toFixed(4)}
                    </span>
                  </div>
                  <div className="bh-td bh-col-nodes">
                    <div className="bh-node-dots">
                      {block.nodes.map(n => (
                        <span key={n.id} className={`bh-node-dot nd-${n.id}`} title={`Node ${n.id}`} />
                      ))}
                    </div>
                  </div>
                  <div className="bh-td bh-col-time mono">{block.timestamp}</div>
                  <div className="bh-td bh-col-hash mono">
                    {block.hash.substring(0, 10)}…{block.hash.slice(-6)}
                  </div>
                </div>

                {/* ── Expanded Detail ─────────────────────────────── */}
                {isOpen && (
                  <div className="bh-expanded animate-fade-in">
                    <div className="bh-exp-section">
                      <div className="bh-exp-title">📋 Per-Node Submissions</div>
                      <div className="bh-exp-nodes">
                        {block.nodes.map(n => (
                          <div key={n.id} className={`bh-exp-node nd-border-${n.id}`}>
                            <span className="bh-exp-node-icon">{NODE_META[n.id]?.icon}</span>
                            <div className="bh-exp-node-info">
                              <span className="bh-exp-node-label">Node {n.id} — {NODE_META[n.id]?.name}</span>
                              <span className={`bh-exp-node-df ${n.deltaF >= 0 ? 'df-pos' : 'df-neg'}`}>
                                Δf = {n.deltaF >= 0 ? '+' : ''}{n.deltaF.toFixed(4)} Hz
                              </span>
                            </div>
                            <span className="bh-exp-node-f mono">
                              f = {(50 + n.deltaF).toFixed(3)} Hz
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bh-exp-section">
                      <div className="bh-exp-title">🔑 Block Metadata</div>
                      <div className="bh-exp-meta">
                        <div className="bh-exp-row">
                          <span>Full Hash</span>
                          <span className="mono">{block.hash}</span>
                        </div>
                        <div className="bh-exp-row">
                          <span>Lead Node</span>
                          <span>{leadMeta?.icon} Node {block.leadNode} — {leadMeta?.name}</span>
                        </div>
                        <div className="bh-exp-row">
                          <span>Consensus</span>
                          <span>PBFT (2/3 supermajority)</span>
                        </div>
                        <div className="bh-exp-row">
                          <span>Timestamp</span>
                          <span className="mono">{block.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
