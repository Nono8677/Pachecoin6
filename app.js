// --- CONFIGURATION & CLIENTS ---
const SUPABASE_URL = "https://cbeucdnkixjhqzdazyxw.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // Garde tes clés
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const BINANCE_BASE = "https://api.binance.com/api/v3";

const CONFIG = {
    pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    fees: 0.001,           // 0.1% commissions
    slippage: 0.0005,      // 0.05% slippage
    maxGlobalExposure: 0.6, // 60% du capital max investi
    riskPerTrade: 0.02,    // 2% de risque par position
    adx: { period: 14 },
    supertrend: { period: 10, multiplier: 3 }
};

let state = {
    signals: {},
    livePrices: {},
    selectedTf: "4h",
    equity: 1000, // Capital fictif de départ pour le calcul du risque
    // POIDS V12 - Calibrés par régime
    weights: {
        TREND:   { w_s: 1.8, w_m: 1.2, w_f: 0.8, bias: -2.0 },
        CHOP:    { w_s: 0.4, w_m: 0.9, w_f: 1.6, bias: -1.2 },
        SQUEEZE: { w_s: 1.0, w_m: 1.1, w_f: 2.2, bias: -2.5 }
    }
};

// --- MOTEUR QUANT V12 ---

function getRegimeProbas(adx, bbWidth) {
    let pTrend = Math.min(1, adx / 50);
    let pSqueeze = Math.max(0, 1 - (bbWidth * 25));
    let pChop = 1 - Math.max(pTrend, pSqueeze);
    const total = pTrend + pSqueeze + pChop;
    return { TREND: pTrend/total, CHOP: pChop/total, SQUEEZE: pSqueeze/total };
}

function getBlendedInference(features, probas) {
    const calc = (w) => 1 / (1 + Math.exp(-(w.w_s * features.s + w.w_m * features.m + w.w_f * features.f + w.bias)));
    return (calc(state.weights.TREND) * probas.TREND) +
           (calc(state.weights.CHOP) * probas.CHOP) +
           (calc(state.weights.SQUEEZE) * probas.SQUEEZE);
}

// --- ANALYSE & DÉCISION ---

async function startAnalysis() {
    const statusEl = document.getElementById("last-update");
    if(statusEl) statusEl.innerText = "Calcul Quant V12...";

    let currentExposure = 0; // Simulation d'exposition pour le risk-check

    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=100`);
            const raw = await r.json();
            const d = raw.slice(0, raw.length - 1);
            
            const k = {
                h: d.map(x => parseFloat(x[2])),
                l: d.map(x => parseFloat(x[3])),
                c: d.map(x => parseFloat(x[4])),
                v: d.map(x => parseFloat(x[5]))
            };

            // 1. Détection du contexte
            const adxVal = calcADX(k.h, k.l, k.c);
            const bb = getBollingerWidth(k.c);
            const probas = getRegimeProbas(adxVal, bb);
            
            // 2. Inférence (Le cerveau V12)
            const st = calcSuperTrend(k.h, k.l, k.c);
            const features = { 
                s: st.isBull ? 1 : 0, 
                m: adxVal / 100, 
                f: k.c[k.c.length-1] > k.c[k.c.length-2] ? 1 : 0 
            };
            const finalProb = getBlendedInference(features, probas);

            // 3. Risk Management & Friction
            const entryWithFriction = lastPrice(k.c) * (1 + CONFIG.slippage);
            const isPortfolioSafe = (currentExposure / state.equity) < CONFIG.maxGlobalExposure;

            state.signals[s] = {
                prob: finalProb,
                regime: Object.keys(probas).reduce((a, b) => probas[a] > probas[b] ? a : b),
                isBuy: finalProb > 0.72 && isPortfolioSafe,
                entry: entryWithFriction,
                reason: isPortfolioSafe ? "" : "RISQUE MAX ATTEINT"
            };

        } catch(e) { console.error(s, e); }
    }
    renderSignals();
    if(statusEl) statusEl.innerText = "V12 Active : " + new Date().toLocaleTimeString();
}

// --- RENDU UI AMÉLIORÉ ---

function renderSignals() {
    const container = document.getElementById("signals-container");
    if(!container) return;
    
    container.innerHTML = CONFIG.pairs.map(s => {
        const sig = state.signals[s];
        if (!sig) return "";
        
        return `
            <div class="crypto-card">
                <div class="card-info">
                    <span class="pair-name">${s}</span>
                    <span class="regime-tag">${sig.regime}</span>
                </div>
                <div class="verdict ${sig.isBuy ? 'buy' : 'out'}">
                    ${sig.isBuy ? "BUY SIGNAL" : "WAIT / NEUTRAL"}
                </div>
                <div class="prob-bar-container">
                    <div class="prob-bar" style="width: ${sig.prob * 100}%"></div>
                </div>
                <div class="details">
                    Probabilité: ${(sig.prob * 100).toFixed(1)}% <br>
                    ${sig.isBuy ? `Entrée (Friction incl.): <b>${sig.entry.toFixed(2)}</b>` : `<small>${sig.reason}</small>`}
                </div>
            </div>`;
    }).join("");
}

// --- RESTE DES FONCTIONS (ADX, Supertrend, etc.) ---
// Utilise tes fonctions existantes pour le calcul technique pur.
