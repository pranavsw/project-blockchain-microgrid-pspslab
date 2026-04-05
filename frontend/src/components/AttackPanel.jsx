/* ═══════════════════════════════════════════════════════════════════════
   AttackPanel.jsx — FDIA Attack Control Panel
   Allows user to inject False Data Injection Attacks from the dashboard
   and observe the Self-Healing Trimmer (SC2) response.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import './AttackPanel.css';

const ATTACK_NODES = [
  { id: 1, name: 'Solar Prosumer', icon: '☀️' },
  { id: 2, name: 'Wind Generator', icon: '🌬️' },
  { id: 3, name: 'Battery Storage', icon: '🔋' },
  { id: 4, name: 'Diesel Backup', icon: '⛽' },
];

export default function AttackPanel({ contract }) {
  const [fdiaEvents, setFdiaEvents] = useState([]);
  const [trimmerEvents, setTrimmerEvents] = useState([]);

  // Listen for FDIA and Trimmer events from the contract
  useEffect(() => {
    if (!contract) return;

    const onFDIA = (round, nodeId, deviation, threshold) => {
      setFdiaEvents(prev => [
        {
          round: Number(round),
          nodeId: Number(nodeId),
          deviation: Number(deviation) / 1000,
          threshold: Number(threshold) / 1000,
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, 10));
    };

    const onTrimmer = (round, scalingFactor, affectedNodes) => {
      setTrimmerEvents(prev => [
        {
          round: Number(round),
          scaling: Number(scalingFactor) / 1000,
          affected: Number(affectedNodes),
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, 10));
    };

    contract.on('FDIADetected', onFDIA);
    contract.on('TrimmerActivated', onTrimmer);

    return () => {
      contract.off('FDIADetected', onFDIA);
      contract.off('TrimmerActivated', onTrimmer);
    };
  }, [contract]);

  return (
    <div className="attack-panel">
      <div className="attack-header">
        <h2 className="attack-title">
          <span>🛡️</span> Cyber-Resilience Monitor
        </h2>
        <p className="attack-subtitle">
          FDIA Detection &amp; Self-Healing Trimmer (SC²)
        </p>
      </div>

      <div className="attack-grid">
        {/* FDIA Detection Log */}
        <div className="attack-card fdia-card">
          <h3 className="card-header">
            <span className="card-icon">🚨</span>
            FDIA Detection Log
          </h3>
          <p className="card-hint">
            Run simulation with <code>--attack</code> flag to inject FDIA
          </p>

          {fdiaEvents.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✅</span>
              <p>No attacks detected — system is secure</p>
            </div>
          ) : (
            <div className="event-list">
              {fdiaEvents.map((evt, i) => (
                <div key={i} className="event-item fdia-event animate-fade-in">
                  <div className="event-header">
                    <span className="event-badge fdia">FDIA</span>
                    <span className="event-time">{evt.time}</span>
                  </div>
                  <div className="event-body">
                    <span>Round {evt.round} • Node {evt.nodeId} ({ATTACK_NODES.find(n => n.id === evt.nodeId)?.name})</span>
                    <span className="event-deviation">Δf = {evt.deviation >= 0 ? '+' : ''}{evt.deviation.toFixed(3)} Hz</span>
                    <span className="event-threshold">(threshold: ±{evt.threshold.toFixed(3)} Hz)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trimmer Status */}
        <div className="attack-card trimmer-card">
          <h3 className="card-header">
            <span className="card-icon">🔧</span>
            Self-Healing Trimmer (SC²)
          </h3>
          <p className="card-hint">
            Scales down malicious control signals: k<sub>t</sub> = Σu<sub>normal</sub> / Σu<sub>FDIA</sub>
          </p>

          {trimmerEvents.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💤</span>
              <p>Trimmer inactive — no corrections needed</p>
            </div>
          ) : (
            <div className="event-list">
              {trimmerEvents.map((evt, i) => (
                <div key={i} className="event-item trimmer-event animate-fade-in">
                  <div className="event-header">
                    <span className="event-badge trimmer">TRIMMER</span>
                    <span className="event-time">{evt.time}</span>
                  </div>
                  <div className="event-body">
                    <span>Round {evt.round} • {evt.affected} node(s) affected</span>
                    <span className="event-scaling">k_t = {evt.scaling.toFixed(3)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How to Attack Instructions */}
      <div className="attack-instructions">
        <strong>To inject FDIA:</strong> Run the simulation with the <code>--attack</code> flag:
        <code className="attack-command">
          node simulate.js {'<CONTRACT_ADDRESS>'} --attack --attack-node 2 --attack-type 1
        </code>
      </div>
    </div>
  );
}
