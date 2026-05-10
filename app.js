‘use strict’;

/* ——————————————————————————————————————————————————————————————————————————

1. MODULE PORTFOLIO (R5 + localStorage sécurisé)
   —————————————————————————————————————————————————————————————————————————— */
   const portfolio = {
   state: (() => {
   try {
   return JSON.parse(localStorage.getItem(‘pache_portfolio’)) || { assets: {}, history: [] };
   } catch(e) { return { assets: {}, history: [] }; }
   })(),

```
save() {
    try {
        localStorage.setItem('pache_portfolio', JSON.stringify(this.state));
    } catch(e) { console.warn('localStorage save failed:', e); }
},

update(asset, tf, candles, signal) {
    const id = `${asset}_${tf}`;
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

getDisplayData(asset, tf) {
    return this.state.assets[`${asset}_${tf}`] || { capital: 1000, position: null };
}
```

};

/* ——————————————————————————————————————————————————————————————————————————
2. AUTHENTICATION & SESSION (V21 intégrale)
—————————————————————————————————————————————————————————————————————————— */
const SUPABASE_URL  = ‘https://ikcxcotbyrztngawbwro.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3hjb3RieXJ6dG5nYXdid3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzU3MDQsImV4cCI6MjA5Mzc1MTcwNH0.pUV8iAY7nUI1mGtv_DO-36fMLPOKfMM6oVydgowtdgM’;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

window.showTab = (tab) => {
document.getElementById(‘tab-login’).style.display  = tab === ‘login’  ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’)));
setAuthMsg(’’);
};

function setAuthMsg(msg, isError = true) {
const el = document.getElementById(‘auth-message’);
if (el) { el.innerText = msg; el.style.color = isError ? ‘#f6465d’ : ‘#0ecb81’; }
}

window.handleLogin = async () => {
const email = document.getElementById(‘login-email’).value.trim();
const pwd   = document.getElementById(‘login-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
if (error) setAuthMsg(‘Email ou mot de passe incorrect.’);
};

window.handleSignup = async () => {
const email = document.getElementById(‘signup-email’).value.trim();
const pwd   = document.getElementById(‘signup-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
if (pwd.length < 6) return setAuthMsg(‘Mot de passe trop court (6 caractères min).’);
const { error } = await supabase.auth.signUp({ email, password: pwd });
if (error) setAuthMsg(error.message);
else setAuthMsg(‘Compte créé ! Vérifie tes emails.’, false);
};

window.handleLogout = async () => { await supabase.auth.signOut(); };

supabase.auth.onAuthStateChange((event, session) => {
if (session) {
document.getElementById(‘auth-screen’).style.display = ‘none’;
document.getElementById(‘main-app’).style.display    = ‘block’;
initApp();
} else {
document.getElementById(‘auth-screen’).style.display = ‘flex’;
document.getElementById(‘main-app’).style.display    = ‘none’;
}
});

/* ——————————————————————————————————————————————————————————————————————————
3. CONFIGURATION & MOTEUR TECHNIQUE
—————————————————————————————————————————————————————————————————————————— */
const CONFIG = {
pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’],
utBot: { keyValue: 2, atrPeriod: 10 },
supertrend: { period: 10, multiplier: 3 },
qqe: { rsi: 14, smooth: 5, fast: 4.236 },
nocheco: { length: 10, rr: 2.0 },
timeframes: [
{ label: ‘1H’, value: ‘1h’ },
{ label: ‘4H’, value: ‘4h’ },
{ label: ‘D’, value: ‘1d’ }
]
};

const BINANCE_BASE = ‘https://api.binance.com/api/v3’;
let state = { signals: {}, livePrices: {}, selectedTf: ‘1d’, currentPair: ‘BTCUSDT’ };

/* — Indicateurs mathématiques — */
function getATR(h, l, c, p) {
const tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
let res = new Array(c.length).fill(0);
let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
res[p] = sum / p;
for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
return res;
}

function calcUTBot(h, l, c) {
const a = getATR(h, l, c, CONFIG.utBot.atrPeriod);
let ts = new Array(c.length).fill(0), p = new Array(c.length).fill(0);
for (let i = 1; i < c.length; i++) {
let nL = CONFIG.utBot.keyValue * a[i];
if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
p[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : p[i-1];
}
return p[c.length-1] === 1 ? ‘bull’ : ‘bear’;
}

function calcSuperTrend(h, l, c) {
const a = getATR(h, l, c, CONFIG.supertrend.period);
let ub = new Array(c.length).fill(0), lb = new Array(c.length).fill(0), d = new Array(c.length).fill(1);
for (let i = CONFIG.supertrend.period; i < c.length; i++) {
let mid = (h[i] + l[i]) / 2;
ub[i] = mid + CONFIG.supertrend.multiplier * a[i];
lb[i] = mid - CONFIG.supertrend.multiplier * a[i];
d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < lb[i-1] ? 1 : d[i-1]);
}
const isBull = d[c.length-1] === -1;
return { signal: isBull ? ‘bull’ : ‘bear’, line: isBull ? lb[lb.length-1] : ub[ub.length-1] };
}

function calcQQEMod(closes) {
const rsiPeriod = CONFIG.qqe.rsi;
let changes = closes.map((c, i) => i === 0 ? 0 : c - closes[i-1]);
let gains = changes.map(v => v > 0 ? v : 0);
let losses = changes.map(v => v < 0 ? -v : 0);
let avgG = gains.slice(1, rsiPeriod+1).reduce((a,b)=>a+b)/rsiPeriod;
let avgL = losses.slice(1, rsiPeriod+1).reduce((a,b)=>a+b)/rsiPeriod;
let rsi = new Array(closes.length).fill(50);
for(let i=rsiPeriod+1; i<closes.length; i++) {
avgG = (avgG*(rsiPeriod-1)+gains[i])/rsiPeriod;
avgL = (avgL*(rsiPeriod-1)+losses[i])/rsiPeriod;
rsi[i] = avgL === 0 ? 100 : 100 - (100 / (1 + (avgG / avgL)));
}
let rsiMa = new Array(rsi.length).fill(50);
const alpha = 2/(CONFIG.qqe.smooth+1);
for(let i=1; i<rsi.length; i++) rsiMa[i] = rsi[i]*alpha + rsiMa[i-1]*(1-alpha);
return (rsiMa[rsiMa.length-1] > 50 && rsiMa[rsiMa.length-1] > rsiMa[rsiMa.length-2]) ? ‘bull’ : ‘bear’;
}

function calcNocheco(h, l, c) {
const len = CONFIG.nocheco.length;
const rr  = CONFIG.nocheco.rr;
let bosType = null, sl = null, tp = null;
for (let i = len; i < c.length; i++) {
let sH = Math.max(…h.slice(i - len, i));
let sL = Math.min(…l.slice(i - len, i));
if (c[i-1] <= sH && c[i] > sH) { bosType = ‘bull’; sl = sL; tp = c[i] + (c[i] - sL) * rr; }
if (c[i-1] >= sL && c[i] < sL) { bosType = ‘bear’; sl = sH; tp = c[i] - (sH - c[i]) * rr; }
}
return { bosType, sl, tp };
}

/* ——————————————————————————————————————————————————————————————————————————
4. PRIX LIVE
—————————————————————————————————————————————————————————————————————————— */
async function fetchLivePrices() {
try {
const res  = await fetch(`${BINANCE_BASE}/ticker/price`);
const data = await res.json();
CONFIG.pairs.forEach(pair => {
const found = data.find(x => x.symbol === pair);
if (found) state.livePrices[pair] = parseFloat(found.price);
});
updatePriceDisplays();
} catch(e) { console.error(‘Price fetch error:’, e); }
}

function updatePriceDisplays() {
CONFIG.pairs.forEach(pair => {
const el = document.getElementById(`price-${pair}`);
if (el && state.livePrices[pair]) {
el.innerText = state.livePrices[pair].toLocaleString(‘en-US’, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ‘$’;
}
});
}

/* ——————————————————————————————————————————————————————————————————————————
5. ANALYSE — FIX INDEX -2 APPLIQUÉ SUR LE MOTEUR DE SIGNAUX
—————————————————————————————————————————————————————————————————————————— */
async function startAnalysis() {
document.getElementById(‘last-update’).innerText = “Analyse…”;
for (const s of CONFIG.pairs) {
try {
const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=201`);
const raw = await r.json();
if (!Array.isArray(raw) || raw.length === 0) throw new Error(‘Données invalides’);

```
        // ✅ FIX INDEX -2 : on exclut la bougie en cours (non clôturée)
        // Les indicateurs tournent uniquement sur bougies clôturées
        const d = raw.slice(0, -1);

        const k = {
            highs:  d.map(x => parseFloat(x[2])),
            lows:   d.map(x => parseFloat(x[3])),
            closes: d.map(x => parseFloat(x[4]))
        };

        const st = calcSuperTrend(k.highs, k.lows, k.closes);

        state.signals[s] = {
            ut:      calcUTBot(k.highs, k.lows, k.closes),
            st:      st.signal,
            stLine:  st.line,
            qqe:     calcQQEMod(k.closes),
            nocheco: calcNocheco(k.highs, k.lows, k.closes),
            price:   k.closes[k.closes.length - 1]
        };

        // Intégration Portfolio
        const candlesForPortfolio = d.map(x => ({ time: x[0], close: parseFloat(x[4]) }));
        const score = (state.signals[s].ut === 'bull' ? 1 : 0)
                    + (state.signals[s].st === 'bull' ? 1 : 0)
                    + (state.signals[s].qqe === 'bull' ? 1 : 0);
        portfolio.update(s, state.selectedTf, candlesForPortfolio, score >= 2 ? 'BUY' : 'SELL');

        // Rendu progressif
        renderSignals();

    } catch(e) { console.error(`Erreur analyse ${s}:`, e); }
}
refreshPortfolio(state.currentPair);
document.getElementById('last-update').innerText = "À jour : " + new Date().toLocaleTimeString();
```

}

/* ——————————————————————————————————————————————————————————————————————————
6. RENDU UI — indicateurs internes masqués, verdict seul affiché
—————————————————————————————————————————————————————————————————————————— */
function renderSignals() {
const container = document.getElementById(‘signals-container’);
container.innerHTML = CONFIG.pairs.map(s => {
const d = state.signals[s];
if (!d) return ` <div class="crypto-card"> <div class="card-info"><span class="pair-name">${s}</span></div> <div style="opacity:0.4; font-size:0.85rem;">Analyse en cours...</div> </div>`;

```
    const score  = (d.ut === 'bull' ? 1 : 0) + (d.st === 'bull' ? 1 : 0) + (d.qqe === 'bull' ? 1 : 0);
    const isBuy  = score >= 2;
    const priceStr = state.livePrices[s]
        ? state.livePrices[s].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '$'
        : '...';

    // Nocheco BOS/SL/TP — affiché car c'est notre signal propriétaire
    const bosHTML = d.nocheco.bosType ? `
        <div class="bos-badge ${d.nocheco.bosType === 'bull' ? 'bos-bull' : 'bos-bear'}">
            ${d.nocheco.bosType === 'bull' ? '🔺 BOS Bull' : '🔻 BOS Bear'}
        </div>
        <div class="sl-tp-row">
            <span class="sl-val">SL : ${d.nocheco.sl.toLocaleString('en-US', { maximumFractionDigits: 2 })}$</span>
            <span class="tp-val">TP : ${d.nocheco.tp.toLocaleString('en-US', { maximumFractionDigits: 2 })}$</span>
        </div>` : '';

    // ✅ Les badges UTBot / SuperTrend / QQE sont supprimés de l'affichage
    return `
    <div class="crypto-card" onclick="viewPair('${s}')">
        <div class="card-info">
            <span class="pair-name">${s}</span>
            <span class="live-price" id="price-${s}">${priceStr}</span>
        </div>
        <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
        ${bosHTML}
    </div>`;
}).join('');
```

}

function refreshPortfolio(pair) {
const container = document.getElementById(‘portfolio-container’);
if (!container) return;
const data = portfolio.getDisplayData(pair, state.selectedTf);
const perf = ((data.capital - 1000) / 1000) * 100;

```
container.innerHTML = `
<div class="portfolio-card">
    <div style="color:#ff8c00; margin-bottom:15px; font-weight:bold;">STRATÉGIE : ${pair} (${state.selectedTf.toUpperCase()})</div>
    <div class="cap-val">${data.capital.toLocaleString('en-US', { maximumFractionDigits: 2 })} $</div>
    <div class="perf-val ${perf >= 0 ? 'plus' : 'minus'}">${perf >= 0 ? '▲' : '▼'} ${perf.toFixed(2)}%</div>
    <p style="margin-top:20px; font-size:0.8rem; opacity:0.5;">Statut : ${data.position ? 'EN POSITION' : 'LIQUIDE'}</p>
</div>`;
```

}

window.viewPair = (pair) => {
state.currentPair = pair;
refreshPortfolio(pair);
document.querySelector(’[data-tab=“tab-portfolio”]’).click();
};

/* ——————————————————————————————————————————————————————————————————————————
7. COUNTDOWN
—————————————————————————————————————————————————————————————————————————— */
function updateCountdown() {
const now  = new Date();
const unit = state.selectedTf === ‘1h’ ? 3600000 : (state.selectedTf === ‘4h’ ? 14400000 : 86400000);
const ms   = unit - (now % unit);
const h = Math.floor(ms / 3600000).toString().padStart(2, ‘0’);
const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, ‘0’);
const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, ‘0’);
const el = document.getElementById(‘countdown’);
if (el) el.innerText = `${h}:${m}:${s}`;
}

/* ——————————————————————————————————————————————————————————————————————————
8. INITIALISATION
—————————————————————————————————————————————————————————————————————————— */
let appInitialized = false;
function initApp() {
if (appInitialized) return;
appInitialized = true;

```
document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

const sel = document.getElementById('signal-tf-select');
if (sel) {
    CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
    sel.value = state.selectedTf;
    sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
}

const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) refreshBtn.onclick = startAnalysis;

setInterval(updateCountdown, 1000);
setInterval(fetchLivePrices, 10000);

startAnalysis();
fetchLivePrices();
```

}
