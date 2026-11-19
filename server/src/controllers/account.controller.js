const accountService = require('../services/bwm/account.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getBalance(req, res, next) {
  try {
    const data = await accountService.getBalance();
    return sendSuccess(res, {
      message: 'Account balance retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function getOrders(req, res, next) {
  try {
    const data = await accountService.getOrders(req.query);
    return sendSuccess(res, {
      message: 'Account order history retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getBalance,
  getOrders,
};

