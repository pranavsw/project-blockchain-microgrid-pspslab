# Decentralized Microgrid Frequency Control Using Blockchain

## A Complete Explanation for Academic Presentation

---

## 0. What Exactly Are We Doing? (High-Level Summary)

Imagine you have a small neighbourhood that runs on its own electricity — with rooftop solar panels, a small wind turbine, a battery bank, and a diesel generator. This is called an **islanded microgrid**. There's no power company controlling things. The question is: **how do these 4 independent sources agree on what the grid frequency is, and coordinate to keep it stable at 50 Hz?**

Our project answers this using **blockchain** — the same technology behind cryptocurrencies. Here's the flow in plain English:

```
  STEP 1: Each of the 4 nodes measures its own local frequency.
          (They all get slightly different readings due to their own loads)
  
          Node 1 (Solar):   "I see 50.015 Hz"
          Node 2 (Wind):    "I see 49.983 Hz"
          Node 3 (Battery): "I see 50.012 Hz"
          Node 4 (Diesel):  "I see 50.017 Hz"

  STEP 2: Each node sends its reading to a program on the blockchain
          (called a "smart contract"). There is a 15-second delay here,
          simulating real-world network and mining delays.

  STEP 3: The smart contract waits until ALL 4 nodes have reported.
          This is the SCPM — nobody is left out of the decision.

  STEP 4: The contract calculates:
          Average deviation = (+0.015 - 0.017 + 0.012 + 0.017) / 4 = +0.007 Hz
          Global frequency  = 50.000 - 0.007 = 49.993 Hz
          (This tells generators how much to adjust)

  STEP 5: The result is permanently locked on the blockchain.
          It CANNOT be changed. It is the single source of truth.
          A cryptographic hash proves the data wasn't tampered with.

  STEP 6: The dashboard shows all of this in real-time —
          the fluctuating local readings vs. the stable on-chain result.
```

**In one sentence**: We built a system where 4 independent power sources vote on what the grid frequency is, and the blockchain locks their consensus result forever — with no central authority needed.

### What We Actually Built (3 Software Pieces)

| Piece | What It Is | Analogy |
|---|---|---|
| **Smart Contract** (Solidity) | A program on the blockchain that collects votes and calculates consensus | The ballot box + vote counter |
| **Simulation** (Node.js) | Simulates 4 generators producing fluctuating frequency data | The 4 voters casting their ballots |
| **Dashboard** (React) | A live web page showing the entire process visually | The election results TV screen |

---

## 1. What Problem Are We Solving?

### The Microgrid Frequency Problem

In any electrical grid, the frequency must stay at exactly **50 Hz** (in India/Europe) or 60 Hz (in USA). If frequency deviates even slightly, equipment gets damaged and blackouts occur.

In a **traditional centralized grid**, one authority (like a power company) monitors and controls frequency. But in a **microgrid** — a small, self-contained grid with solar panels, wind turbines, batteries, and diesel generators — there is **no central authority**. Each node (generator/consumer) operates independently.

**The core question**: How do 4 independent nodes agree on what the grid frequency actually is, and coordinate a correction — **without trusting a single central controller**?

### Why Blockchain?

Blockchain solves this through **decentralized consensus** — the same technology behind Bitcoin and Ethereum. Instead of trusting one entity, all participants agree on a shared, **immutable** (unchangeable) record of truth.

| Traditional Grid | Blockchain Microgrid |
|---|---|
| Central controller decides | All nodes vote equally |
| Single point of failure | No single point of failure |
| Controller can be hacked/corrupted | Data is cryptographically secured |
| Frequency data can be altered | Once recorded, data is **immutable** |

---

## 2. Key Concepts Used

### 2.1 Smart Contract Participation Matrix (SCPM)

The **SCPM** is a framework where each microgrid node is registered in a smart contract, forming a "participation matrix." Think of it as a digital attendance register:

```
Round 1 Participation Matrix:
┌──────────┬────────────┬───────────┐
│  Node ID │  Submitted │    Δf     │
├──────────┼────────────┼───────────┤
│  Node 1  │     ✅     │  +0.015   │
│  Node 2  │     ✅     │  -0.020   │
│  Node 3  │     ✅     │  +0.008   │
│  Node 4  │     ✅     │  +0.012   │
└──────────┴────────────┴───────────┘
→ All nodes submitted → Consensus reached!
```

The smart contract only calculates the global frequency **once ALL registered nodes have reported**. This ensures every participant has a voice.

### 2.2 Delay-Tolerant Consensus

In real cyber-physical systems, there are unavoidable **delays**:
- **Communication latency**: Data packets travel through networks (~milliseconds)
- **Block mining time**: Blockchain transactions need to be verified (~seconds to minutes)
- **Network congestion**: Variable delays under high load

In reality, frequency updates happen every **~50 microseconds (μs)**. But blockchain consensus takes much longer. Our simulation uses a **15-second delay** to visually demonstrate this gap — showing that the system still works correctly despite the delay.

This is the essence of "delay-tolerant consensus" — the blockchain-based control system is designed to function correctly **even when there are significant delays** between measurement and action.

### 2.3 Secondary Frequency Control

Power system frequency control has three levels:

| Level | Speed | Who Does It | What It Does |
|---|---|---|---|
| **Primary** | Milliseconds | Generators automatically | Immediate droop response |
| **Secondary** | Seconds–Minutes | Our system (AGC) | Restores frequency to exactly 50 Hz |
| **Tertiary** | Minutes–Hours | Operators manually | Economic re-dispatch |

Our project demonstrates **secondary control** — after primary control stabilizes the frequency roughly, our blockchain system calculates precisely how much correction is needed to return to exactly 50 Hz.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM OVERVIEW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │  Node 1  │  │  Node 2  │  │  Node 3  │  │  Node 4  │  │
│   │  Solar   │  │   Wind   │  │ Battery  │  │  Diesel  │  │
│   │ ☀️ Δf=+15│  │ 🌬️ Δf=-20│  │ 🔋 Δf=+8 │  │ ⛽ Δf=+12│  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        │             │             │             │          │
│        ▼             ▼             ▼             ▼          │
│   ┌─────────────────────────────────────────────────────┐  │
│   │          SIMULATION LAYER (Node.js)                  │  │
│   │   • Generates frequency deviations (Δf)              │  │
│   │   • Simulates 15-second network delay                │  │
│   │   • Sends transactions to blockchain                 │  │
│   └──────────────────────┬──────────────────────────────┘  │
│                          │ JSON-RPC (HTTP)                   │
│                          ▼                                   │
│   ┌─────────────────────────────────────────────────────┐  │
│   │       BLOCKCHAIN LAYER (Hardhat + Solidity)          │  │
│   │   • FrequencyConsensus smart contract                │  │
│   │   • Receives Δf from all 4 nodes                     │  │
│   │   • SCPM: Calculates global frequency                │  │
│   │   • Emits BlockVerified event with crypto hash       │  │
│   │   • Data becomes IMMUTABLE on-chain                  │  │
│   └──────────────────────┬──────────────────────────────┘  │
│                          │ ethers.js (WebSocket)             │
│                          ▼                                   │
│   ┌─────────────────────────────────────────────────────┐  │
│   │       FRONTEND LAYER (React Dashboard)               │  │
│   │   • Transaction Lifecycle Visualizer                 │  │
│   │   • Real-time Frequency Chart                        │  │
│   │   • Node Status Cards                                │  │
│   └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Code Walkthrough

### 4.1 The Smart Contract (`/contracts/contracts/FrequencyConsensus.sol`)

This is the **brain** of the system — a program that runs on the blockchain. Once deployed, **nobody can modify it**, not even the creator.

#### What is a Smart Contract?

Think of it as a vending machine:
- You put in a coin (send a transaction)
- The machine follows its programming exactly (executes code)
- You get your item (state changes on blockchain)
- Nobody can open the machine and change the rules

#### Key Functions:

**`registerNode(nodeId)`** — Adds a node to the participation matrix
```
Only the contract owner can call this.
It's like adding a student to the class roster — 
only the teacher (owner) can enroll new students.
```

**`submitFrequency(nodeId, deltaF)`** — A node reports its frequency deviation
```
deltaF is in milli-Hz (×1000) because Solidity doesn't support decimals.
So Δf = -0.050 Hz is sent as -50.

The contract checks:
  ✓ Is this node registered?
  ✓ Has this node already submitted this round?
  ✓ If all nodes submitted → trigger consensus calculation
```

**`_calculateConsensus()`** — The SCPM logic (runs automatically)
```
When all 4 nodes have submitted:

1. Sum all deviations:     totalΔf = Δf₁ + Δf₂ + Δf₃ + Δf₄
2. Average deviation:      avgΔf  = totalΔf / 4
3. Global frequency:       f_global = 50.000 - avgΔf
   (This is the correction — compensating for the average deviation)
4. Create a cryptographic hash of all the data (proof of integrity)
5. Emit BlockVerified event (permanent, immutable record)
6. Advance to next round
```

#### Why milli-Hz?

Solidity (the programming language for Ethereum smart contracts) **cannot handle decimal numbers**. So we multiply everything by 1000:

| Real Value | Stored in Contract |
|---|---|
| 50.000 Hz | 50000 |
| 49.950 Hz | 49950 |
| Δf = -0.050 Hz | -50 |

#### Events — The Blockchain's Log Book

```solidity
event BlockVerified(
    uint256 round,           // Which round this is (1, 2, 3...)
    int256 globalFrequency,  // The corrected frequency (50000 = 50Hz)
    uint256[] nodeIds,       // Which nodes participated [1, 2, 3, 4]
    bytes32 txHash           // Cryptographic hash (proof of data integrity)
);
```

Once this event is emitted, it is **permanently recorded on the blockchain**. Even if someone deletes the computer running the node, the data still exists on every other copy of the blockchain.

---

### 4.2 The Simulation (`/simulation/simulate.js`)

This simulates 4 real-world generators/prosumers in the microgrid.

#### How Frequency Deviations Are Generated

Each node uses the **swing equation** from power systems engineering:

```
Δf = ΔP / (2 × H × f₀)

Where:
  ΔP = Power imbalance (load change + random noise)
  H  = Inertia constant of the generator
  f₀ = Nominal frequency (50 Hz)
```

The power imbalance comes from:
1. **Sinusoidal load variation** — simulates daily demand patterns (e.g., everyone turns on ACs at noon)
2. **Gaussian random noise** — simulates unpredictable events (cloud covers solar panel, sudden wind gust)

#### The 15-Second Delay

```
Real-world frequency measurement:  every ~50 μs (microseconds)
Blockchain consensus:              15 seconds in our simulation

This gap demonstrates the "delay-tolerant" aspect:
→ Local measurements are FAST but MUTABLE (can change)
→ Blockchain records are SLOW but IMMUTABLE (permanent)
```

The simulation shows a countdown timer during this delay, visualizing the time gap between physical measurement and blockchain confirmation.

#### What Happens Each Round

```
Round N:
  1. Each node generates a random Δf (frequency deviation)
  2. Calculate local combined frequency: f = 50 + avg(Δf)
  3. Wait 15 seconds (simulating blockchain delay)
  4. Send each node's Δf to the smart contract (4 transactions)
  5. After 4th submission → contract automatically calculates consensus
  6. Global frequency is locked on-chain → IMMUTABLE
  7. Move to Round N+1
```

---

### 4.3 The Frontend Dashboard (`/frontend/`)

A React.js web application that visualizes everything in real-time.

#### Transaction Lifecycle Visualizer

Shows the 3-stage pipeline for each node's data:

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────────┐
│ 🔐 Encoding │ ──▸ │ 📡 Sending to Chain  │ ──▸ │ ✅ Verified    │
│    Data      │     │   (15s delay shown)  │     │ TX: 0x84a5...  │
└─────────────┘     └──────────────────────┘     │ Block: #6      │
                                                  └────────────────┘
```

- **Encoding Data**: The node's frequency deviation is being hashed/encoded
- **Sending to Blockchain**: Transaction is in-flight (the 15-second delay)
- **Block Verified**: Transaction confirmed, hash and block number displayed

#### Frequency Chart

A real-time line chart with two types of data:

```
  50.15 ┤                    ╭╮
        │   ╭─╮    ╭╮      ╭╯╰╮    ← Local frequencies (4 squiggly lines)
  50.00 ┤──━━━━━━━━━━━━━━━━━━━━━━━  ← Global on-chain freq (stable red line)
        │╰╯   ╰╮╭╯  ╰──╮╭─╯
  49.85 ┤       ╰╯      ╰╯
        └──────────────────────

  ── Local (mutable, fluctuating)    Each node's raw measurement
  ━━ Global (immutable, on-chain)    Blockchain consensus result
```

The key insight this visualizes:
- **Local frequencies** are constantly changing (mutable) — each node sees slightly different values
- **Global frequency** steps discretely when consensus rounds complete (immutable) — this is the blockchain-verified truth

#### How Local Frequencies Are Demonstrated

This is an important design detail — the local frequencies are demonstrated in **two different places**, and they serve different purposes:

**1. In the Simulation (Terminal/Console)** — the "real" readings:
```
The Node.js simulation generates actual frequency deviations using
physics-based formulas (the swing equation). These Δf values are:
  • Computed using sinusoidal load patterns + Gaussian random noise
  • Different every round (because of the randomness)
  • Sent as blockchain transactions to the smart contract
  • The values you see in the terminal ARE the values on-chain
```

**2. In the Dashboard (Browser Chart)** — visual demonstration:
```
The React dashboard generates its OWN simulated local frequencies
in the browser for the chart. Here's why:

  • Local frequencies are, by definition, NOT stored on the blockchain
    (only the Δf submissions and the final consensus result are)
  • The chart needs a new data point every 2 seconds to look smooth,
    but blockchain rounds happen only every ~15 seconds
  • So the chart shows client-side simulated fluctuations to visually
    represent what "mutable, constantly changing" data looks like

The GLOBAL frequency line (red) IS read from the blockchain.
It only updates when a real consensus round completes on-chain.
```

**What this demonstrates conceptually:**

| Data Type | Where It Lives | How It Behaves | Who Can Change It |
|---|---|---|---|
| Local frequency | Each node's sensor | Changes every instant | Nobody controls it — it's physics |
| Submitted Δf | Blockchain (per round) | Locked after submission | Nobody — it's immutable |
| Global consensus freq | Blockchain (per round) | Updates once per round | The smart contract's math |

The contrast between the **squiggly local lines** and the **stable global line** is the entire point: blockchain turns chaotic, disagreeing local measurements into a single, agreed-upon, tamper-proof truth.

---

## 5. How to Run the Demo

### Prerequisites
- Node.js (v18+)
- npm

### Steps (4 terminal windows):

```bash
# Terminal 1: Start the local blockchain
cd contracts
npx hardhat node

# Terminal 2: Deploy the smart contract & register 4 nodes
cd contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start the dashboard
cd frontend
npm run dev
# → Opens at http://localhost:5173

# Terminal 4: Start the simulation
cd simulation
node simulate.js 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

---

## 6. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Blockchain** | Solidity 0.8.24 | Smart contract language (like Java for blockchain) |
| **Local Chain** | Hardhat 2 | Runs a temporary blockchain on your computer |
| **Simulation** | Node.js + ethers.js | Simulates 4 microgrid nodes |
| **Frontend** | React + Vite | Dashboard UI |
| **Charts** | Recharts | Real-time frequency visualization |
| **Blockchain SDK** | ethers.js v6 | JavaScript library to talk to blockchain |

---

## 7. Key Takeaways for Presentation

### Why This Matters

1. **Decentralization**: No single point of failure. If one node goes down, the system continues.

2. **Immutability**: Once the global frequency is recorded on-chain, it **cannot be tampered with**. This creates an auditable, trustworthy record.

3. **Transparency**: All participants can see all submissions and results. Nobody can secretly manipulate the frequency data.

4. **Delay Tolerance**: The system acknowledges that blockchain consensus is slower than physical systems (~50μs vs ~15s) and is designed to work correctly despite this gap.

5. **SCPM Framework**: The Smart Contract Participation Matrix ensures that consensus is only reached when **all registered nodes** have contributed, preventing incomplete or manipulated results.

### Limitations & Future Work

- **Scalability**: Current demo has 4 nodes. Real microgrids could have hundreds.
- **Latency**: 15-second delay is too slow for actual primary frequency control — but suitable for secondary control (AGC).
- **Privacy**: All frequency data is visible on-chain. Future work could use zero-knowledge proofs for privacy.
- **Incentivization**: Could add token rewards for nodes that consistently provide accurate data.

---

## 8. Glossary for Quick Reference

| Term | Simple Explanation |
|---|---|
| **Blockchain** | A shared database that nobody can cheat on |
| **Smart Contract** | A program that runs on the blockchain — once deployed, rules can't be changed |
| **Δf (Delta f)** | How far the frequency is from the ideal 50 Hz |
| **Consensus** | All participants agreeing on a single truth |
| **Immutable** | Cannot be changed or deleted after being recorded |
| **Transaction** | One action on the blockchain (like sending a submission) |
| **Block** | A group of transactions bundled together |
| **Hash** | A cryptographic fingerprint — unique ID for data, proves nothing was tampered |
| **Hardhat** | A tool that runs a fake blockchain on your laptop for testing |
| **ethers.js** | A JavaScript library that lets your code talk to the blockchain |
| **SCPM** | Smart Contract Participation Matrix — the framework for node registration and voting |
| **AGC** | Automatic Generation Control — the real-world system for secondary frequency control |
| **Prosumer** | Someone who both produces and consumes electricity (e.g., house with solar panels) |
| **Islanded Microgrid** | A small grid disconnected from the main power grid, operating independently |
