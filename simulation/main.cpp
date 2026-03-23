/*
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║       Microgrid Frequency Simulation — Cyber-Physical Layer         ║
 * ║                                                                     ║
 * ║  Simulates 4 independent prosumer/generator nodes in an islanded    ║
 * ║  microgrid. Each node generates realistic frequency deviations      ║
 * ║  (Δf) based on load changes, computes the combined local frequency, ║
 * ║  and sends submissions to the FrequencyConsensus smart contract     ║
 * ║  via JSON-RPC over HTTP to a local Hardhat node.                    ║
 * ║                                                                     ║
 * ║  In real systems, frequency updates occur every ~50μs. For this     ║
 * ║  simulation demo, a 15-second delay loop represents block mining    ║
 * ║  time and variable communication delays in cyber-physical systems.  ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

#include <iostream>
#include <vector>
#include <cmath>
#include <random>
#include <chrono>
#include <thread>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>

// ─── Third-party headers ─────────────────────────────────────────────────────
#define CPPHTTPLIB_OPENSSL_SUPPORT 0
#include <httplib.h>
#include <nlohmann/json.hpp>

using namespace std;
using json = nlohmann::json;

// ════════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════════

const double NOMINAL_FREQ       = 50.0;        // Hz — Grid nominal
const int    NODE_COUNT          = 4;
const int    CONSENSUS_DELAY_SEC = 15;          // Simulated block mining delay (real: ~50μs)
const string RPC_HOST            = "127.0.0.1";
const int    RPC_PORT            = 8545;

// Hardhat account #0 (deterministic for local dev)
const string FROM_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// ════════════════════════════════════════════════════════════════════════
//  Node structure
// ════════════════════════════════════════════════════════════════════════

struct MicrogridNode {
    int    id;
    double baseLoad;          // kW — base consumption/generation
    double loadVariation;     // kW — magnitude of random load swing
    double inertiaConstant;   // H — simulated inertia for droop response
    double currentDeltaF;     // Hz — latest frequency deviation
};

// ════════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════════

/**
 * Encode a uint256 value into a 32-byte hex string (zero-padded, no 0x prefix).
 */
string encodeUint256(int64_t value) {
    stringstream ss;
    if (value < 0) {
        // Two's complement for negative signed int256
        // For small negatives, pad with 'f' characters
        uint64_t twosComp = static_cast<uint64_t>(value);
        ss << setfill('f') << setw(64) << hex << twosComp;
        string result = ss.str();
        // Ensure leading f's for negative values
        if (result.length() < 64) {
            result = string(64 - result.length(), 'f') + result;
        }
        return result.substr(result.length() - 64);
    }
    ss << setfill('0') << setw(64) << hex << value;
    return ss.str();
}

/**
 * Build the ABI-encoded calldata for submitFrequency(uint256,int256).
 * Function selector: keccak256("submitFrequency(uint256,int256)") first 4 bytes.
 * Pre-computed: 0x8c0a0719
 */
string buildCalldata(int nodeId, int64_t deltaFMilliHz) {
    // Function selector for submitFrequency(uint256,int256)
    string selector = "8c0a0719";

    string encodedNodeId = encodeUint256(static_cast<int64_t>(nodeId));
    string encodedDeltaF = encodeUint256(deltaFMilliHz);

    return "0x" + selector + encodedNodeId + encodedDeltaF;
}

/**
 * Generate frequency deviation for a node based on a sinusoidal load pattern
 * plus random noise (simulating real-world prosumer behaviour).
 */
double generateFrequencyDeviation(MicrogridNode& node, mt19937& rng, double timeStep) {
    // Sinusoidal load variation (simulates daily demand cycle, sped up)
    double loadChange = node.loadVariation * sin(timeStep * 0.1 * node.id);

    // Random perturbation (e.g., solar intermittency, sudden load switch)
    normal_distribution<double> noiseDist(0.0, node.loadVariation * 0.3);
    double noise = noiseDist(rng);

    // Total power imbalance
    double powerImbalance = loadChange + noise;

    // Frequency deviation via simplified swing equation:
    //   Δf = ΔP / (2 * H * f_nominal)
    double deltaF = powerImbalance / (2.0 * node.inertiaConstant * NOMINAL_FREQ);

    // Clamp to realistic range (±0.5 Hz)
    deltaF = max(-0.5, min(0.5, deltaF));

    node.currentDeltaF = deltaF;
    return deltaF;
}

// ════════════════════════════════════════════════════════════════════════
//  Print helpers
// ════════════════════════════════════════════════════════════════════════

void printSeparator() {
    cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" << endl;
}

void printHeader(int round) {
    cout << endl;
    printSeparator();
    cout << "  ⚡ MICROGRID FREQUENCY SIMULATION — Round " << round << endl;
    printSeparator();
}

// ════════════════════════════════════════════════════════════════════════
//  Main simulation loop
// ════════════════════════════════════════════════════════════════════════

int main(int argc, char* argv[]) {
    // ── Configurable contract address ──────────────────────────
    string contractAddress;
    if (argc > 1) {
        contractAddress = argv[1];
    } else {
        cout << "⚠  Usage: microgrid_sim <CONTRACT_ADDRESS>" << endl;
        cout << "   Example: microgrid_sim 0x5FbDB2315678afecb367f032d93F642f64180aa3" << endl;
        cout << "   Deploy the contract first with:" << endl;
        cout << "   cd ../contracts && npx hardhat node  (terminal 1)" << endl;
        cout << "   cd ../contracts && npx hardhat run scripts/deploy.js --network localhost  (terminal 2)" << endl;
        return 1;
    }

    // ── Initialize nodes ───────────────────────────────────────
    vector<MicrogridNode> nodes = {
        {1, 100.0, 15.0, 5.0, 0.0},   // Solar prosumer
        {2, 200.0, 25.0, 8.0, 0.0},   // Wind generator
        {3, 150.0, 10.0, 6.0, 0.0},   // Battery storage
        {4,  80.0, 20.0, 4.0, 0.0},   // Diesel backup
    };

    // Random number generator
    random_device rd;
    mt19937 rng(rd());

    int totalRounds = 5;  // Number of consensus rounds to simulate

    cout << endl;
    cout << "╔═══════════════════════════════════════════════════════════╗" << endl;
    cout << "║     DECENTRALIZED MICROGRID FREQUENCY CONTROL DEMO       ║" << endl;
    cout << "║     Delay-Tolerant Cyber-Physical Consensus Protocol     ║" << endl;
    cout << "╠═══════════════════════════════════════════════════════════╣" << endl;
    cout << "║  Nodes:    4 (Solar, Wind, Battery, Diesel)              ║" << endl;
    cout << "║  Nominal:  50.000 Hz                                     ║" << endl;
    cout << "║  Delay:    " << CONSENSUS_DELAY_SEC << "s (simulated mining + network latency)     ║" << endl;
    cout << "║  Rounds:   " << totalRounds << "                                              ║" << endl;
    cout << "║  Contract: " << contractAddress.substr(0, 10) << "..."
         << contractAddress.substr(contractAddress.length() - 6) << "                    ║" << endl;
    cout << "╚═══════════════════════════════════════════════════════════╝" << endl;

    // ── Create HTTP client ─────────────────────────────────────
    httplib::Client cli(RPC_HOST, RPC_PORT);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);

    for (int round = 1; round <= totalRounds; round++) {
        printHeader(round);
        double timeStep = static_cast<double>(round);

        // ── Phase 1: Generate frequency deviations ─────────────
        cout << "\n  📊 Generating frequency deviations...\n" << endl;

        double sumDeltaF = 0.0;
        vector<pair<int, double>> deviations;

        for (auto& node : nodes) {
            double deltaF = generateFrequencyDeviation(node, rng, timeStep);
            sumDeltaF += deltaF;
            deviations.push_back({node.id, deltaF});

            double localFreq = NOMINAL_FREQ + deltaF;
            cout << "     Node " << node.id << "  │  Δf = "
                 << showpos << fixed << setprecision(4) << deltaF << " Hz"
                 << "  │  f_local = " << noshowpos << localFreq << " Hz" << endl;
        }

        // Combined local frequency
        double avgDeltaF    = sumDeltaF / NODE_COUNT;
        double combinedFreq = NOMINAL_FREQ + avgDeltaF;

        cout << "\n     ────────────────────────────────────────────" << endl;
        cout << "     Combined f = 50 + Σ(Δf)/N = "
             << fixed << setprecision(4) << combinedFreq << " Hz" << endl;
        cout << "     Avg Δf     = " << showpos << avgDeltaF << " Hz" << noshowpos << endl;

        // ── Phase 2: 50-second consensus delay ─────────────────
        cout << "\n  ⏳ Simulating block mining & network delay (" 
             << CONSENSUS_DELAY_SEC << "s)..." << endl;

        for (int sec = CONSENSUS_DELAY_SEC; sec > 0; sec--) {
            cout << "\r     ⏱  " << setw(2) << sec << "s remaining...  "
                 << string(CONSENSUS_DELAY_SEC - sec, '█')
                 << string(sec, '░') << "  " << flush;
            this_thread::sleep_for(chrono::seconds(1));
        }
        cout << "\r     ✅ Delay complete — transmitting to blockchain...              " << endl;

        // ── Phase 3: Send JSON-RPC transactions ────────────────
        cout << "\n  🔗 Submitting to FrequencyConsensus contract...\n" << endl;

        bool allSuccess = true;

        for (auto& [nodeId, deltaF] : deviations) {
            // Convert deltaF to milli-Hz (int64_t) for the contract
            int64_t deltaFMilliHz = static_cast<int64_t>(llround(deltaF * 1000.0));

            // Build ABI-encoded calldata
            string calldata = buildCalldata(nodeId, deltaFMilliHz);

            // JSON-RPC eth_sendTransaction
            json rpcPayload = {
                {"jsonrpc", "2.0"},
                {"method",  "eth_sendTransaction"},
                {"id",      round * 10 + nodeId},
                {"params",  json::array({
                    {
                        {"from", FROM_ADDRESS},
                        {"to",   contractAddress},
                        {"data", calldata},
                        {"gas",  "0x1e8480"}  // 2,000,000 gas
                    }
                })}
            };

            string body = rpcPayload.dump();

            auto res = cli.Post("/", body, "application/json");

            if (res && res->status == 200) {
                json response = json::parse(res->body);
                if (response.contains("result")) {
                    string txHash = response["result"].get<string>();
                    cout << "     Node " << nodeId << "  │  ✅ tx: "
                         << txHash.substr(0, 18) << "..." << endl;
                } else if (response.contains("error")) {
                    string errMsg = response["error"]["message"].get<string>();
                    cout << "     Node " << nodeId << "  │  ❌ Error: " << errMsg << endl;
                    allSuccess = false;
                }
            } else {
                cout << "     Node " << nodeId
                     << "  │  ❌ HTTP error (is Hardhat node running?)" << endl;
                allSuccess = false;
            }
        }

        if (allSuccess) {
            cout << "\n  🎯 All 4 nodes submitted — SCPM consensus triggered on-chain!" << endl;
        } else {
            cout << "\n  ⚠  Some submissions failed. Check Hardhat node." << endl;
        }

        printSeparator();

        // Brief pause between rounds
        if (round < totalRounds) {
            cout << "\n  Waiting 5s before next round...\n" << endl;
            this_thread::sleep_for(chrono::seconds(5));
        }
    }

    cout << endl;
    cout << "╔═══════════════════════════════════════════════════════════╗" << endl;
    cout << "║              SIMULATION COMPLETE                         ║" << endl;
    cout << "║  All " << totalRounds << " consensus rounds processed.                    ║" << endl;
    cout << "╚═══════════════════════════════════════════════════════════╝" << endl;
    cout << endl;

    return 0;
}
