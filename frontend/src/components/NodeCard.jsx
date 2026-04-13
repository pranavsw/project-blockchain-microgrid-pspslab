/* ═══════════════════════════════════════════════════════════════════════
   NodeCard.jsx — Individual node status card with live Δf display
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import './NodeCard.css';

const NODE_META = {
  1: { name: 'Solar Prosumer', icon: '☀️', type: 'Photovoltaic Array' },
  2: { name: 'Wind Generator', icon: '🌬️', type: 'Wind Turbine' },
  3: { name: 'Battery Storage', icon: '🔋', type: 'Li-Ion BESS' },
  4: { name: 'Diesel Backup', icon: '⛽', type: 'Diesel Genset' },
};

export default function NodeCard({ nodeId, contract }) {
  const [latestDeltaF, setLatestDeltaF] = useState(null);
  const [submissions, setSubmissions] = useState(0);
  const [isOnline, setIsOnline] = useState(false);

  const meta = NODE_META[nodeId];

  useEffect(() => {
    if (!contract) return;

    const onSubmitted = (round, nid, deltaF) => {
      if (Number(nid) !== nodeId) return;
      setLatestDeltaF(Number(deltaF) / 1000);
      setSubmissions(prev => prev + 1);
      setIsOnline(true);
    };

    contract.on('FrequencySubmitted', onSubmitted);
    return () => contract.off('FrequencySubmitted', onSubmitted);
  }, [contract, nodeId]);

  return (
    <div className={`node-card node-card-${nodeId}`}>
      <div className="node-card-header">
        <div className="node-card-icon">{meta.icon}</div>
        <div className="node-card-info">
          <h3 className="node-card-name">{meta.name}</h3>
          <span className="node-card-type">{meta.type}</span>
        </div>
        <div className={`node-status-dot ${isOnline ? 'online' : 'offline'}`} />
      </div>

      <div className="node-card-body">
        <div className="node-metric">
          <span className="metric-label">Node ID</span>
          <span className="metric-value mono">#{nodeId}</span>
        </div>
        <div className="node-metric">
          <span className="metric-label">Status</span>
          <span className={`metric-value status ${isOnline ? 'online' : ''}`}>
            {isOnline ? 'Active' : 'Idle'}
          </span>
        </div>
        <div className="node-metric">
          <span className="metric-label">Submissions</span>
          <span className="metric-value mono">{submissions}</span>
        </div>
        <div className="node-metric highlight">
          <span className="metric-label">Latest Δf</span>
          <span className={`metric-value mono delta ${latestDeltaF !== null ? (latestDeltaF >= 0 ? 'pos' : 'neg') : ''}`}>
            {latestDeltaF !== null ? `${latestDeltaF >= 0 ? '+' : ''}${latestDeltaF.toFixed(4)} Hz` : '— Hz'}
          </span>
        </div>
      </div>
    </div>
  );
}
