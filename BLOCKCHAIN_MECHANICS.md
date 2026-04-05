# Understanding the Blockchain Mechanics
### A Beginner-Friendly Breakdown for the Microgrid Project

This document provides a simple, foundational explanation of how blockchain works in the context of our microgrid project, specifically aligned with the research paper *“Blockchain-Enabled Cyber-Resilience Enhancement Framework of Microgrid Distributed Secondary Control Against False Data Injection Attacks” (Dai et al., 2024).*

If you don't know much about blockchain, you've probably heard of Bitcoin. The blockchain we use here is **very different**. It is not public, and nobody is burning electricity to "mine" coins. Instead, it is an **Enterprise / Permissioned Blockchain** (like *Hyperledger Fabric*, which the paper uses).

---

## 1. The Core Concept: "Each Node has its own Blockchain"

In a traditional database, one central server holds all the data. In a blockchain, **every participant (node) holds an identical, fully synchronized copy of the entire database** (known as the *Ledger* or the *Chain*).

In our 4-node microgrid:
- ☀️ Solar Prosumer runs a computer.
- 🌬️ Wind Generator runs a computer.
- 🔋 Battery Storage runs a computer.
- ⛽ Diesel Backup runs a computer.

**Each of these computers holds a file that contains the entire history of frequency corrections.** That file *is* their copy of the blockchain. 

Because everyone has a copy, if one node's computer breaks or gets hacked and changes its local database, the other three nodes will say, *"Wait, your copy doesn't match ours. You are incorrect."* This is how the system achieves resilience without a central boss.

---

## 2. What exactly is a "Block"?

Think of the blockchain as a digital logbook consisting of pages. Each "page" is a **Block**.
A block is simply a secure package containing data that got created during a specific time period (a "round").

In our system, a block contains:
1. **Transactions (The Data):** The frequency ($\Delta f$) and power ($P$) measurements submitted by all 4 nodes during that round.
2. **The Consensus Result:** The calculated Average Deviation and the Final Global Corrected Frequency.
3. **A Timestamp:** Exactly when this was agreed upon.
4. **The "Hash" (The Cryptographic Glue):** A unique mathematical fingerprint of this block's data combined with the fingerprint of the *previous block*. This prevents anyone from secretly changing past history.

---

## 3. The Algorithm: How a Block Gets Added & Verified

How do 4 independent computers sitting far away from each other agree on exactly what to write on the next "page" of their logbooks? 

They use an algorithm called **PBFT (Practical Byzantine Fault Tolerance)**. The paper chose PBFT because it is fast and can tolerate up to 1/3 of the nodes acting maliciously or being broken.

Here is the exact step-by-step lifecycle of how a block is born, updated, and verified:

### Step 1: Measurement (Generating Transactions)
Every few milliseconds, each generator's sensor reads its local frequency. Once per round (simulated as every 15 seconds), the node packages its reading into a digital envelope, signs it with an unforgeable cryptographic key (proving it came from *them*), and broadcasts it to the other nodes.

### Step 2: Electing a "Lead Node"
If all 4 nodes tried to write a block at the exact same time, it would be chaotic. The PBFT algorithm solves this by electing a temporary boss called the **Lead Node**.
- To be fair, they use a **Round-Robin** system. 
- Round 1: Solar is the Leader. 
- Round 2: Wind is the Leader. 
- Round 3: Battery is the Leader, and so on.

### Step 3: Proposing the Block
The Lead Node gathers the 4 incoming envelopes (transactions) and sorts them into a draft "Page" (a proposed block). It also calculates the resulting Global Frequency based on the Smart Contract math. The Lead Node sends this draft block to the other 3 nodes, essentially asking: *"Does everyone agree this should be our next block?"*

### Step 4: The PBFT Voting Phase (Verification)
The remaining nodes receive the draft block. They don't just blindly trust the Lead Node. They independently perform checks:
- *Did these transactions actually come from the right people? (Checking signatures)*
- *Did the Lead Node calculate the math correctly according to the Smart Contract?*
- *Is any data severely biased? (FDIA checks)*

They broadcast their "votes" to each other (e.g., *"Node 2 says the block is valid"*, *"Node 3 says the block is valid"*). 

### Step 5: Finalization and Adding the Block
According to the PBFT algorithm, you need a **Supermajority (2/3 of the total nodes)** to agree. 
- In our 4-node system, we need at least 3 nodes to vote "Yes."
- Once 3 out of 4 nodes have broadcast a "Yes" vote, consensus is mathematically reached.
- At that exact moment, **ALL 4 nodes permanently write that block to their local copy of the blockchain.** 

The round is now complete. The global frequency is updated, and the generators adjust their engines. The cycle begins again.

---

## 4. Cyber-Security: The Defense Mechanisms

What if a hacker takes over the Wind Generator (Node 2) and sends a massive, fake frequency drop reading? This is a **False Data Injection Attack (FDIA)**.

### Defense 1: PBFT Limitations
If Node 2 lies, PBFT handles it fine because 3 other nodes are honest. They still reach a 2/3 majority. But what if the attacker creates a **"Breakthrough Attack"** (Type II in the paper), spoofing identities and confusing the network so bad data actually gets packed into a block?

### Defense 2: The Self-Healing Trimmer (SC²)
This is the brilliant part of the research paper. The Smart Contract (the program that processes transactions *before* finalizing the block) has an immune system built into its math.

1. **Bias Detection:** When a node submits $\Delta f$, the contract checks if it exceeds a realistic physical threshold (e.g., $\pm 0.3$ Hz). 
2. **Trimmer Activation:** If the data crosses the threshold, it is flagged as an FDIA.
3. **Scaling Down:** The attacker might have injected a huge fake number (like +5.0 Hz) to mess up the average. The contract automatically calculates a scaling factor ($k_t$) based on the valid nodes, and shrinks the attacker's fake number down drastically.
4. **Result:** The final "Global Frequency" calculated and written permanently to the block remains stable, completely neutralizing the hacker's attempt without needing to unplug the hacked machine.

---

## Summary of Terms to Remember

*   **Node:** A participating generator/battery with a computer.
*   **Smart Contract:** The unchangeable code on the blockchain that does the math securely.
*   **PBFT:** The voting algorithm they use to agree on the data quickly (requires 2/3 agreement).
*   **Lead Node:** The node whose turn it is to pack the incoming data into a draft block.
*   **FDIA:** A cyber-attack where bad data is injected to crash the grid.
*   **Self-Healing Trimmer:** The math defense that squashes bad data automatically.
