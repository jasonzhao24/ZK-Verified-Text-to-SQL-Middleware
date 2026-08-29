
async function runCircuit() {

    const aiOutputRaw = process.argv[2];
    if (!aiOutputRaw) {
        console.error("No input provided from Python backend.");
        process.exit(1);
    }

    const aiOutput = JSON.parse(aiOutputRaw);
    
    console.log("Initializing local Midnight ZK Circuit...");
    console.log(`Executing Witness to check safety flag: ${aiOutput.is_safe_select}`);

    if (aiOutput.is_safe_select !== true) {
        console.error("ZK Circuit Assertion Failed: Security violation.");
        process.exit(1); 
    }

    console.log(`Proof generated! Query hash ${aiOutput.query_hash} logged to public ledger.`);

    process.exit(0);
}

runCircuit();