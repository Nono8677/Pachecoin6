// CONFIGURATION SUPABASE
const SUPABASE_URL = 'https://ikcxcotbyrztngawbwro.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3hjb3RieXJ6dG5nYXdid3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzU3MDQsImV4cCI6MjA5Mzc1MTcwNH0.pUV8iAY7nUI1mGtv_DO-36fMLPOKfMM6oVydgowtdgM';

let sbClient;

// Initialisation sécurisée
try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
    console.error("Erreur d'initialisation Supabase:", e);
}

// CONFIGURATION ANALYSE
const BINANCE_BASE = 'https://api.binance.com/api/v3'; // CORRIGÉ : HTTPS obligatoire pour Vercel

const portfolio = {
    state: (function() {
        try {
            return JSON.parse(localStorage.getItem('pache_portfolio')) || { assets: {}, history: [] };
        } catch(e) { return { assets: {}, history: [] }; }
    })(),
    save: function() {
        try {
            localStorage.setItem('pache_portfolio', JSON.stringify(this.state));
        } catch(e) { console.warn('localStorage save failed:', e); }
    },
    update: function(asset, tf, candles, signal) {
        const id = asset + '_' + tf;
        if (!this.state.assets[id]) {
            this.state.assets[id] = { capital: 1000, position: null, lastSeen: 0 };
        }
        const data = this.state.assets[id];
        const newCandles = candles.filter(c => c.time > data.lastSeen);
        newCandles.forEach(candle => {
            if (data.position) {
                const perf = (candle.close - data.position.entryPrice) / data.position.entryPrice;
                if (signal === 'SELL' || perf < -0.50) {
                    data.capital *= (1 + perf);
                    data.position = null;
                }
            } else if (signal === 'BUY') {
                data.position = { entryPrice: candle.close };
            }
            data.lastSeen = candle.time;
        });
        this.save();
    },
    getDisplayData: function(asset, tf) {
        return this.state.assets[asset + '_' + tf] || { capital: 1000, position: null };
    }
};

// AUTHENTIFICATION
window.showTab = function(tab) {
    document.getElementById('tab-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
    document.querySelectorAll('.auth-tab').forEach((b, i) => {
        b.classList.toggle('active', (i === 0) === (tab === 'login'));
    });
    setAuthMsg('');
};

function setAuthMsg(msg, isError = true) {
    const el = document.getElementById('auth-message');
    if (el) { 
        el.innerText = msg; 
        el.style.color = isError ? '#f6465d' : '#0ecb81'; 
    }
}

window.handleLogin = async function() {
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-pwd').value;
    if (!email || !pwd) return setAuthMsg('Remplis tous les champs.');
    
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
    if (error) {
        console.error("Login Error:", error);
        setAuthMsg(error.message);
    }
};

window.handleSignup = async function() {
    const email = document.getElementById('signup-email').value.trim();
    const pwd = document.getElementById('signup-pwd').value;
    if (!email || !pwd) return setAuthMsg('Remplis tous les champs.');
    if (pwd.length < 6) return setAuthMsg('Mot de passe trop court.');
    
    const { data, error } = await sbClient.auth.signUp({ email, password: pwd });
    if (error) {
        console.error("Signup Error:", error);
        setAuthMsg(error.message);
    } else {
        setAuthMsg('Compte créé ! Vérifie tes emails ou connecte-toi.', false);
    }
};

window.handleLogout = async function() { await sbClient.auth.signOut(); };

sbClient.auth.onAuthStateChange((event, session) => {
    if (session) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        initApp();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    }
});

// LOGIQUE ANALYSE (Gardée identique mais URL Binance sécurisée)
const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    nocheco: { length: 10, rr: 2.0 },
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' }
    ]
};

let state = { signals: {}, livePrices: {}, selectedTf: '1d', currentPair: 'BTCUSDT' };

// ... Fonctions mathématiques (getATR, calcUTBot, etc.) restent identiques ...
// (Elles sont correctes dans ton code initial)

async function fetchLivePrices() {
    try {
        const res = await fetch(BINANCE_BASE + '/ticker/price');
        const data = await res.json();
        CONFIG.pairs.forEach(pair => {
            const found = data.find(x => x.symbol === pair);
            if (found) state.livePrices[pair] = parseFloat(found.price);
        });
        updatePriceDisplays();
    } catch(e) { console.error('Price fetch error:', e); }
}

function updatePriceDisplays() {
    CONFIG.pairs.forEach(pair => {
        const el = document.getElementById('price-' + pair);
        if (el && state.livePrices[pair]) {
            el.innerText = state.livePrices[pair].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '$';
        }
    });
}

async function startAnalysis() {
    const loader = document.getElementById('last-update');
    if (loader) loader.innerText = 'Analyse en cours...';
    
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=201`);
            const raw = await r.json();
            if (!Array.isArray(raw)) continue;
            const d = raw.slice(0, raw.length - 1);
            const k = {
                highs: d.map(x => parseFloat(x[2])),
                lows: d.map(x => parseFloat(x[3])),
                closes: d.map(x => parseFloat(x[4]))
            };
            
            // Les fonctions de calcul doivent être définies ici ou avant
            const st = calcSuperTrend(k.highs, k.lows, k.closes);
            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: st.signal,
                stLine: st.line,
                qqe: calcQQEMod(k.closes),
                nocheco: calcNocheco(k.highs, k.lows, k.closes),
                price: k.closes[k.closes.length - 1]
            };
            
            const candlesForPortfolio = d.map(x => ({ time: x[0], close: parseFloat(x[4]) }));
            const score = (state.signals[s].ut === 'bull' ? 1 : 0) + (state.signals[s].st === 'bull' ? 1 : 0) + (state.signals[s].qqe === 'bull' ? 1 : 0);
            portfolio.update(s, state.selectedTf, candlesForPortfolio, score >= 2 ? 'BUY' : 'SELL');
            renderSignals();
        } catch(e) { console.error('Erreur analyse ' + s + ':', e); }
    }
    refreshPortfolio(state.currentPair);
    if (loader) loader.innerText = 'À jour : ' + new Date().toLocaleTimeString();
}

// ... Les autres fonctions de rendu (renderSignals, refreshPortfolio, etc.) ...

function initApp() {
    // Initialise les événements, le timer et lance le premier fetch
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        };
    });
    
    const sel = document.getElementById('signal-tf-select');
    if (sel && sel.options.length === 0) {
        CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
        sel.value = state.selectedTf;
        sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
    }
    
    startAnalysis();
    fetchLivePrices();
}

// Lancement automatique du countdown
setInterval(() => {
    const now = new Date();
    const unit = state.selectedTf === '1h' ? 3600000 : (state.selectedTf === '4h' ? 14400000 : 86400000);
    const ms = unit - (now % unit);
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const el = document.getElementById('countdown');
    if (el) el.innerText = h + ':' + m + ':' + s;
}, 1000);

setInterval(fetchLivePrices, 10000);
