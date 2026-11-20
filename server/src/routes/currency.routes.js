const express = require('express');
const currencyController = require('../controllers/currency.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateConvertCurrency } = require('../validators/currency.validator');

const router = express.Router();

router.use(authenticate);

router.get('/rates', currencyController.getRates);
router.post('/convert', validateConvertCurrency, currencyController.convert);

module.exports = router;

