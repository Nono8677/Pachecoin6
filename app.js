alert("JS chargé !");

window.showTab = function(tab) {
    document.getElementById('tab-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
};

window.handleLogin = function() { alert("login"); };
window.handleSignup = function() { alert("signup"); };
window.handleLogout = function() {};
