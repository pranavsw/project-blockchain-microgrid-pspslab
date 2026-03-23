/* ═══════════════════════════════════════════════════════════════════════
   App.jsx — Main Dashboard Application
   Connects to local Hardhat node and orchestrates all components
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, FREQUENCY_CONSENSUS_ABI } from './contractConfig';
import TransactionLifecycle from './components/TransactionLifecycle';
import FrequencyChart from './components/FrequencyChart';
import NodeCard from './components/NodeCard';
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
  });

  // Connect to local Hardhat node
  useEffect(() => {
    const connect = async () => {
      try {
        const prov = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const network = await prov.getNetwork();

        const ct = new ethers.Contract(CONTRACT_ADDRESS, FREQUENCY_CONSENSUS_ABI, prov);

        // Verify contract is deployed
        const nodeCount = await ct.getNodeCount();
        const currentRound = await ct.getCurrentRound();

        setProvider(prov);
        setContract(ct);
        setConnected(true);
        setError(null);
        setContractInfo(prev => ({
          ...prev,
          round: String(currentRound),
          nodeCount: String(nodeCount),
          chainId: String(network.chainId),
        }));
      } catch (err) {
        console.error('Connection failed:', err);
        setError('Cannot connect to Hardhat node at localhost:8545. Is it running?');
        setConnected(false);
      }
    };

    connect();
    const interval = setInterval(connect, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll for round updates
  useEffect(() => {
    if (!contract) return;
    const interval = setInterval(async () => {
      try {
        const round = await contract.getCurrentRound();
        setContractInfo(prev => ({ ...prev, round: String(round) }));
      } catch (e) { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
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
                Decentralized Secondary Control via Blockchain Consensus
              </p>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            <span className="conn-dot" />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          {connected && (
            <div className="chain-badge">
              Chain #{contractInfo.chainId}
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
              Run <code>npx hardhat node</code> in the <code>/contracts</code> directory,
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
          <span className="stat-label">Current Round</span>
          <span className="stat-value accent">{contractInfo.round}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Registered Nodes</span>
          <span className="stat-value accent">{contractInfo.nodeCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Nominal Freq</span>
          <span className="stat-value">{contractInfo.nominal}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Consensus</span>
          <span className="stat-value">SCPM</span>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="main-content">
        {/* Node Cards Row */}
        <section className="section-nodes">
          <h2 className="section-title">
            <span>🔌</span> Microgrid Nodes
          </h2>
          <div className="nodes-grid">
            {[1, 2, 3, 4].map(nodeId => (
              <NodeCard key={nodeId} nodeId={nodeId} contract={contract} />
            ))}
          </div>
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
          Decentralized Microgrid Frequency Control Demo —
          Smart Contract Participation Matrix (SCPM) &
          Delay-Tolerant Consensus
        </p>
        <p className="footer-tech">
          Solidity • Hardhat • ethers.js • React • C++ Simulation
        </p>
      </footer>
    </div>
  );
}

export default App;
