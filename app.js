const SUPABASE_URL = 'https://cbeucdnkixjhqzdazyxw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZXVjZG5raXhqaHF6ZGF6eXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTUyMzEsImV4cCI6MjA5Mzk5MTIzMX0.h2m2_WOxmVa-ZkdZrdKaWobGKrQbUIqB3nGOuagcN8M';
const BINANCE_BASE = 'https://api.binance.com/api/v3';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// --- AUTH ---
window.handleLogin = async function() {
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-pwd').value;
    const { error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
    if (error) alert("Erreur: " + error.message);
};

window.handleSignup = async function() {
    const email = document.getElementById('signup-email').value;
    const pwd = document.getElementById('signup-pwd').value;
    const { error } = await sbClient.auth.signUp({ email, password: pwd });
    if (error) alert(error.message);
    else alert("Compte créé !");
};

sbClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-screen').style.display = session ? 'none' : 'flex';
    document.getElementById('main-app').style.display = session ? 'block' : 'none';
    if(session) initApp();
});

// --- LOGIQUE INDICATEURS ---
async function startAnalysis() {
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    const container = document.getElementById('signals-container');
    container.innerHTML = '';

    for (const s of pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${s}`);
            const data = await r.json();
            const price = parseFloat(data.price).toLocaleString('en-US');

            container.innerHTML += `
                <div class="crypto-card">
                    <div class="card-info">
                        <span>${s}</span>
                        <span>${price}$</span>
                    </div>
                    <div class="verdict buy">J'ACHÈTE</div>
                </div>
            `;
        } catch(e) { console.error(e); }
    }
    document.getElementById('last-update').innerText = "À jour : " + new Date().toLocaleTimeString();
}

function initApp() {
    startAnalysis();
    setInterval(startAnalysis, 30000); // MaJ toutes les 30 sec
}
