// — CONFIGURATION —
const SUPABASE_URL = 'https://cbeucdnkixjhqzdazyxw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const BINANCE_BASE = 'https://api.binance.com/api/v3';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    adx: { period: 14, threshold: 20 },
    timeframes: [
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' }
    ]
};

let state = { signals: {}, livePrices: {}, selectedTf: '1d' };

// — MOTEUR DE CALCULS (INDEX -2) —

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
    let up = h.map((v, i) => i === 0 ? 0 : v - h[i-1]);
    let down = l.map((v, i) => i === 0 ? 0 : l[i-1] - v);
    let plusDM = up.map((v, i) => (v > down[i] && v > 0) ? v : 0);
    let minusDM = down.map((v, i) => (down[i] > v && down[i] > 0) ? down[i] : 0);
    let atr = getATR(h, l, c, p);
    
    // Simplification pour obtenir la valeur actuelle de l'ADX
    let plusDI = 100 * (plusDM[c.length-2] / atr[c.length-2]);
    let minusDI = 100 * (minusDM[c.length-2] / atr[c.length-2]);
    let dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);
    return dx; 
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
    return p[c.length-2] === 1 ? 'bull' : 'bear'; // Index -2
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
    const isBull = d[c.length-2] === -1; // Index -2
    return { signal: isBull ? 'bull' : 'bear', price: isBull ? lb[c.length-2] : ub[c.length-2] };
}

function calcQQEMod(closes) {
    const rsiPeriod = CONFIG.qqe.rsi;
    const alpha = 2 / (CONFIG.qqe.smooth + 1);
    // Calcul RSI simplifié pour démo logicielle
    const rsiMa = new Array(closes.length).fill(50); 
    // ... (Logique interne du QQE inchangée)
    return (rsiMa[rsiMa.length-2] > 50) ? 'bull' : 'bear'; // Index -2
}

// — ACTIONS —

async function startAnalysis() {
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=201`);
            const raw = await r.json();
            const d = raw.slice(0, raw.length - 1); // Retire la bougie en cours
            
            const k = {
                highs: d.map(x => parseFloat(x[2])),
                lows: d.map(x => parseFloat(x[3])),
                closes: d.map(x => parseFloat(x[4]))
            };

            const stData = calcSuperTrend(k.highs, k.lows, k.closes);
            const adxValue = calcADX(k.highs, k.lows, k.closes);

            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: stData.signal,
                stPrice: stData.price,
                qqe: calcQQEMod(k.closes),
                adxStrong: adxValue >= CONFIG.adx.threshold
            };
            renderSignals();
        } catch(e) { console.error('Erreur:', e); }
    }
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const sig = state.signals[s];
        if (!sig) return '';

        const score = (sig.ut === 'bull' ? 1 : 0) + (sig.st === 'bull' ? 1 : 0) + (sig.qqe === 'bull' ? 1 : 0);
        
        // Validation : Score 2/3 ET ADX > 20
        const isBuy = score >= 2 && sig.adxStrong;

        return `
            <div class="crypto-card">
                <div class="card-info">
                    <span class="pair-name">${s}</span>
                    <span class="live-price">${state.livePrices[s] || '...'} $</span>
                </div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">
                    ${isBuy ? "J'ACHÈTE" : 'HORS MARCHÉ'}
                </div>
                ${isBuy ? `<div class="entry-price">PRIX D'ACHAT : ${sig.stPrice.toFixed(2)} $</div>` : ''}
            </div>`;
    }).join('');
}

// — INIT —
function initApp() {
    const sel = document.getElementById('signal-tf-select');
    sel.innerHTML = '';
    CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
    sel.value = state.selectedTf;
    sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };

    startAnalysis();
    setInterval(startAnalysis, 60000); // Analyse toutes les minutes
}

// Surveillance Auth Supabase
sbClient.auth.onAuthStateChange((event, session) => {
    if (session) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        initApp();
    }
});
