‘use strict’;

/* — SUPABASE — */
const SUPABASE_URL  = ‘https://ikcxcotbyrztngawbwro.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3hjb3RieXJ6dG5nYXdid3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzU3MDQsImV4cCI6MjA5Mzc1MTcwNH0.pUV8iAY7nUI1mGtv_DO-36fMLPOKfMM6oVydgowtdgM’;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* — AUTH UI — */
window.showTab = (tab) => {
document.getElementById(‘tab-login’).style.display  = tab === ‘login’  ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’)));
setAuthMsg(’’);
};

function setAuthMsg(msg, isError = true) {
const el = document.getElementById(‘auth-message’);
el.innerText = msg;
el.style.color = isError ? ‘#f6465d’ : ‘#0ecb81’;
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
else setAuthMsg(‘Compte créé ! Vérifie ton email pour confirmer.’, false);
};

window.handleLogout = async () => {
await supabase.auth.signOut();
};

/* — GESTION SESSION — */
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

/* — CONFIG — */
const CONFIG = {
pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’],
utBot: { keyValue: 2, atrPeriod: 10 },
supertrend: { period: 10, multiplier: 3 },
qqe: { rsi: 14, smooth: 5, fast: 4.236 },
nocheco: { length: 10, rr: 2.0 },
startCapital: 1000,
launchDate: ‘2026-03-01’,
timeframes: [
{ label: ‘1H’, value: ‘1h’ },
{ label: ‘4H’, value: ‘4h’ },
{ label: ‘D’, value: ‘1d’ }
]
};

const BINANCE_BASE = ‘https://api.binance.com/api/v3’;
let state = { signals: {}, livePrices: {}, selectedTf: ‘1d’, currentPair: ‘BTCUSDT’ };

/* — CALCULS TECHNIQUES — */
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
rsi[i] = 100 - (100/(1+(avgG/avgL)));
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
let swingHigh = Math.max(…h.slice(i - len, i));
let swingLow  = Math.min(…l.slice(i - len, i));
const crossUp   = c[i-1] <= swingHigh && c[i] > swingHigh;
const crossDown = c[i-1] >= swingLow  && c[i] < swingLow;
if (crossUp)   { bosType = ‘bull’; sl = swingLow;  tp = c[i] + (c[i] - swingLow) * rr; }
if (crossDown) { bosType = ‘bear’; sl = swingHigh; tp = c[i] - (swingHigh - c[i]) * rr; }
}
return { bosType, sl, tp };
}

/* — PRIX LIVE — */
async function fetchLivePrices() {
try {
const res  = await fetch(`${BINANCE_BASE}/ticker/price`);
const data = await res.json();
CONFIG.pairs.forEach(pair => {
const found = data.find(x => x.symbol === pair);
if (found) state.livePrices[pair] = parseFloat(found.price);
});
updatePriceDisplays();
} catch(e) { console.error(‘Live price error:’, e); }
}

function updatePriceDisplays() {
CONFIG.pairs.forEach(pair => {
const el = document.getElementById(`price-${pair}`);
if (el && state.livePrices[pair]) {
el.innerText = state.livePrices[pair].toLocaleString(‘fr-FR’, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ‘$’;
}
});
}

/* — TIMER — */
function updateCountdown() {
const now = new Date();
let ms;
if (state.selectedTf === ‘1h’) ms = 3600000 - (now % 3600000);
else if (state.selectedTf === ‘4h’) ms = 14400000 - (now % 14400000);
else ms = 86400000 - (now % 86400000);
const h = Math.floor(ms / 3600000).toString().padStart(2, ‘0’);
const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, ‘0’);
const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, ‘0’);
document.getElementById(‘countdown’).innerText = `${h}:${m}:${s}`;
}

/* — PORTFOLIO — */
async function refreshPortfolio(pair) {
const container = document.getElementById(‘portfolio-container’);
try {
const res = await fetch(`${BINANCE_BASE}/klines?symbol=${pair}&interval=1d&limit=150`);
const data = await res.json();
const closes = data.map(x => parseFloat(x[4]));
const pStart = closes[0];
const pEnd   = closes[closes.length - 1];
const perf   = ((pEnd - pStart) / pStart) * 100;
const currentCap = CONFIG.startCapital * (1 + (perf / 100));
container.innerHTML = ` <div class="portfolio-card"> <div style="color:#f0b90b; margin-bottom:15px; font-weight:bold;">PROGRESSION D : ${pair}</div> <div class="cap-val">${currentCap.toFixed(2)} $</div> <div class="perf-val ${perf >= 0 ? 'plus' : 'minus'}">${perf >= 0 ? '▲' : '▼'} ${perf.toFixed(2)}%</div> <p style="margin-top:20px; font-size:0.8rem; opacity:0.5;">Base : 1000$ le 01/03/26</p> </div>`;
} catch (e) { container.innerHTML = “Erreur de calcul.”; }
}

/* — SIGNAUX — */
function renderSignals() {
const container = document.getElementById(‘signals-container’);
container.innerHTML = CONFIG.pairs.map(s => {
const d = state.signals[s];
if (!d) return `<div class="crypto-card"><div class="card-info"><span>${s}</span></div><div style="opacity:0.4;font-size:0.85rem;">Analyse en cours...</div></div>`;
const score = (d.ut === ‘bull’ ? 1 : 0) + (d.st === ‘bull’ ? 1 : 0) + (d.qqe === ‘bull’ ? 1 : 0);
const isBuy = score >= 2;
const bosHTML = d.nocheco.bosType ? ` <div class="bos-badge ${d.nocheco.bosType === 'bull' ? 'bos-bull' : 'bos-bear'}"> ${d.nocheco.bosType === 'bull' ? '🔺 BOS Bull' : '🔻 BOS Bear'} </div> <div class="sl-tp-row"> <span class="sl-val">SL : ${d.nocheco.sl.toLocaleString('fr-FR', {maximumFractionDigits:2})}$</span> <span class="tp-val">TP : ${d.nocheco.tp.toLocaleString('fr-FR', {maximumFractionDigits:2})}$</span> </div>` : ‘’;
const scoreHTML = `<div class="score-row"> <span class="score-dot ${d.ut  === 'bull' ? 'on' : 'off'}">UTBot</span> <span class="score-dot ${d.st  === 'bull' ? 'on' : 'off'}">SuperTrend</span> <span class="score-dot ${d.qqe === 'bull' ? 'on' : 'off'}">QQE</span> </div>`;
return ` <div class="crypto-card" onclick="viewPair('${s}')"> <div class="card-info"> <span class="pair-name">${s}</span> <span class="live-price" id="price-${s}">${state.livePrices[s] ? state.livePrices[s].toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '$' : '...'}</span> </div> <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div> ${scoreHTML} ${bosHTML} </div>`;
}).join(’’);
}

window.viewPair = (pair) => {
state.currentPair = pair;
refreshPortfolio(pair);
document.querySelector(’[data-tab=“tab-portfolio”]’).click();
};

async function startAnalysis() {
document.getElementById(‘last-update’).innerText = “Analyse…”;
for (const s of CONFIG.pairs) {
try {
const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=200`);
const d = await r.json();
if (!Array.isArray(d) || d.length === 0) throw new Error(‘Données invalides’);
const k = { highs: d.map(x=>parseFloat(x[2])), lows: d.map(x=>parseFloat(x[3])), closes: d.map(x=>parseFloat(x[4])) };
const st = calcSuperTrend(k.highs, k.lows, k.closes);
state.signals[s] = {
ut:      calcUTBot(k.highs, k.lows, k.closes),
st:      st.signal,
stLine:  st.line,
qqe:     calcQQEMod(k.closes),
nocheco: calcNocheco(k.highs, k.lows, k.closes),
price:   k.closes[k.closes.length-1]
};
} catch(e) {
console.error(`Erreur analyse ${s}:`, e.message);
}
renderSignals();
}
document.getElementById(‘last-update’).innerText = “À jour : “ + new Date().toLocaleTimeString();
}

/* — INIT — */
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
CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
sel.value = state.selectedTf;
sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
document.getElementById('refresh-btn').onclick = startAnalysis;

setInterval(updateCountdown, 1000);
setInterval(fetchLivePrices, 10000);

startAnalysis();
fetchLivePrices();
refreshPortfolio(state.currentPair);
```

}
