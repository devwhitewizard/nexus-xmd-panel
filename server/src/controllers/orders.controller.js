const orderModel = require('../models/order.model');
const transactionModel = require('../models/transaction.model');
const { sendSuccess } = require('../utils/apiResponse');

function sanitizeCustomerOrder(order) {
  return {
    id: order.id,
    bot_id: order.bot_id,
    service_type: order.service_type,
    status: order.status,
    days: order.days,
    charged_xd: order.charged_xd,
    error_message: order.error_message,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function sanitizeCustomerTransaction(tx) {
  return {
    id: tx.id,
    order_id: tx.order_id,
    ledger_type: tx.ledger_type,
    direction: tx.direction,
    amount: tx.amount,
    currency: tx.currency,
    // Never expose reseller BWM XD wallet balance_after to customers
    balance_after: tx.ledger_type === 'customer_wallet' ? tx.balance_after : null,
    status: tx.status,
    description: tx.description,
    created_at: tx.created_at,
  };
}

async function getMyOrders(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await orderModel.findByUserId(req.user.id, { limit, offset });

    return sendSuccess(res, {
      message: 'Customer orders retrieved successfully',
      data: { orders: rows.map(sanitizeCustomerOrder) },
    });
  } catch (err) {
    return next(err);
  }
}

async function getMyTransactions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await transactionModel.findByUserId(req.user.id, { limit, offset });

    return sendSuccess(res, {
      message: 'Customer transactions retrieved successfully',
      data: { transactions: rows.map(sanitizeCustomerTransaction) },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyOrders,
  getMyTransactions,
};

