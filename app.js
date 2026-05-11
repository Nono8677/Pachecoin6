'use strict';

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
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3hjb3RieXJ6dG5nYXdid3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzU3MDQsImV4cCI6MjA5Mzc1MTcwNH​​​​​​​​​​​​​​​​
