// CONFIGURATION SUPABASE
const SUPABASE_URL = ‘https://cbeucdnkixjhqzdazyxw.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M’;

let sbClient;
try {
sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch(e) {
console.error(“Erreur init Supabase:”, e);
}

const BINANCE_BASE = ‘https://api.binance.com/api/v3’;

// PORTFOLIO
const portfolio = {
state: (function() {
try { return JSON.parse(localStorage.getItem(‘pache_portfolio’)) || { assets: {}, history: [] }; }
catch(e) { return { assets: {}, history: [] }; }
})(),
save: function() {
try { localStorage.setItem(‘pache_portfolio’, JSON.stringify(this.state)); }
catch(e) { console.warn(‘localStorage save failed:’, e); }
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

// AUTHENTIFICATION
window.showTab = function(tab) {
document.getElementById(‘tab-login’).style.display = tab === ‘login’ ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => {
b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’));
});
setAuthMsg(’’);
};

function setAuthMsg(msg, isError) {
if (isError === undefined) isError = true;
var el = document.getElementById(‘auth-message’);
if (el) {
el.innerText = msg;
el.style.color = isError ? ‘#f6465d’ : ‘#0ecb81’;
}
}

window.handleLogin = async function() {
var email = document.getElementById(‘login-email’).value.trim();
var pwd = document.getElementById(‘login-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
var res = await sbClient.auth.signInWithPassword({ email: email, password: pwd });
if (res.error) {
console.error(“Login Error:”, res.error);
setAuthMsg(res.error.message);
}
};

window.handleSignup = async function() {
var email = document.getElementById(‘signup-email’).value.trim();
var pwd = document.getElementById(‘signup-pwd’).value;
if (!email || !pwd) return setAuthMsg(‘Remplis tous les champs.’);
if (pwd.length < 6) return setAuthMsg(‘Mot de passe trop court.’);
var res = await sbClient.auth.signUp({ email: email, password: pwd });
if (res.error) {
console.error(“Signup Error:”, res.error);
setAuthMsg(res.error.message);
} else {
setAuthMsg(‘Compte créé ! Connecte-toi.’, false);
}
};

window.handleLogout = async function() {
await sbClient.auth.signOut();
};

sbClient.auth.onAuthStateChange(function(event, session) {
if (session) {
document.getElementById(‘auth-screen’).style.display = ‘none’;
document.getElementById(‘main-app’).style.display = ‘block’;
initApp();
} else {
document.getElementById(‘auth-screen’).style.display = ‘flex’;
document.getElementById(‘main-app’).style.display = ‘none’;
}
});

// INDICATEURS
var CONFIG = {
pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’],
utBot: { keyValue: 2, atrPeriod: 10 },
supertrend: { period: 10, multiplier: 3 },
qqe: { rsi: 14, smooth: 5 },
nocheco: { length: 10, rr: 2.0 },
timeframes: [
{ label: ‘1H’, value: ‘1h’ },
{ label: ‘4H’, value: ‘4h’ },
{ label: ‘D’, value: ‘1d’ }
]
};

var state = { signals: {}, livePrices: {}, selectedTf: ‘1d’, currentPair: ‘BTCUSDT’ };

function getATR(h, l, c, p) {
var tr = c.map(function(v, i) {
return i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]));
});
var res = new Array(c.length).fill(0);
var sum = 0;
for (var i = 1; i <= p; i++) sum += tr[i];
res[p] = sum / p;
for (var i = p+1; i < c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
return res;
}

function calcUTBot(h, l, c) {
var a = getATR(h, l, c, CONFIG.utBot.atrPeriod);
var ts = new Array(c.length).fill(0);
var p = new Array(c.length).fill(0);
for (var i = 1; i < c.length; i++) {
var nL = CONFIG.utBot.keyValue * a[i];
if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
p[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : p[i-1];
}
return p[c.length-1] === 1 ? ‘bull’ : ‘bear’;
}

function calcSuperTrend(h, l, c) {
var a = getATR(h, l, c, CONFIG.supertrend.period);
var ub = new Array(c.length).fill(0);
var lb = new Array(c.length).fill(0);
var d = new Array(c.length).fill(1);
for (var i = CONFIG.supertrend.period; i < c.length; i++) {
var mid = (h[i] + l[i]) / 2;
ub[i] = mid + CONFIG.supertrend.multiplier * a[i];
lb[i] = mid - CONFIG.supertrend.multiplier * a[i];
d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < lb[i-1] ? 1 : d[i-1]);
}
var isBull = d[c.length-1] === -1;
return { signal: isBull ? ‘bull’ : ‘bear’, line: isBull ? lb[lb.length-1] : ub[ub.length-1] };
}

function calcQQEMod(closes) {
var rsiPeriod = CONFIG.qqe.rsi;
var changes = closes.map(function(c, i) { return i === 0 ? 0 : c - closes[i-1]; });
var gains = changes.map(function(v) { return v > 0 ? v : 0; });
var losses = changes.map(function(v) { return v < 0 ? -v : 0; });
var avgG = gains.slice(1, rsiPeriod+1).reduce(function(a,b){return a+b;}, 0) / rsiPeriod;
var avgL = losses.slice(1, rsiPeriod+1).reduce(function(a,b){return a+b;}, 0) / rsiPeriod;
var rsi = new Array(closes.length).fill(50);
for (var i = rsiPeriod+1; i < closes.length; i++) {
avgG = (avgG*(rsiPeriod-1)+gains[i])/rsiPeriod;
avgL = (avgL*(rsiPeriod-1)+losses[i])/rsiPeriod;
rsi[i] = avgL === 0 ? 100 : 100 - (100 / (1 + (avgG / avgL)));
}
var rsiMa = new Array(rsi.length).fill(50);
var alpha = 2 / (CONFIG.qqe.smooth + 1);
for (var i = 1; i < rsi.length; i++) rsiMa[i] = rsi[i]*alpha + rsiMa[i-1]*(1-alpha);
return (rsiMa[rsiMa.length-1] > 50 && rsiMa[rsiMa.length-1] > rsiMa[rsiMa.length-2]) ? ‘bull’ : ‘bear’;
}

function calcNocheco(h, l, c) {
var len = CONFIG.nocheco.length;
var rr = CONFIG.nocheco.rr;
var bosType = null, sl = null, tp = null;
for (var i = len; i < c.length; i++) {
var sH = Math.max.apply(null, h.slice(i-len, i));
var sL = Math.min.apply(null, l.slice(i-len, i));
if (c[i-1] <= sH && c[i] > sH) { bosType = ‘bull’; sl = sL; tp = c[i] + (c[i] - sL) * rr; }
if (c[i-1] >= sL && c[i] < sL) { bosType = ‘bear’; sl = sH; tp = c[i] - (sH - c[i]) * rr; }
}
return { bosType: bosType, sl: sl, tp: tp };
}

// ANALYSE
async function fetchLivePrices() {
try {
var res = await fetch(BINANCE_BASE + ‘/ticker/price’);
var data = await res.json();
CONFIG.pairs.forEach(function(pair) {
var found = data.find(function(x) { return x.symbol === pair; });
if (found) state.livePrices[pair] = parseFloat(found.price);
});
updatePriceDisplays();
} catch(e) { console.error(‘Price fetch error:’, e); }
}

function updatePriceDisplays() {
CONFIG.pairs.forEach(function(pair) {
var el = document.getElementById(‘price-’ + pair);
if (el && state.livePrices[pair]) {
el.innerText = state.livePrices[pair].toLocaleString(‘en-US’, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ‘$’;
}
});
}

window.startAnalysis = async function() {
var loader = document.getElementById(‘last-update’);
if (loader) loader.innerText = ‘Analyse en cours…’;

```
for (var i = 0; i < CONFIG.pairs.length; i++) {
    var s = CONFIG.pairs[i];
    try {
        var r = await fetch(BINANCE_BASE + '/klines?symbol=' + s + '&interval=' + state.selectedTf + '&limit=201');
        var raw = await r.json();
        if (!Array.isArray(raw)) continue;
        var d = raw.slice(0, raw.length - 1);
        var k = {
            highs: d.map(function(x) { return parseFloat(x[2]); }),
            lows: d.map(function(x) { return parseFloat(x[3]); }),
            closes: d.map(function(x) { return parseFloat(x[4]); })
        };
        var st = calcSuperTrend(k.highs, k.lows, k.closes);
        state.signals[s] = {
            ut: calcUTBot(k.highs, k.lows, k.closes),
            st: st.signal,
            qqe: calcQQEMod(k.closes),
            nocheco: calcNocheco(k.highs, k.lows, k.closes)
        };
        var score = (state.signals[s].ut === 'bull' ? 1 : 0)
                  + (state.signals[s].st === 'bull' ? 1 : 0)
                  + (state.signals[s].qqe === 'bull' ? 1 : 0);
        portfolio.update(s, state.selectedTf, d.map(function(x) { return { time: x[0], close: parseFloat(x[4]) }; }), score >= 2 ? 'BUY' : 'SELL');
        renderSignals();
    } catch(e) { console.error('Erreur analyse ' + s, e); }
}
refreshPortfolio(state.currentPair);
if (loader) loader.innerText = 'MaJ : ' + new Date().toLocaleTimeString();
```

};

function renderSignals() {
var container = document.getElementById(‘signals-container’);
container.innerHTML = CONFIG.pairs.map(function(s) {
var d = state.signals[s];
if (!d) return ‘’;
var isBuy = (d.ut === ‘bull’ ? 1 : 0) + (d.st === ‘bull’ ? 1 : 0) + (d.qqe === ‘bull’ ? 1 : 0) >= 2;
var price = state.livePrices[s] ? state.livePrices[s].toLocaleString(‘en-US’, {minimumFractionDigits:2}) + ‘$’ : ‘…’;
var bos = d.nocheco.bosType ? ‘<div class="bos-badge bos-' + d.nocheco.bosType + '">BOS ’ + d.nocheco.bosType.toUpperCase() + ‘</div>’ : ‘’;
return ‘<div class="crypto-card" onclick="viewPair(\'' + s + '\')">’
+ ‘<div class="card-info"><span class="pair-name">’ + s + ‘</span><span class="live-price" id="price-' + s + '">’ + price + ‘</span></div>’
+ ‘<div class="verdict ' + (isBuy ? 'buy' : 'out') + '">’ + (isBuy ? “J'ACHETE” : ‘HORS MARCHE’) + ‘</div>’
+ bos
+ ‘</div>’;
}).join(’’);
}

function refreshPortfolio(pair) {
var container = document.getElementById(‘portfolio-container’);
var data = portfolio.getDisplayData(pair, state.selectedTf);
var perf = ((data.capital - 1000) / 1000) * 100;
var sign = perf >= 0 ? ‘+’ : ‘’;
container.innerHTML = ‘<div class="portfolio-card">’
+ ‘<h3>’ + pair + ’ (’ + state.selectedTf.toUpperCase() + ‘)</h3>’
+ ‘<div class="cap-val">’ + data.capital.toFixed(2) + ’ $</div>’
+ ‘<div class="perf-val ' + (perf >= 0 ? 'plus' : 'minus') + '">’ + sign + perf.toFixed(2) + ‘%</div>’
+ ‘</div>’;
}

window.viewPair = function(pair) {
state.currentPair = pair;
refreshPortfolio(pair);
document.querySelector(’[data-tab=“tab-portfolio”]’).click();
};

function initApp() {
document.querySelectorAll(’.nav-tab’).forEach(function(btn) {
btn.onclick = function() {
document.querySelectorAll(’.nav-tab, .tab-content’).forEach(function(el) { el.classList.remove(‘active’); });
btn.classList.add(‘active’);
document.getElementById(btn.dataset.tab).classList.add(‘active’);
};
});

```
var sel = document.getElementById('signal-tf-select');
if (sel && sel.options.length === 0) {
    CONFIG.timeframes.forEach(function(t) { sel.add(new Option(t.label, t.value)); });
    sel.value = state.selectedTf;
    sel.onchange = function(e) { state.selectedTf = e.target.value; window.startAnalysis(); };
}

window.startAnalysis();
fetchLivePrices();
```

}

// TIMERS
setInterval(fetchLivePrices, 10000);

setInterval(function() {
var now = new Date();
var unit = state.selectedTf === ‘1h’ ? 3600000 : (state.selectedTf === ‘4h’ ? 14400000 : 86400000);
var ms = unit - (now.getTime() % unit);
var h = Math.floor(ms / 3600000).toString().padStart(2, ‘0’);
var m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, ‘0’);
var s = Math.floor((ms % 60000) / 1000).toString().padStart(2, ‘0’);
var el = document.getElementById(‘countdown’);
if (el) el.innerText = h + ‘:’ + m + ‘:’ + s;
}, 1000);
