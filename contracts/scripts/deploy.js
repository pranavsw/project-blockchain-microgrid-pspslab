// scripts/deploy.js — Deploy FrequencyConsensus and register 4 DG nodes
// with neighbor topology (ring graph) and droop parameters

const hre = require("hardhat");

async function main() {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deploying FrequencyConsensus (Dai et al., 2024)");
  console.log("  PBFT + FDIA Detection + Self-Healing Trimmer");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const FrequencyConsensus = await hre.ethers.getContractFactory("FrequencyConsensus");
  const contract = await FrequencyConsensus.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ FrequencyConsensus deployed at: ${address}`);

  // ── Register 4 DG nodes with ring topology ──
  // Ring graph: 1↔2↔3↔4↔1  (each node has 2 neighbors)
  //
  //      Node 1 (Solar)
  //     /              \
  //  Node 4 (Diesel)  Node 2 (Wind)
  //     \              /
  //      Node 3 (Battery)
  //
  // Droop coefficients (k_p × 1000): higher = more frequency droop per kW
  // Pinning gain (g_i × 1000): >0 means node has reference to f*

  console.log("\n📡 Registering 4 DG nodes with ring topology...\n");

  const nodes = [
    { id: 1, name: "Solar Prosumer",  neighbors: [2, 4], kp: 2,  gi: 500 },
    { id: 2, name: "Wind Generator",  neighbors: [1, 3], kp: 1,  gi: 300 },
    { id: 3, name: "Battery Storage", neighbors: [2, 4], kp: 1,  gi: 400 },
    { id: 4, name: "Diesel Backup",   neighbors: [3, 1], kp: 2,  gi: 500 },
  ];

  for (const node of nodes) {
    const tx = await contract.registerNode(node.id, node.neighbors, node.kp, node.gi);
    await tx.wait();
    console.log(`   Node ${node.id} (${node.name})`);
    console.log(`     Neighbors: [${node.neighbors}]  kp: ${node.kp/1000}  g_i: ${node.gi/1000}`);
  }

  const nodeCount = await contract.getNodeCount();
  const currentRound = await contract.getCurrentRound();

  console.log(`\n🔋 Total registered nodes: ${nodeCount}`);
  console.log(`📋 Current round: ${currentRound}`);
  console.log(`🛡️  FDIA threshold: ±0.3 Hz`);
  console.log(`🔗 PBFT consensus: 2/3 supermajority`);

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deployment complete. Contract ready for submissions.");
  console.log(`  CONTRACT_ADDRESS=${address}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
