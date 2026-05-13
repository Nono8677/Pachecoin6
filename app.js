// --- CONFIGURATION ---
const SUPABASE_URL = "https://cbeucdnkixjhqzdazyxw.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M";
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const BINANCE_BASE = "https://api.binance.com/api/v3";

const CONFIG = {
    pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    adx: { threshold: 20 },
    supertrend: { period: 10, multiplier: 3 },
    timeframes: [{ label: "4H", value: "4h" }, { label: "D", value: "1d" }]
};

let state = { signals: {}, livePrices: {}, selectedTf: "4h" };

// --- 1. PRIX ET COMPTE À REBOURS ---

async function fetchLivePrices() {
    try {
        const res = await fetch(BINANCE_BASE + "/ticker/price");
        const data = await res.json();
        CONFIG.pairs.forEach(pair => {
            const found = data.find(x => x.symbol === pair);
            if (found) state.livePrices[pair] = parseFloat(found.price);
        });
        updatePriceDisplays();
    } catch(e) { console.error("Erreur Prix:", e); }
}

function updatePriceDisplays() {
    CONFIG.pairs.forEach(pair => {
        const el = document.getElementById(`price-${pair}`);
        if (el && state.livePrices[pair]) {
            el.innerText = state.livePrices[pair].toLocaleString() + " $";
        }
    });
}

function startCountdown() {
    setInterval(() => {
        const now = new Date();
        const unit = state.selectedTf === "4h" ? 4 * 3600000 : 24 * 3600000;
        const ms = unit - (now % unit);
        const h = Math.floor(ms / 3600000).toString().padStart(2, "0");
        const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, "0");
        const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
        const el = document.getElementById("countdown");
        if (el) el.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// --- 2. ANALYSE ET SELECTION ---

async function startAnalysis() {
    const loader = document.getElementById("last-update");
    if(loader) loader.innerText = "Analyse en cours...";

    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=100`);
            const d = await r.json();
            // Logique simplifiée pour l'exemple, garde tes fonctions de calcul précédentes ici
            state.signals[s] = { st: "bull", stPrice: parseFloat(d[d.length-2][4]), adxStrong: true };
        } catch(e) { console.error(s, e); }
    }
    renderSignals();
    if(loader) loader.innerText = "MàJ : " + new Date().toLocaleTimeString();
}

function renderSignals() {
    const container = document.getElementById("signals-container");
    container.innerHTML = CONFIG.pairs.map(s => {
        const sig = state.signals[s];
        const isBuy = sig && sig.st === "bull" && sig.adxStrong;
        return `
            <div class="crypto-card">
                <div class="card-info">
                    <span class="pair-name">${s}</span>
                    <span class="live-price" id="price-${s}">${state.livePrices[s] || "..."} $</span>
                </div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                ${isBuy ? `<div class="entry-price" style="color:#f6465d">PRIX D'ACHAT : ${sig.stPrice.toFixed(2)} $</div>` : ""}
            </div>`;
    }).join("");
}

// --- 3. INITIALISATION IPHONE ---

function initApp() {
    // Remplir le sélecteur
    const sel = document.getElementById("signal-tf-select");
    if (sel) {
        sel.innerHTML = CONFIG.timeframes.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
        sel.value = state.selectedTf;
        sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
    }

    fetchLivePrices();
    setInterval(fetchLivePrices, 5000);
    startAnalysis();
    startCountdown();
}

sbClient.auth.onAuthStateChange((event, session) => {
    if (session) {
        document.getElementById("auth-screen").style.display = "none";
        document.getElementById("main-app").style.display = "block";
        initApp();
    }
});
