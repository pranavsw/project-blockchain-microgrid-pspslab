import sys
import json
import random
import math
import argparse
import warnings
warnings.simplefilter("ignore")
try:
    import opendssdirect as dss
except ImportError:
    print(json.dumps({"error": "OpenDSSDirect.py not installed. Please run: pip install OpenDSSDirect.py"}))
    sys.exit(1)

def gaussian_random(mean=0, std_dev=1):
    u1 = random.random()
    u2 = random.random()
    z = math.sqrt(-2.0 * math.log(u1 + 1e-9)) * math.cos(2.0 * math.pi * u2)
    return mean + z * std_dev

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--step', type=float, default=1.0, help='Simulation time step')
    args = parser.parse_args()

    # Load the circuit
    dss.run_command('Compile (microgrid.dss)')

    # Apply some time-based variation to the loads to simulate grid changes
    time_step = args.step
    load_names = dss.Loads.AllNames()
    
    total_load_kw = 0
    
    for i, lname in enumerate(load_names):
        dss.Loads.Name(lname)
        kw = dss.Loads.kW()
        # Vary load using a sine wave + noise
        variation = 15 * math.sin(time_step * 0.1 * (i + 1)) + gaussian_random(0, 5)
        new_kw = max(0, kw + variation)
        dss.Loads.kW(new_kw)
        total_load_kw += new_kw

    # Solve the power flow
    dss.Solution.Solve()

    if not dss.Solution.Converged():
        print(json.dumps({"error": "OpenDSS solution did not converge"}))
        sys.exit(1)

    # Calculate Droop based on the real active power dispatched by generators
    # OpenDSS gives us static power. Frequency in a microgrid drops as load increases.
    # We will simulate the frequency based on total load mismatch and individual droop constants.
    
    nominal_freq = 50.0
    
    dgs = [
        {"id": 1, "name": "DG1", "kp": 0.002, "inertia": 5.0},
        {"id": 2, "name": "DG2", "kp": 0.001, "inertia": 8.0},
        {"id": 3, "name": "DG3", "kp": 0.001, "inertia": 6.0},
        {"id": 4, "name": "DG4", "kp": 0.002, "inertia": 4.0},
    ]

    results = []
    
    for dg in dgs:
        dss.Generators.Name(dg["name"])
        # OpenDSS powers are typically negative for generation depending on exact element conventions.
        # We read the kW dispatched
        active_power = dss.Generators.kW() 
        
        # Add primary droop f = f* - kp * P
        droop_deviation = -dg["kp"] * active_power
        swing_noise = gaussian_random(0, 0.01)
        
        freq = nominal_freq + droop_deviation + swing_noise
        freq = max(49.0, min(51.0, freq))
        
        results.append({
            "nodeId": dg["id"],
            "frequency": freq,
            "activePower": active_power
        })

    # Output JSON string for Node.js
    print(json.dumps({"nodes": results, "total_load": total_load_kw}))

if __name__ == "__main__":
    main()
