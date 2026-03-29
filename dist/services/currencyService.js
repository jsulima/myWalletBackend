"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCurrencyRates = void 0;
const axios_1 = __importDefault(require("axios"));
let cachedRates = [];
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 4; // 4 hours
const CURRENCY_CODES = {
    840: 'USD',
    980: 'UAH',
    978: 'EUR',
};
const REVERSE_CODES = {
    'USD': 840,
    'UAH': 980,
    'EUR': 978,
};
const fetchCurrencyRates = async () => {
    const now = Date.now();
    if (cachedRates.length > 0 && now - lastFetchTime < CACHE_DURATION) {
        return cachedRates;
    }
    try {
        const response = await axios_1.default.get('https://api.monobank.ua/bank/currency');
        const rates = [];
        response.data.forEach((item) => {
            const from = CURRENCY_CODES[item.currencyCodeA];
            const to = CURRENCY_CODES[item.currencyCodeB];
            if (from && to) {
                // We prefer rateBuy/rateSell, but fallback to rateCross
                const rate = item.rateSell ? (item.rateSell + (item.rateBuy || item.rateSell)) / 2 : item.rateCross;
                if (rate) {
                    rates.push({ from, to, rate });
                    // Add inverse rate
                    rates.push({ from: to, to: from, rate: 1 / rate });
                }
            }
        });
        // Handle cross rates if needed (e.g., EUR to USD via UAH)
        // For now, let's just ensure we have UAH/USD and USD/UAH
        cachedRates = rates;
        lastFetchTime = now;
        return rates;
    }
    catch (error) {
        console.error('Failed to fetch rates from Monobank:', error);
        // If we have old cached rates, return them instead of failing
        if (cachedRates.length > 0)
            return cachedRates;
        // Fallback to hardcoded rates if everything fails
        return [
            { from: 'USD', to: 'UAH', rate: 40 },
            { from: 'UAH', to: 'USD', rate: 1 / 40 },
            { from: 'EUR', to: 'UAH', rate: 43 },
            { from: 'UAH', to: 'EUR', rate: 1 / 43 },
        ];
    }
};
exports.fetchCurrencyRates = fetchCurrencyRates;
