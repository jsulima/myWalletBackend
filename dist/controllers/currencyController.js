"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrencyRates = void 0;
const currencyService_1 = require("../services/currencyService");
const getCurrencyRates = async (req, res) => {
    try {
        const rates = await (0, currencyService_1.fetchCurrencyRates)();
        res.json(rates);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch currency rates' });
    }
};
exports.getCurrencyRates = getCurrencyRates;
