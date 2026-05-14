// --- CONFIGURATION V12 ---
const SUPABASE_URL = "https://cbeucdnkixjhqzdazyxw.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // Remets ta clé ici
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const BINANCE_BASE = "https://api.binance.com/api/v3";

const CONFIG = {
    pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    fees: 0.001, slippage: 0.0005,
    maxGlobalExposure: 0.6, equity: 1000,
    adx: { p: 14, t: 20 },
    st: { p: 10, m: 3 }
};

let state = {
    signals: {}, livePrices: {}, selectedTf: "4h",
    weights: {
        TREND:   { w_s: 1.8, w_m: 1.2, w_f: 0.8, bias: -2.0 },
        CHOP:    { w_s: 0.4, w_m: 0.9, w_f: 1.6, bias: -1.2 },
        SQUEEZE: { w_s: 1.0, w_m: 1.1, w_f: 2.2, bias: -2.5 }
    }
};

// --- MOTEUR TECHNIQUE (ATR, ADX, ST, BB) ---
const getATR = (h, l, c, p) => {
    let tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for (let i = 1; i <= p; i++) sum += tr[i];
    res[p] = sum / p;
    for (let i = p+1; i < c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
};

const calcADX = (h, l, c) => {
    let p = CONFIG.adx.p, atr = getATR(h, l, c, p);
    let up = h.map((v, i) => i === 0 ? 0 : v - h[i-1]), dw = l.map((v, i) => i === 0 ? 0 : l[i-1] - v);
    let pDM = up.map((v, i) => (v > dw[i] && v > 0) ? v : 0), mDM = dw.map((v, i) => (dw[i] > v && dw[i] > 0) ? dw[i] : 0);
    let pDI = 100 * (pDM[c.length-2] / (atr[c.length-2] || 1)), mDI = 100 * (mDM[c.length-2] / (atr[c.length-2] || 1));
    return (100 * Math.abs(pDI - mDI) / (pDI + mDI + 0.001));
};

const calcST = (h, l, c) => {
    let p = CONFIG.st.p, m = CONFIG.st.m, atr = getATR(h, l, c, p);
    let ub = 0, lb = 0, dir = 1;
    for (let i = p; i < c.length; i++) {
        let hl2 = (h[i] + l[i]) / 2, bUb = hl2 + m * atr[i], bLb = hl2 - m * atr[i];
        ub = (bUb < ub || c[i-1] > ub) ? bUb : ub;
        lb = (bLb > lb || c[i-1] < lb) ? bLb : lb;
        dir = (c[i] > ub) ? -1 : (c[i] < lb ? 1 : dir);
    }
    return { isBull: dir === -1 };
};

const getBBW = (c) => {
    let p = 20, slice = c.slice(-p);
    let avg = slice.reduce((a, b) => a + b) / p;
    let std = Math.sqrt(slice.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / p);
    return (4 * std) / avg;
};

// --- LOGIQUE QUANT V12 ---
const getProbas = (adx, bbW) => {
    let pT = Math.min(1, adx / 50), pS = Math.max(0, 1 - (bbW * 25));
    let pC = 1 - Math.max(pT, pS), tot = pT + pS + pC;
    return { TREND: pT/tot, CHOP: pC/tot, SQUEEZE: pS/tot };
};

const infer = (f, p) => {
    const sig = (w) => 1 / (1 + Math.exp(-(w.w_s * f.s + w.w_m * f.m + w.w_f * f.f + w.bias)));
    return (sig(state.weights.TREND) * p.TREND) + (sig(state.weights.CHOP) * p.CHOP) + (sig(state.weights.SQUEEZE) * p.SQUEEZE);
};

// --- EXECUTION ---
async function startAnalysis() {
    document.getElementById("last-update").innerText = "Calcul V12...";
    let currentExp = 0;

    for (const s of CONFIG.pairs) {
        try {
            const res = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=100`);
            const raw = await res.json();
            const d = raw.slice(0, -1);
            const k = { h: d.map(x=>+x[2]), l: d.map(x=>+x[3]), c: d.map(x=>+x[4]) };

            const adx = calcADX(k.h, k.l, k.c), bbw = getBBW(k.c), st = calcST(k.h, k.l, k.c);
            const probas = getProbas(adx, bbw);
            const feat = { s: st.isBull?1:0, m: adx/100, f: k.c.slice(-1)[0] > k.c.slice(-2)[0]?1:0 };
            const prob = infer(feat, probas);

            const isSafe = (currentExp / CONFIG.equity) < CONFIG.maxGlobalExposure;
            state.signals[s] = {
                prob, isBuy: prob > 0.72 && isSafe,
                regime: Object.keys(probas).reduce((a, b) => probas[a] > probas[b] ? a : b),
                entry: k.c.slice(-1)[0] * (1 + CONFIG.slippage),
                reason: isSafe ? "" : "RISQUE MAX"
            };
        } catch(e) { console.error(s, e); }
    }
    renderUI();
}

function renderUI() {
    const cont = document.getElementById("signals-container");
    cont.innerHTML = CONFIG.pairs.map(s => {
        const sig = state.signals[s]; if(!sig) return "";
        return `
        <div class="crypto-card">
            <div style="display:flex;justify:space-between"><b>${s}</b> <span>${sig.regime}</span></div>
            <div class="verdict ${sig.isBuy?'buy':'out'}">${sig.isBuy?'ACHAT':'ATTENTE'}</div>
            <div style="background:#eee;height:4px;margin:8px 0"><div style="background:#2ebd85;height:100%;width:${sig.prob*100}%"></div></div>
            <small>${(sig.prob*100).toFixed(1)}% | ${sig.isBuy?sig.entry.toFixed(2):sig.reason}</small>
        </div>`;
    }).join("");
    document.getElementById("last-update").innerText = "MàJ: " + new Date().toLocaleTimeString();
}
