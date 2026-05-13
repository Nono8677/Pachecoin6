// --- CONFIGURATION V12 "PROP DESK" ---
const CONFIG = {
    pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    fees: 0.001,
    maxGlobalExposure: 0.50, // Pas plus de 50% du capital exposé en même temps
    learningRate: 0.012,
    regimes: ["TREND", "CHOP", "SQUEEZE"]
};

let state = {
    weights: { /* Identiques à V11 */ },
    equity: 1000,
    activeTrades: {},
    regimeProbas: { TREND: 0.33, CHOP: 0.33, SQUEEZE: 0.33 } // Probabilités latentes
};

// --- 1. PROBABILISTIC REGIME BLENDING (Priorité 1 de l'audit) ---

function calculateRegimeProbas(adx, bbWidth) {
    // Softmax-like intuition pour transformer les indicateurs en probabilités
    // On évite le "Hard Switch"
    let pTrend = Math.min(1, adx / 50);
    let pSqueeze = Math.max(0, 1 - (bbWidth * 20));
    let pChop = 1 - Math.max(pTrend, pSqueeze);

    const total = pTrend + pSqueeze + pChop;
    return { 
        TREND: pTrend / total, 
        CHOP: pChop / total, 
        SQUEEZE: pSqueeze / total 
    };
}

// --- 2. PORTFOLIO RISK ENGINE (Priorité 3 de l'audit) ---

function getGlobalRiskSanity(newTradeSize) {
    const currentExposure = Object.values(state.activeTrades)
        .reduce((sum, t) => sum + (t.size * t.entryPrice), 0);
    
    const newExposure = currentExposure + newTradeSize;
    return (newExposure / state.equity) <= CONFIG.maxGlobalExposure;
}

// --- 3. MOTEUR D'INFÉRENCE PONDÉRÉ (Blending) ---

function getBlendedInference(features, probas) {
    // Chaque cerveau donne son avis, pondéré par sa probabilité de régime
    const iTrend = getInference(features, state.weights.TREND);
    const iChop = getInference(features, state.weights.CHOP);
    const iSqueeze = getInference(features, state.weights.SQUEEZE);

    return (iTrend * probas.TREND) + 
           (iChop * probas.CHOP) + 
           (iSqueeze * probas.SQUEEZE);
}

// --- CORE ENGINE V12 ---

async function runV12Agent() {
    for (const s of CONFIG.pairs) {
        const data = await getMarketData(s, "4h");
        const lastPrice = data.c[data.c.length - 1];

        // A. Update Probabilités de Régime (Flou vs Hard)
        const adx = calcADX(data.h, data.l, data.c);
        const bb = getBollingerMetrics(data.c);
        state.regimeProbas = calculateRegimeProbas(adx, bb.width);

        // B. Inférence Blended
        const features = extractFeatures(data, lastPrice);
        const blendedProb = getBlendedInference(features, state.regimeProbas);

        // C. Risk Check & Execution
        if (!state.activeTrades[s] && blendedProb > 0.72) {
            const plan = prepareTradeV12(s, lastPrice, blendedProb, data);
            
            // Validation GLOBALE (Portfolio level)
            if (plan.isValid && getGlobalRiskSanity(plan.size * lastPrice)) {
                executeTradeV12(s, plan, features, blendedProb, state.regimeProbas);
            }
        }
    }
}
