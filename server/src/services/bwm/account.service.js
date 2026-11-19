const bwmClient = require('./bwm.client');

/**
 * Unwrap BWM response payload whether BWM returns `{ data: ... }` or direct fields.
 */
function unwrapPayload(response) {
  if (response && typeof response === 'object' && response.data && typeof response.data === 'object') {
    return response.data;
  }
  return response || {};
}

async function getBalance() {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/account/balance',
    isPaid: false,
  });

  const payload = unwrapPayload(raw);

  return {
    username: payload.username ?? null,
    email: payload.email ?? null,
    xd_balance:
      payload.wallet_balance_xd ?? payload.xd_balance ?? payload.balance ?? payload.wallet_balance ?? null,
    referral_balance: payload.referral_balance_xd ?? payload.referral_balance ?? payload.referral ?? null,
    currency: payload.currency ?? 'XD',
    local_currency: payload.local_currency
      ? {
          code: payload.local_currency,
          country: payload.local_country ?? null,
          symbol: payload.local_symbol ?? null,
          wallet_balance: payload.wallet_balance_local ?? null,
          referral_balance: payload.referral_balance_local ?? null,
        }
      : payload.currency ?? null,
    usage: payload.api_usage ?? payload.usage ?? payload.stats ?? null,
    raw: payload,
  };
}

async function getOrders(params = {}) {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/account/orders',
    params: {
      limit: 200,
      ...params,
    },
    isPaid: false,
  });

  const payload = unwrapPayload(raw);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.orders)
      ? payload.orders
      : Array.isArray(payload.calls)
        ? payload.calls
        : Array.isArray(payload.items)
          ? payload.items
          : [];

  const limitedItems = items.slice(0, 200).map((entry) => ({
    ...entry,
    timestamp: entry.timestamp ?? entry.created_at ?? entry.date ?? null,
    charged_xd: entry.charged_xd ?? entry.xd_charged ?? entry.cost_xd ?? entry.amount ?? null,
  }));

  return {
    total: limitedItems.length,
    orders: limitedItems,
    summary: !Array.isArray(payload) ? payload.summary ?? null : null,
  };
}

module.exports = {
  getBalance,
  getOrders,
};

