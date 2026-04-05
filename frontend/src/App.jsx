/* ═══════════════════════════════════════════════════════════════════════
   App.jsx — Main Dashboard Application
   Aligned with Dai et al. (2024) — PBFT, FDIA Detection, Trimmer
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, FREQUENCY_CONSENSUS_ABI } from './contractConfig';
import TransactionLifecycle from './components/TransactionLifecycle';
import FrequencyChart from './components/FrequencyChart';
import NodeCard from './components/NodeCard';
import AttackPanel from './components/AttackPanel';
import './App.css';

function App() {
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [fdiaActive, setFdiaActive] = useState(false);
  const [trimmerActive, setTrimmerActive] = useState(false);
  const [contractInfo, setContractInfo] = useState({
    address: CONTRACT_ADDRESS,
    round: '—',
    nodeCount: '—',
    nominal: '50.000 Hz',
    leadNode: '—',
    fdiaDetections: 0,
  });

  // Connect to local Hardhat node
  useEffect(() => {
    const connect = async () => {
      try {
        const prov = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        await prov.getNetwork();

        const ct = new ethers.Contract(CONTRACT_ADDRESS, FREQUENCY_CONSENSUS_ABI, prov);
        const nodeCount = await ct.getNodeCount();
        const currentRound = await ct.getCurrentRound();

        let leadNodeId = '—';
        if (Number(currentRound) > 1) {
          try {
            const result = await ct.getResult(Number(currentRound) - 1);
            leadNodeId = String(result.leadNodeId);
            setFdiaActive(Number(result.fdiaDetections) > 0);
            setTrimmerActive(result.trimmerUsed);
          } catch (e) { /* first round */ }
        }

        setProvider(prov);
        setContract(ct);
        setConnected(true);
        setError(null);
        setContractInfo(prev => ({
          ...prev,
          round: String(currentRound),
          nodeCount: String(nodeCount),
          leadNode: leadNodeId,
        }));
      } catch (err) {
        setError('Cannot connect to Hardhat node at localhost:8545. Is it running?');
        setConnected(false);
      }
    };

    connect();
    const interval = setInterval(connect, 8000);
    return () => clearInterval(interval);
  }, []);

  // Listen for FDIA and Trimmer events
  useEffect(() => {
    if (!contract) return;

    const onFDIA = (round, nodeId) => {
      setFdiaActive(true);
    };

    const onTrimmer = (round, scalingFactor) => {
      setTrimmerActive(true);
    };

    const onVerified = (round, globalFreq, controlSig, leadNodeId) => {
      setContractInfo(prev => ({
        ...prev,
        round: String(Number(round) + 1),
        leadNode: String(leadNodeId),
      }));
    };

    contract.on('FDIADetected', onFDIA);
    contract.on('TrimmerActivated', onTrimmer);
    contract.on('BlockVerified', onVerified);

    return () => {
      contract.off('FDIADetected', onFDIA);
      contract.off('TrimmerActivated', onTrimmer);
      contract.off('BlockVerified', onVerified);
    };
  }, [contract]);

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <div className="logo-text">
              <h1 className="app-title">Microgrid Frequency Control</h1>
              <p className="app-subtitle">
                Blockchain-Enabled Cyber-Resilience — Dai et al. (2024)
              </p>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            <span className="conn-dot" />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          {fdiaActive && (
            <div className="connection-badge fdia-badge">
              🚨 FDIA Detected
            </div>
          )}
          {trimmerActive && (
            <div className="connection-badge trimmer-badge">
              🛡️ Trimmer Active
            </div>
          )}
        </div>
      </header>

      {/* ── Error Banner ───────────────────────────────────────── */}
      {error && (
        <div className="error-banner animate-fade-in">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <strong>Connection Error</strong>
            <p>{error}</p>
            <p className="error-hint">
              Run <code>npx hardhat node</code> in <code>/contracts</code>,
              then <code>npx hardhat run scripts/deploy.js --network localhost</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Stats Bar ──────────────────────────────────────────── */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">Contract</span>
          <span className="stat-value mono">
            {CONTRACT_ADDRESS.substring(0, 8)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 6)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Round</span>
          <span className="stat-value accent">{contractInfo.round}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">DG Nodes</span>
          <span className="stat-value accent">{contractInfo.nodeCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Lead Node</span>
          <span className="stat-value accent">👑 #{contractInfo.leadNode}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Consensus</span>
          <span className="stat-value">PBFT</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Defense</span>
          <span className="stat-value">SC² Trimmer</span>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="main-content">
        {/* Node Cards Row */}
        <section className="section-nodes">
          <h2 className="section-title">
            <span>🔌</span> DG Nodes (Ring Topology: 1↔2↔3↔4↔1)
          </h2>
          <div className="nodes-grid">
            {[1, 2, 3, 4].map(nodeId => (
              <NodeCard key={nodeId} nodeId={nodeId} contract={contract} />
            ))}
          </div>
        </section>

        {/* Attack Panel */}
        <section className="section-attack">
          <AttackPanel contract={contract} provider={provider} />
        </section>

        {/* Transaction Lifecycle */}
        <section className="section-lifecycle">
          <TransactionLifecycle contract={contract} provider={provider} />
        </section>

        {/* Frequency Chart */}
        <section className="section-chart">
          <FrequencyChart contract={contract} />
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="app-footer">
        <p>
          Blockchain-Enabled Cyber-Resilience Enhancement Framework —
          Dai et al., IEEE Trans. Smart Grid, Vol.15, No.2, 2024
        </p>
        <p className="footer-tech">
          Solidity • Hardhat • PBFT • ethers.js • React • FDIA Detection • SC² Trimmer
        </p>
      </footer>
    </div>
  );
}

export default App;
