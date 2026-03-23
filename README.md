# ⚡ Blockchain Microgrid Frequency Control

Decentralized secondary frequency control in an islanded microgrid using blockchain consensus (SCPM + delay-tolerant algorithms).

## 📁 Project Structure

```
blockchain-microgrid/
├── contracts/       # Solidity smart contract + Hardhat (local blockchain)
├── simulation/      # Node.js microgrid node simulation (4 nodes)
├── frontend/        # React dashboard with live transaction visualizer
```

## 🛠️ Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org/))
- **npm** (comes with Node.js)

## 🚀 Setup

### 1. Install dependencies (run once)

```bash
# Smart contract layer
cd contracts
npm install

# Simulation layer
cd ../simulation
npm install

# Frontend layer
cd ../frontend
npm install
```

### 2. Run the demo (4 terminals)

**Terminal 1** — Start the local blockchain:
```bash
cd contracts
npx hardhat node
```

**Terminal 2** — Deploy the smart contract:
```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```
> Note the `CONTRACT_ADDRESS` printed (default: `0x5FbDB2315678afecb367f032d93F642f64180aa3`)

**Terminal 3** — Start the dashboard:
```bash
cd frontend
npm run dev
```
> Opens at http://localhost:5173

**Terminal 4** — Start the simulation:
```bash
cd simulation
node simulate.js 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

## 📖 How It Works

1. **4 nodes** (Solar, Wind, Battery, Diesel) generate frequency deviations (Δf)
2. A **15-second delay** simulates block mining + network latency (real-world: ~50μs)
3. Each node submits its Δf to the **FrequencyConsensus** smart contract
4. Once all 4 nodes report, the contract calculates **global frequency** via SCPM
5. The result is locked **immutably** on-chain with a cryptographic hash
6. The **React dashboard** visualizes the full transaction lifecycle and frequency chart

> See [PROJECT_EXPLANATION.md](./PROJECT_EXPLANATION.md) for a detailed academic explanation.

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solidity 0.8.24 + Hardhat 2 |
| Simulation | Node.js + ethers.js v6 |
| Frontend | React + Vite + Recharts |
