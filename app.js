// ── CONFIGURATION ──
const SUPABASE_URL  = ‘https://cbeucdnkixjhqzdazyxw.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M’;
const BINANCE_BASE  = ‘https://api.binance.com/api/v3’;

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let state = {
selectedTf: ‘1d’,
pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’]
};

// ── AUTHENTIFICATION ──
window.showTab = function(tab) {
document.getElementById(‘tab-login’).style.display  = tab === ‘login’  ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => {
b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’));
});
};

window.handleLogin = async function() {
const email = document.getElementById(‘login-email’).value.trim();
const pwd   = document.getElementById(‘login-pwd’).value;
const msg   = document.getElementById(‘auth-message’);
msg.style.color = ‘#848e9c’;
msg.innerText = ‘Connexion…’;
const { error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
if (error) { msg.style.color = ‘#f6465d’; msg.innerText = error.message; }
else msg.innerText = ‘’;
};

window.handleSignup = async function() {
const email = document.getElementById(‘signup-email’).value.trim();
const pwd   = document.getElementById(‘signup-pwd’).value;
const msg   = document.getElementById(‘auth-message’);
msg.style.color = ‘#848e9c’;
msg.innerText = ‘Création…’;
const { error } = await sbClient.auth.signUp({ email, password: pwd });
if (error) { msg.style.color = ‘#f6465d’; msg.innerText = error.message; }
else { msg.style.color = ‘#0ecb81’; msg.innerText = ‘Compte créé ! Connexion en cours…’; }
};

window.handleLogout = async function() {
await sbClient.auth.signOut();
};

sbClient.auth.onAuthStateChange((event, session) => {
document.getElementById(‘auth-screen’).style.display = session ? ‘none’ : ‘flex’;
document.getElementById(‘main-app’).style.display    = session ? ‘block’ : ‘none’;
if (session) initApp();
});

// ── ANALYSE ──
window.startAnalysis = async function() {
const loader    = document.getElementById(‘last-update’);
const container = document.getElementById(‘signals-container’);
if (loader) loader.innerText = ‘Analyse en cours…’;
container.innerHTML = ‘’;

```
for (const pair of state.pairs) {
    try {
        const r    = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${pair}`);
        const data = await r.json();
        const price = parseFloat(data.price).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        container.innerHTML += `
            <div class="crypto-card">
                <div class="card-info">
                    <span>${pair}</span>
                    <span>${price} $</span>
                </div>
                <div class="verdict buy">J'ACHÈTE</div>
            </div>
        `;
    } catch (e) {
        console.error('Erreur Binance :', pair, e);
        container.innerHTML += `
            <div class="crypto-card">
                <div class="card-info"><span>${pair}</span><span>—</span></div>
                <div class="verdict neutral">ERREUR RÉSEAU</div>
            </div>
        `;
    }
}

if (loader) loader.innerText = 'À jour : ' + new Date().toLocaleTimeString('fr-FR');
```

};

// ── INIT APP ──
function initApp() {
// Navigation tabs
document.querySelectorAll(’.nav-tab’).forEach(btn => {
btn.onclick = () => {
document.querySelectorAll(’.nav-tab’).forEach(b => b.classList.remove(‘active’));
document.querySelectorAll(’.tab-content’).forEach(s => s.classList.remove(‘active’));
btn.classList.add(‘active’);
document.getElementById(btn.dataset.tab).classList.add(‘active’);
};
});

```
// Timeframe select
const sel = document.getElementById('signal-tf-select');
if (sel && sel.options.length === 0) {
    [['1H', '1h'], ['4H', '4h'], ['Jour', '1d']].forEach(([label, val]) => {
        sel.add(new Option(label, val));
    });
    sel.value    = state.selectedTf;
    sel.onchange = (e) => {
        state.selectedTf = e.target.value;
        updateTimer();
        startAnalysis();
    };
}

startAnalysis();
setInterval(startAnalysis, 60000);
```

}

// ── TIMER CLÔTURE ──
function updateTimer() {
const now  = new Date();
const unit = state.selectedTf === ‘1h’  ? 3600000
: state.selectedTf === ‘4h’  ? 14400000
: 86400000; // 1d

```
const elapsed = now.getTime() % unit;   // ← CORRECTION clé
const ms      = unit - elapsed;

const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');

const el = document.getElementById('countdown');
if (el) el.innerText = h + ':' + m + ':' + s;
```

}

setInterval(updateTimer, 1000);
updateTimer(); // appel immédiat au chargement
