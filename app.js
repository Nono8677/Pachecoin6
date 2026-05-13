// --- CONFIGURATION & INITIALISATION ---
const SUPABASE_URL = "https://cbeucdnkixjhqzdazyxw.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M";
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const BINANCE_BASE = "https://api.binance.com/api/v3";

const CONFIG = {
    pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    adx: { period: 14, threshold: 20 },
    supertrend: { period: 10, multiplier: 3 },
    timeframes: [
        { label: "4H", value: "4h" },
        { label: "D", value: "1d" }
    ]
};

let state = { signals: {}, livePrices: {}, selectedTf: "4h" };

// --- FONCTIONS DE CALCUL (ADX & SUPERTREND) ---

function getATR(h, l, c, p) {
    const tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    const res = new Array(c.length).fill(0);
    let sum = 0;
    for (let i = 1; i <= p; i++) sum += tr[i];
    res[p] = sum / p;
    for (let i = p+1; i < c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calcADX(h, l, c) {
    const p = CONFIG.adx.period;
    let atr = getATR(h, l, c, p);
    let up = h.map((v, i) => i === 0 ? 0 : v - h[i-1]);
    let down = l.map((v, i) => i === 0 ? 0 : l[i-1] - v);
    let plusDM = up.map((v, i) => (v > down[i] && v > 0) ? v : 0);
    let minusDM = down.map((v, i) => (down[i] > v && down[i] > 0) ? down[i] : 0);
    let plusDI = 100 * (plusDM[c.length-2] / (atr[c.length-2] || 1));
    let minusDI = 100 * (minusDM[c.length-2] / (atr[c.length-2] || 1));
    return (100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001));
}

function calcSuperTrend(h, l, c) {
    const a = getATR(h, l, c, CONFIG.supertrend.period);
    const ub = new Array(c.length).fill(0);
    const lb = new Array(c.length).fill(0);
    const d = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        const mid = (h[i] + l[i]) / 2;
        ub[i] = mid + CONFIG.supertrend.multiplier * a[i];
        lb[i] = mid - CONFIG.supertrend.multiplier * a[i];
        d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < lb[i-1] ? 1 : d[i-1]);
    }
    const isBull = d[c.length-2] === -1;
    return { signal: isBull ? "bull" : "bear", price: isBull ? lb[c.length-2] : ub[c.length-2] };
}

// --- PRIX LIVE & COMPTE À REBOURS ---

async function fetchLivePrices() {
    try {
        const res = await fetch(`${BINANCE_BASE}/ticker/price`);
        const data = await res.json();
        CONFIG.pairs.forEach(pair => {
            const found = data.find(x => x.symbol === pair);
            if (found) {
                state.livePrices[pair] = parseFloat(found.price);
                const el = document.getElementById(`price-${pair}`);
                if (el) el.innerText = state.livePrices[pair].toLocaleString() + " $";
            }
        });
    } catch(e) { console.error("Erreur Prix:", e); }
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

// --- ANALYSE & RENDU ---

async function startAnalysis() {
    const statusEl = document.getElementById("last-update");
    if(statusEl) statusEl.innerText = "Analyse en cours...";

    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=100`);
            const raw = await r.json();
            const d = raw.slice(0, raw.length - 1);
            const k = {
                highs: d.map(x => parseFloat(x[2])),
                lows: d.map(x => parseFloat(x[3])),
                closes: d.map(x => parseFloat(x[4]))
            };

            const stData = calcSuperTrend(k.highs, k.lows, k.closes);
            const adxVal = calcADX(k.highs, k.lows, k.closes);

            state.signals[s] = {
                st: stData.signal,
                stPrice: stData.price,
                adxStrong: adxVal >= CONFIG.adx.threshold
            };
        } catch(e) { console.error(s, e); }
    }
    renderSignals();
    if(statusEl) statusEl.innerText = "MàJ : " + new Date().toLocaleTimeString();
}

function renderSignals() {
    const container = document.getElementById("signals-container");
    if(!container) return;
    container.innerHTML = CONFIG.pairs.map(s => {
        const sig = state.signals[s];
        if (!sig) return "";
        const isBuy = sig.st === "bull" && sig.adxStrong;

        return `
            <div class="crypto-card">
                <div class="card-info">
                    <span class="pair-name">${s}</span>
                    <span class="live-price" id="price-${s}">${state.livePrices[s] ? state.livePrices[s].toLocaleString() : "..."} $</span>
                </div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                ${isBuy ? `<div class="entry-price" style="color: #f6465d; font-weight: bold; margin-top: 5px;">PRIX D'ACHAT : ${sig.stPrice.toFixed(2)} $</div>` : ""}
            </div>`;
    }).join("");
}

// --- INTERFACE & NAVIGATION ---

window.showTab = (tab) => {
    document.getElementById('tab-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.innerText.toLowerCase().includes(tab)));
};

function initApp() {
    const tfSelect = document.getElementById("signal-tf-select");
    if (tfSelect) {
        tfSelect.innerHTML = CONFIG.timeframes.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
        tfSelect.value = state.selectedTf;
        tfSelect.addEventListener("change", (e) => {
            state.selectedTf = e.target.value;
            startAnalysis();
        });
    }

    document.getElementById("refresh-btn")?.addEventListener("click", startAnalysis);

    fetchLivePrices();
    setInterval(fetchLivePrices, 5000);
    startAnalysis();
    startCountdown();
}

// --- AUTHENTIFICATION ---

window.handleLogin = async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-pwd").value;
    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    if(error) alert("Erreur : " + error.message);
};

window.handleSignup = async () => {
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-pwd").value;
    const { error } = await sbClient.auth.signUp({ email, password });
    if(error) alert("Erreur : " + error.message);
    else alert("Vérifiez vos emails pour confirmer l'inscription !");
};

window.handleLogout = () => sbClient.auth.signOut();

sbClient.auth.onAuthStateChange((event, session) => {
    document.getElementById("auth-screen").style.display = session ? "none" : "flex";
    document.getElementById("main-app").style.display = session ? "block" : "none";
    if (session) initApp();
});
