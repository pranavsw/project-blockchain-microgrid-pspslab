# Run Script for Blockchain Microgrid with OpenDSS
# Start from the root folder

Write-Host "========================================================"
Write-Host "   Starting Blockchain Microgrid OpenDSS Simulation"
Write-Host "========================================================"

# Check and install python dependencies if needed
Write-Host "Checking python dependencies..."
try {
    python -c "import opendssdirect" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installing OpenDSSDirect python library..."
        pip install OpenDSSDirect.py
    }
} catch {
    Write-Host "Python not found or pip failed. Please make sure python is installed."
}

# Install Node dependencies if node_modules is missing
Write-Host "Checking Node dependencies..."
if (-not (Test-Path "contracts\node_modules")) { Write-Host "Installing contracts dependencies..."; cd contracts; npm install; cd .. }
if (-not (Test-Path "frontend\node_modules")) { Write-Host "Installing frontend dependencies..."; cd frontend; npm install; cd .. }
if (-not (Test-Path "simulation\node_modules")) { Write-Host "Installing simulation dependencies..."; cd simulation; npm install; cd .. }

# Start Hardhat node in a new PowerShell window
Write-Host "============================"
Write-Host "Starting Hardhat Local Node"
Write-Host "============================"
Start-Process powershell -ArgumentList "-NoExit -Command `"cd contracts; npx hardhat node`""

Write-Host "Waiting for Hardhat node to initialize (5 seconds)..."
Start-Sleep -Seconds 5

# Deploy smart contracts
Write-Host "============================"
Write-Host "Deploying Smart Contract"
Write-Host "============================"
cd contracts
$deployOut = npx hardhat run scripts/deploy.js --network localhost
$contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3" # Default Hardhat address

foreach ($line in $deployOut -split "`r`n|`n") {
    if ($line -match "CONTRACT_ADDRESS=(0x[\da-fA-F]{40})") {
        $contractAddress = $matches[1]
    }
}
Write-Host "Contract Deployed at: $contractAddress"
cd ..

# Start Frontend in a new PowerShell window
Write-Host "============================"
Write-Host "Starting Frontend"
Write-Host "============================"
Start-Process powershell -ArgumentList "-NoExit -Command `"cd frontend; npm run dev`""

# Start Simulation in current window
Write-Host "============================"
Write-Host "Starting OpenDSS Simulation"
Write-Host "============================"
cd simulation
Write-Host "Running: node simulate.js $contractAddress"
node simulate.js $contractAddress
cd ..

Write-Host "Simulation closed."
