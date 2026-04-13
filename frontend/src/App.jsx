/* ═══════════════════════════════════════════════════════════════════════
   App.jsx — Main Dashboard Application
   Distributed Microgrid Secondary Control — Blockchain Demo
   (Attack/FDIA detection removed — distributed control only)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, FREQUENCY_CONSENSUS_ABI } from './contractConfig';
import TransactionLifecycle from './components/TransactionLifecycle';
import FrequencyChart from './components/FrequencyChart';
import NodeCard from './components/NodeCard';
import BlockchainHistory from './components/BlockchainHistory';
import './App.css';

function App() {
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [contractInfo, setContractInfo] = useState({
    address: CONTRACT_ADDRESS,
    round: '—',
    nodeCount: '—',
    nominal: '50.000 Hz',
    leadNode: '—',
  });

  // Blockchain history — grows as blocks are finalized via the stepper
  const [blocks, setBlocks] = useState([]);

  const handleBlockFinalized = useCallback((blockRecord) => {
    setBlocks(prev => [...prev, blockRecord]);
  }, []);

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

  // Listen for BlockVerified to keep stats bar in sync
  useEffect(() => {
    if (!contract) return;

    const onVerified = (round, globalFreq, controlSignal, leader) => {
      setContractInfo(prev => ({
        ...prev,
        round: String(Number(round) + 1),
        leadNode: String(leader),
      }));
    };

    contract.on('BlockVerified', onVerified);
    return () => contract.off('BlockVerified', onVerified);
  }, [contract]);

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <div className="logo-text">
              <h1 className="app-title">Microgrid Blockchain Control</h1>
              <p className="app-subtitle">
                Distributed Secondary Frequency Control — Blockchain-Enabled (Dai et al., 2024)
              </p>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            <span className="conn-dot" />
            {connected ? 'Hardhat Connected' : 'Disconnected'}
          </div>
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
          <span className="stat-label">Chain Round</span>
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
          <span className="stat-label">Demo Blocks</span>
          <span className="stat-value accent">{blocks.length}</span>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="main-content">

        {/* Node Status Cards */}
        <section className="section-nodes">
          <h2 className="section-title">
            <span>🔌</span> DG Nodes — Ring Topology (1↔2↔3↔4↔1)
          </h2>
          <div className="nodes-grid">
            {[1, 2, 3, 4].map(nodeId => (
              <NodeCard key={nodeId} nodeId={nodeId} contract={contract} />
            ))}
          </div>
        </section>

        {/* Step-by-Step Blockchain Stepper */}
        <section className="section-lifecycle">
          <TransactionLifecycle
            contract={contract}
            provider={provider}
            onBlockFinalized={handleBlockFinalized}
          />
        </section>

        {/* Blockchain History Table */}
        <section className="section-history">
          <BlockchainHistory blocks={blocks} />
        </section>

        {/* Frequency Chart */}
        <section className="section-chart">
          <FrequencyChart contract={contract} />
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="app-footer">
        <p>
          Blockchain-Enabled Distributed Secondary Frequency Control —
          Dai et al., IEEE Trans. Smart Grid, Vol.15, No.2, 2024
        </p>
        <p className="footer-tech">
          Solidity • Hardhat • PBFT • ethers.js • React • Distributed Control
        </p>
      </footer>
    </div>
  );
}

export default App;
