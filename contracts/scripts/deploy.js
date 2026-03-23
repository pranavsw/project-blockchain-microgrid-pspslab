const hre = require("hardhat");

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deploying FrequencyConsensus to local Hardhat network");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const FrequencyConsensus = await hre.ethers.getContractFactory("FrequencyConsensus");
  const contract = await FrequencyConsensus.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ FrequencyConsensus deployed at: ${address}`);

  // Register 4 microgrid nodes
  console.log("\n📡 Registering 4 microgrid nodes...");
  for (let nodeId = 1; nodeId <= 4; nodeId++) {
    const tx = await contract.registerNode(nodeId);
    await tx.wait();
    console.log(`   Node ${nodeId} registered ✓`);
  }

  const nodeCount = await contract.getNodeCount();
  console.log(`\n🔋 Total registered nodes: ${nodeCount}`);
  console.log(`📋 Current round: ${await contract.getCurrentRound()}`);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deployment complete. Contract is ready for submissions.");
  console.log(`  CONTRACT_ADDRESS=${address}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
