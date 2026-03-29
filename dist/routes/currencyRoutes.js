"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const currencyController_1 = require("../controllers/currencyController");
const router = (0, express_1.Router)();
router.get('/rates', currencyController_1.getCurrencyRates);
exports.default = router;
