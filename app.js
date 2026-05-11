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
        const newCandles = candles.filter(function(c) { return c.time > data.lastSeen; });
        newCandles.forEach(function(candle) {
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

const SUPABASE_URL = 'https://ikcxcotbyrztngawbwro.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3hjb3RieXJ6dG5nYXdid3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzU3MDQsImV4cCI6MjA5Mzc1MTcwNH0.pUV8iAY7nUI1mGtv_DO-36fMLPOKfMM6oVydgowtdgM';
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

window.showTab = function(tab) {
    document.getElementById('tab-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
    document.querySelectorAll('.auth-tab').forEach(function(b, i) {
        b.classList.toggle('active', (i === 0) === (tab === 'login'));
    });
    setAuthMsg('');
};

function setAuthMsg(msg, isError) {
    if (isError === undefined) isError = true;
    const el = document.getElementById('auth-message');
    if (el) { el.innerText = msg; el.style.color = isError ? '#f6465d' : '#0ecb81'; }
}

window.handleLogin = async function() {
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-pwd').value;
    if (!email || !pwd) return setAuthMsg('Remplis tous les champs.');
    const result = await sbClient.auth.signInWithPassword({ email: email, password: pwd });
    if (result.error) setAuthMsg('Email ou mot de passe incorrect.');
};

window.handleSignup = async function() {
    const email = document.getElementById('signup-email').value.trim();
    const pwd = document.getElementById('signup-pwd').value;
    if (!email || !pwd) return setAuthMsg('Remplis tous les champs.');
    if (pwd.length < 6) return setAuthMsg('Mot de passe trop court.');
    const result = await sbClient.auth.signUp({ email: email, password: pwd });
    if (result.error) setAuthMsg(result.error.message);
    else setAuthMsg('Compte cree ! Verifie tes emails.', false);
};

window.handleLogout = async function() { await sbClient.auth.signOut(); };

sbClient.auth.onAuthStateChange(function(event, session) {
    if (session) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        initApp();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    }
});

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

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, livePrices: {}, selectedTf: '1d', currentPair: 'BTCUSDT' };

function getATR(h, l, c, p) {
    const tr = c.map(function(v, i) {
        return i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]));
    });
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
    return p[c.length-1] === 1 ? 'bull' : 'bear';
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
    return { signal: isBull ? 'bull' : 'bear', line: isBull ? lb[lb.length-1] : ub[ub.length-1] };
}

function calcQQEMod(closes) {
    const rsiPeriod = CONFIG.qqe.rsi;
    const changes = closes.map(function(c, i) { return i === 0 ? 0 : c - closes[i-1]; });
    const gains = changes.map(function(v) { return v > 0 ? v : 0; });
    const losses = changes.map(function(v) { return v < 0 ? -v : 0; });
    let avgG = gains.slice(1, rsiPeriod+1).reduce(function(a,b){ return a+b; }, 0) / rsiPeriod;
    let avgL = losses.slice(1, rsiPeriod+1).reduce(function(a,b){ return a+b; }, 0) / rsiPeriod;
    const rsi = new Array(closes.length).fill(50);
    for (let i = rsiPeriod+1; i < closes.length; i++) {
        avgG = (avgG*(rsiPeriod-1)+gains[i])/rsiPeriod;
        avgL = (avgL*(rsiPeriod-1)+losses[i])/rsiPeriod;
        rsi[i] = avgL === 0 ? 100 : 100 - (100 / (1 + (avgG / avgL)));
    }
    const rsiMa = new Array(rsi.length).fill(50);
    const alpha = 2 / (CONFIG.qqe.smooth + 1);
    for (let i = 1; i < rsi.length; i++) rsiMa[i] = rsi[i]*alpha + rsiMa[i-1]*(1-alpha);
    return (rsiMa[rsiMa.length-1] > 50 && rsiMa[rsiMa.length-1] > rsiMa[rsiMa.length-2]) ? 'bull' : 'bear';
}

function calcNocheco(h, l, c) {
    const len = CONFIG.nocheco.length;
    const rr = CONFIG.nocheco.rr;
    let bosType = null, sl = null, tp = null;
    for (let i = len; i < c.length; i++) {
        let sH = h[i - len];
        let sL = l[i - len];
        for (let j = i - len + 1; j < i; j++) {
            if (h[j] > sH) sH = h[j];
            if (l[j] < sL) sL = l[j];
        }
        if (c[i-1] <= sH && c[i] > sH) { bosType = 'bull'; sl = sL; tp = c[i] + (c[i] - sL) * rr; }
        if (c[i-1] >= sL && c[i] < sL) { bosType = 'bear'; sl = sH; tp = c[i] - (sH - c[i]) * rr; }
    }
    return { bosType: bosType, sl: sl, tp: tp };
}

async function fetchLivePrices() {
    try {
        const res = await fetch(BINANCE_BASE + '/ticker/price');
        const data = await res.json();
        CONFIG.pairs.forEach(function(pair) {
            const found = data.find(function(x) { return x.symbol === pair; });
            if (found) state.livePrices[pair] = parseFloat(found.price);
        });
        updatePriceDisplays();
    } catch(e) { console.error('Price fetch error:', e); }
}

function updatePriceDisplays() {
    CONFIG.pairs.forEach(function(pair) {
        const el = document.getElementById('price-' + pair);
        if (el && state.livePrices[pair]) {
            el.innerText = state.livePrices[pair].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '$';
        }
    });
}

async function startAnalysis() {
    document.getElementById('last-update').innerText = 'Analyse...';
    for (let si = 0; si < CONFIG.pairs.length; si++) {
        const s = CONFIG.pairs[si];
        try {
            const r = await fetch(BINANCE_BASE + '/klines?symbol=' + s + '&interval=' + state.selectedTf + '&limit=201');
            const raw = await r.json();
            if (!Array.isArray(raw) || raw.length === 0) throw new Error('Donnees invalides');
            const d = raw.slice(0, raw.length - 1);
            const k = {
                highs: d.map(function(x) { return parseFloat(x[2]); }),
                lows: d.map(function(x) { return parseFloat(x[3]); }),
                closes: d.map(function(x) { return parseFloat(x[4]); })
            };
            const st = calcSuperTrend(k.highs, k.lows, k.closes);
            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: st.signal,
                stLine: st.line,
                qqe: calcQQEMod(k.closes),
                nocheco: calcNocheco(k.highs, k.lows, k.closes),
                price: k.closes[k.closes.length - 1]
            };
            const candlesForPortfolio = d.map(function(x) { return { time: x[0], close: parseFloat(x[4]) }; });
            const score = (state.signals[s].ut === 'bull' ? 1 : 0)
                        + (state.signals[s].st === 'bull' ? 1 : 0)
                        + (state.signals[s].qqe === 'bull' ? 1 : 0);
            portfolio.update(s, state.selectedTf, candlesForPortfolio, score >= 2 ? 'BUY' : 'SELL');
            renderSignals();
        } catch(e) { console.error('Erreur analyse ' + s + ':', e); }
    }
    refreshPortfolio(state.currentPair);
    document.getElementById('last-update').innerText = 'A jour : ' + new Date().toLocaleTimeString();
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(function(s) {
        const d = state.signals[s];
        if (!d) return '<div class="crypto-card"><div class="card-info"><span class="pair-name">' + s + '</span></div><div style="opacity:0.4;font-size:0.85rem;">Analyse en cours...</div></div>';
        const score = (d.ut === 'bull' ? 1 : 0) + (d.st === 'bull' ? 1 : 0) + (d.qqe === 'bull' ? 1 : 0);
        const isBuy = score >= 2;
        const priceStr = state.livePrices[s] ? state.livePrices[s].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '$' : '...';
        let bosHTML = '';
        if (d.nocheco.bosType) {
            const isBull = d.nocheco.bosType === 'bull';
            bosHTML = '<div class="bos-badge ' + (isBull ? 'bos-bull' : 'bos-bear') + '">'
                + (isBull ? 'BOS Bull' : 'BOS Bear')
                + '</div>'
                + '<div class="sl-tp-row">'
                + '<span class="sl-val">SL : ' + d.nocheco.sl.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '$</span>'
                + '<span class="tp-val">TP : ' + d.nocheco.tp.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '$</span>'
                + '</div>';
        }
        return '<div class="crypto-card" onclick="viewPair(\'' + s + '\')">'
            + '<div class="card-info">'
            + '<span class="pair-name">' + s + '</span>'
            + '<span class="live-price" id="price-' + s + '">' + priceStr + '</span>'
            + '</div>'
            + '<div class="verdict ' + (isBuy ? 'buy' : 'out') + '">' + (isBuy ? "J'ACHETE" : 'HORS MARCHE') + '</div>'
            + bosHTML
            + '</div>';
    }).join('');
}

function refreshPortfolio(pair) {
    const container = document.getElementById('portfolio-container');
    if (!container) return;
    const data = portfolio.getDisplayData(pair, state.selectedTf);
    const perf = ((data.capital - 1000) / 1000) * 100;
    container.innerHTML = '<div class="portfolio-card">'
        + '<div style="color:#ff8c00; margin-bottom:15px; font-weight:bold;">STRATEGIE : ' + pair + ' (' + state.selectedTf.toUpperCase() + ')</div>'
        + '<div class="cap-val">' + data.capital.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' $</div>'
        + '<div class="perf-val ' + (perf >= 0 ? 'plus' : 'minus') + '">' + (perf >= 0 ? '+ ' : '- ') + Math.abs(perf).toFixed(2) + '%</div>'
        + '<p style="margin-top:20px; font-size:0.8rem; opacity:0.5;">Statut : ' + (data.position ? 'EN POSITION' : 'LIQUIDE') + '</p>'
        + '</div>';
}

window.viewPair = function(pair) {
    state.currentPair = pair;
    refreshPortfolio(pair);
    document.querySelector('[data-tab="tab-portfolio"]').click();
};

function updateCountdown() {
    const now = new Date();
    const unit = state.selectedTf === '1h' ? 3600000 : (state.selectedTf === '4h' ? 14400000 : 86400000);
    const ms = unit - (now % unit);
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const el = document.getElementById('countdown');
    if (el) el.innerText = h + ':' + m + ':' + s;
}

let appInitialized = false;
function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    document.querySelectorAll('.nav-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.nav-tab, .tab-content').forEach(function(el) { el.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    const sel = document.getElementById('signal-tf-select');
    if (sel) {
        CONFIG.timeframes.forEach(function(t) { sel.add(new Option(t.label, t.value)); });
        sel.value = state.selectedTf;
        sel.onchange = function(e) { state.selectedTf = e.target.value; startAnalysis(); };
    }
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.onclick = startAnalysis;
    setInterval(updateCountdown, 1000);
    setInterval(fetchLivePrices, 10000);
    startAnalysis();
    fetchLivePrices();
}
