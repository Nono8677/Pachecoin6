// — CONFIGURATION SUPABASE —
const SUPABASE_URL = ‘https://cbeucdnkixjhqzdazyxw.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M’;

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// — CONFIGURATION API —
const BINANCE_BASE = ‘https://api.binance.com/api/v3’;

// — GESTION DU PORTFOLIO (LOCALSTORAGE) —
const portfolio = {
state: (function() {
try {
return JSON.parse(localStorage.getItem(‘pache_portfolio’)) || { assets: {}, history: [] };
} catch(e) { return { assets: {}, history: [] }; }
})(),
save: function() {
try {
localStorage.setItem(‘pache_portfolio’, JSON.stringify(this.state));
} catch(e) { console.warn(‘Erreur sauvegarde portfolio:’, e); }
},
update: function(asset, tf, candles, signal) {
const id = asset + ‘*’ + tf;
if (!this.state.assets[id]) {
this.state.assets[id] = { capital: 1000, position: null, lastSeen: 0 };
}
const data = this.state.assets[id];
const newCandles = candles.filter(c => c.time > data.lastSeen);
newCandles.forEach(candle => {
if (data.position) {
const perf = (candle.close - data.position.entryPrice) / data.position.entryPrice;
if (signal === ‘SELL’ || perf < -0.50) {
data.capital *= (1 + perf);
data.position = null;
}
} else if (signal === ‘BUY’) {
data.position = { entryPrice: candle.close };
}
data.lastSeen = candle.time;
});
this.save();
},
getDisplayData: function(asset, tf) {
return this.state.assets[asset + ’*’ + tf] || { capital: 1000, position: null };
}
};

// — AUTHENTIFICATION —
window.showTab = function(tab) {
document.getElementById(‘tab-login’).style.display = tab === ‘login’ ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => {
b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’));
});
setAuthMsg(’’);
};

function setAuthMsg(msg, isError = true) {
const el = document.getElementById(‘auth-message’);
if (el) {
el.innerText = msg;
el.style.color = isError ? ‘#f6465d’ : ‘#0ecb81’;
}
}

window.handleLogin = async function() {
const email = document.getElementById(‘login-email’).value.trim();
const pwd = document.getElementById(‘login-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
const { error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
if (error) setAuthMsg(‘Email ou mot de passe incorrect.’);
};

window.handleSignup = async function() {
const email = document.getElementById(‘signup-email’).value.trim();
const pwd = document.getElementById(‘signup-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
if (pwd.length < 6) return setAuthMsg(‘Mot de passe trop court.’);
const { error } = await sbClient.auth.signUp({ email, password: pwd });
if (error) setAuthMsg(error.message);
else setAuthMsg(‘Compte cree ! Connecte-toi.’, false);
};

window.handleLogout = async function() {
await sbClient.auth.signOut();
};

sbClient.auth.onAuthStateChange((event, session) => {
const authScreen = document.getElementById(‘auth-screen’);
const mainApp = document.getElementById(‘main-app’);
if (session) {
authScreen.style.display = ‘none’;
mainApp.style.display = ‘block’;
initApp();
} else {
authScreen.style.display = ‘flex’;
mainApp.style.display = ‘none’;
}
});

// — LOGIQUE D’ANALYSE TECHNIQUE —
const CONFIG = {
pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’],
utBot: { keyValue: 2, atrPeriod: 10 },
supertrend: { period: 10, multiplier: 3 },
qqe: { rsi: 14, smooth: 5, fast: 4.236 },
adx: { period: 14 },
timeframes: [
{ label: ‘1H’, value: ‘1h’ },
{ label: ‘4H’, value: ‘4h’ },
{ label: ‘D’, value: ‘1d’ }
]
};

let state = { signals: {}, livePrices: {}, selectedTf: ‘1d’, currentPair: ‘BTCUSDT’ };

// — FONCTIONS DE CALCUL —

function getATR(h, l, c, p) {
const tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
const res = new Array(c.length).fill(0);
let sum = 0;
for (let i = 1; i <= p; i++) sum += tr[i];
res[p] = sum / p;
for (let i = p+1; i < c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
return res;
}

function calcUTBot(h, l, c) {
const a = getATR(h, l, c, CONFIG.utBot.atrPeriod);
const ts = new Array(c.length).fill(0);
const p = new Array(c.length).fill(0);
for (let i = 1; i < c.length; i++) {
const nL = CONFIG.utBot.keyValue * a[i];
if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
p[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : p[i-1];
}
return p[c.length-1] === 1 ? ‘bull’ : ‘bear’;
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
const isBull = d[c.length-1] === -1;

```
// Derniere upper band au croisement bear(1)->bull(-1)
let entryPrice = null;
for (let i = CONFIG.supertrend.period + 1; i < c.length; i++) {
    if (d[i-1] === 1 && d[i] === -1) {
        entryPrice = ub[i-1];
    }
}

return {
    signal: isBull ? 'bull' : 'bear',
    line: isBull ? lb[lb.length-1] : ub[ub.length-1],
    entryPrice: entryPrice
};
```

}

function calcQQEMod(closes) {
const rsiPeriod = CONFIG.qqe.rsi;
const changes = closes.map((c, i) => i === 0 ? 0 : c - closes[i-1]);
const gains = changes.map(v => v > 0 ? v : 0);
const losses = changes.map(v => v < 0 ? -v : 0);
let avgG = gains.slice(1, rsiPeriod+1).reduce((a,b)=>a+b, 0) / rsiPeriod;
let avgL = losses.slice(1, rsiPeriod+1).reduce((a,b)=>a+b, 0) / rsiPeriod;
const rsi = new Array(closes.length).fill(50);
for (let i = rsiPeriod+1; i < closes.length; i++) {
avgG = (avgG*(rsiPeriod-1)+gains[i])/rsiPeriod;
avgL = (avgL*(rsiPeriod-1)+losses[i])/rsiPeriod;
rsi[i] = avgL === 0 ? 100 : 100 - (100 / (1 + (avgG / avgL)));
}
const rsiMa = new Array(rsi.length).fill(50);
const alpha = 2 / (CONFIG.qqe.smooth + 1);
for (let i = 1; i < rsi.length; i++) rsiMa[i] = rsi[i]*alpha + rsiMa[i-1]*(1-alpha);
return (rsiMa[rsiMa.length-1] > 50 && rsiMa[rsiMa.length-1] > rsiMa[rsiMa.length-2]) ? ‘bull’ : ‘bear’;
}

// ADX filtre silencieux (periode 14)
function calcADX(h, l, c) {
const period = CONFIG.adx.period;
const len = c.length;
if (len < period + 1) return 0;

```
const plusDM = new Array(len).fill(0);
const minusDM = new Array(len).fill(0);
const tr = new Array(len).fill(0);

for (let i = 1; i < len; i++) {
    const upMove = h[i] - h[i-1];
    const downMove = l[i-1] - l[i];
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    tr[i] = Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]));
}

let smoothTR = tr.slice(1, period+1).reduce((a,b)=>a+b, 0);
let smoothPlus = plusDM.slice(1, period+1).reduce((a,b)=>a+b, 0);
let smoothMinus = minusDM.slice(1, period+1).reduce((a,b)=>a+b, 0);

const dx = [];
for (let i = period + 1; i < len; i++) {
    smoothTR = smoothTR - (smoothTR / period) + tr[i];
    smoothPlus = smoothPlus - (smoothPlus / period) + plusDM[i];
    smoothMinus = smoothMinus - (smoothMinus / period) + minusDM[i];
    const diPlus = smoothTR !== 0 ? (smoothPlus / smoothTR) * 100 : 0;
    const diMinus = smoothTR !== 0 ? (smoothMinus / smoothTR) * 100 : 0;
    const diSum = diPlus + diMinus;
    dx.push(diSum !== 0 ? Math.abs(diPlus - diMinus) / diSum * 100 : 0);
}

if (dx.length < period) return 0;
return dx.slice(-period).reduce((a,b)=>a+b, 0) / period;
```

}

// — APP ACTIONS —

async function fetchLivePrices() {
try {
const res = await fetch(BINANCE_BASE + ‘/ticker/price’);
const data = await res.json();
CONFIG.pairs.forEach(pair => {
const found = data.find(x => x.symbol === pair);
if (found) state.livePrices[pair] = parseFloat(found.price);
});
updatePriceDisplays();
} catch(e) { console.error(‘Erreur prix Binance:’, e); }
}

function updatePriceDisplays() {
CONFIG.pairs.forEach(pair => {
const el = document.getElementById(‘price-’ + pair);
if (el && state.livePrices[pair]) {
el.innerText = state.livePrices[pair].toLocaleString(‘en-US’, { minimumFractionDigits: 2 }) + ‘$’;
}
});
}

async function startAnalysis() {
const updateEl = document.getElementById(‘last-update’);
if (updateEl) updateEl.innerText = ‘Analyse en cours…’;

```
for (const s of CONFIG.pairs) {
    try {
        const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=201`);
        const raw = await r.json();
        const d = raw.slice(0, raw.length - 1);
        const k = {
            highs: d.map(x => parseFloat(x[2])),
            lows: d.map(x => parseFloat(x[3])),
            closes: d.map(x => parseFloat(x[4]))
        };

        const st = calcSuperTrend(k.highs, k.lows, k.closes);
        const adx = calcADX(k.highs, k.lows, k.closes);

        state.signals[s] = {
            ut: calcUTBot(k.highs, k.lows, k.closes),
            st: st.signal,
            qqe: calcQQEMod(k.closes),
            entryPrice: st.entryPrice,
            adx: adx
        };

        const score = (state.signals[s].ut === 'bull' ? 1 : 0)
                    + (state.signals[s].st === 'bull' ? 1 : 0)
                    + (state.signals[s].qqe === 'bull' ? 1 : 0);

        const signal = (score >= 2 && adx >= 20) ? 'BUY' : 'SELL';

        portfolio.update(s, state.selectedTf, d.map(x => ({ time: x[0], close: parseFloat(x[4]) })), signal);
        renderSignals();
    } catch(e) { console.error('Erreur analyse ' + s, e); }
}

if (updateEl) updateEl.innerText = 'MaJ : ' + new Date().toLocaleTimeString();
```

}

function renderSignals() {
const container = document.getElementById(‘signals-container’);
container.innerHTML = CONFIG.pairs.map(s => {
const d = state.signals[s];
if (!d) return ‘’;

```
    const score = (d.ut === 'bull' ? 1 : 0)
                + (d.st === 'bull' ? 1 : 0)
                + (d.qqe === 'bull' ? 1 : 0);
    const isBuy = score >= 2 && d.adx >= 20;

    const entryHtml = (state.selectedTf === '1d' && d.entryPrice)
        ? `<div class="entry-price">Prix d'entree : ${d.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} $</div>`
        : '';

    return `
        <div class="crypto-card" onclick="viewPair('${s}')">
            <div class="card-info">
                <span class="pair-name">${s}</span>
                <span class="live-price" id="price-${s}">${state.livePrices[s] || '...'} $</span>
            </div>
            <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHETE" : 'HORS MARCHE'}</div>
            ${entryHtml}
        </div>
    `;
}).join('');
```

}

function refreshPortfolio(pair) {
const container = document.getElementById(‘portfolio-container’);
const data = portfolio.getDisplayData(pair, state.selectedTf);
const perf = ((data.capital - 1000) / 1000) * 100;
container.innerHTML = `<div class="portfolio-card"> <h3>${pair} (${state.selectedTf.toUpperCase()})</h3> <div class="cap-val">${data.capital.toFixed(2)} $</div> <div class="perf-val ${perf >= 0 ? 'plus' : 'minus'}">${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%</div> </div>`;
}

window.viewPair = function(pair) {
state.currentPair = pair;
refreshPortfolio(pair);
document.querySelector(’[data-tab=“tab-portfolio”]’).click();
};

function initApp() {
document.querySelectorAll(’.nav-tab’).forEach(btn => {
btn.onclick = () => {
document.querySelectorAll(’.nav-tab, .tab-content’).forEach(el => el.classList.remove(‘active’));
btn.classList.add(‘active’);
document.getElementById(btn.dataset.tab).classList.add(‘active’);
};
});

```
const sel = document.getElementById('signal-tf-select');
if (sel && sel.options.length === 0) {
    CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
    sel.value = state.selectedTf;
    sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
}

const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) refreshBtn.onclick = () => startAnalysis();

startAnalysis();
fetchLivePrices();
```

}

// — TIMERS —
setInterval(fetchLivePrices, 10000);

setInterval(() => {
const now = new Date();
const unit = state.selectedTf === ‘1h’ ? 3600000 : (state.selectedTf === ‘4h’ ? 14400000 : 86400000);
const ms = unit - (now % unit);
const h = Math.floor(ms / 3600000).toString().padStart(2, ‘0’);
const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, ‘0’);
const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, ‘0’);
const el = document.getElementById(‘countdown’);
if (el) el.innerText = h + ‘:’ + m + ‘:’ + s;
}, 1000);
