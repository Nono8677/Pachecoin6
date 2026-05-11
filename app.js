// CONFIGURATION
const SUPABASE_URL = ‘https://cbeucdnkixjhqzdazyxw.supabase.co’;
const SUPABASE_ANON = ‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M’;
const BINANCE_BASE = ‘https://api.binance.com/api/v3’;

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let state = { selectedTf: ‘1d’, pairs: [‘BTCUSDT’, ‘ETHUSDT’, ‘SOLUSDT’, ‘BNBUSDT’] };

// — AUTHENTIFICATION —
window.showTab = function(tab) {
document.getElementById(‘tab-login’).style.display = tab === ‘login’ ? ‘block’ : ‘none’;
document.getElementById(‘tab-signup’).style.display = tab === ‘signup’ ? ‘block’ : ‘none’;
document.querySelectorAll(’.auth-tab’).forEach((b, i) => {
b.classList.toggle(‘active’, (i === 0) === (tab === ‘login’));
});
};

window.handleLogin = async function() {
const email = document.getElementById(‘login-email’).value;
const pwd = document.getElementById(‘login-pwd’).value;
const { error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
if (error) alert(“Erreur : “ + error.message);
};

window.handleSignup = async function() {
const email = document.getElementById(‘signup-email’).value;
const pwd = document.getElementById(‘signup-pwd’).value;
const { error } = await sbClient.auth.signUp({ email, password: pwd });
if (error) alert(error.message);
else alert(“Compte créé !”);
};

window.handleLogout = async function() { await sbClient.auth.signOut(); };

sbClient.auth.onAuthStateChange((event, session) => {
document.getElementById(‘auth-screen’).style.display = session ? ‘none’ : ‘flex’;
document.getElementById(‘main-app’).style.display = session ? ‘block’ : ‘none’;
if(session) initApp();
});

// — ANALYSE —
async function startAnalysis() {
const loader = document.getElementById(‘last-update’);
if(loader) loader.innerText = “Analyse en cours…”;

```
const container = document.getElementById('signals-container');
container.innerHTML = '';

for (const s of state.pairs) {
    try {
        const r = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${s}`);
        const data = await r.json();
        const price = parseFloat(data.price).toLocaleString('en-US', { minimumFractionDigits: 2 });

        container.innerHTML += `
            <div class="crypto-card">
                <div class="card-info">
                    <span>${s}</span>
                    <span>${price} $</span>
                </div>
                <div class="verdict buy">J'ACHÈTE</div>
            </div>
        `;
    } catch(e) { console.error("Erreur Binance :", e); }
}
if(loader) loader.innerText = "À jour : " + new Date().toLocaleTimeString();
```

}

function initApp() {
// Navigation Tabs
document.querySelectorAll(’.nav-tab’).forEach(btn => {
btn.onclick = () => {
document.querySelectorAll(’.nav-tab, .tab-content’).forEach(el => el.classList.remove(‘active’));
btn.classList.add(‘active’);
document.getElementById(btn.dataset.tab).classList.add(‘active’);
};
});

```
// Timeframe Select
const sel = document.getElementById('signal-tf-select');
if(sel && sel.options.length === 0) {
    [['1H','1h'],['4H','4h'],['D','1d']].forEach(t => sel.add(new Option(t[0], t[1])));
    sel.value = state.selectedTf;
    sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
}

startAnalysis();
setInterval(startAnalysis, 60000);
```

}

// Timer de clôture — CORRECTION : now.getTime() % unit
setInterval(() => {
const now = new Date();
const unit = state.selectedTf === ‘1h’ ? 3600000 : (state.selectedTf === ‘4h’ ? 14400000 : 86400000);
const ms = unit - (now.getTime() % unit);
const h = Math.floor(ms / 3600000).toString().padStart(2, ‘0’);
const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, ‘0’);
const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, ‘0’);
const el = document.getElementById(‘countdown’);
if (el) el.innerText = h + ‘:’ + m + ‘:’ + s;
}, 1000);
