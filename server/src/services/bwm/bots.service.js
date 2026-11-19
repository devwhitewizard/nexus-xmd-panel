const bwmClient = require('./bwm.client');

function unwrapPayload(response) {
  if (response && typeof response === 'object' && response.data !== undefined) {
    return response.data;
  }
  return response;
}

function calculateDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return null;
  const diffMs = expiryMs - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

async function getPricing() {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/bots/pricing',
  });
  return unwrapPayload(raw);
}

async function getTemplates() {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/bots/templates',
  });
  return unwrapPayload(raw);
}

async function deployBot({ app_name, session_id, days, custom_name, template_id }) {
  const payload = {
    app_name,
    session_id,
    days,
    ...(custom_name !== undefined ? { custom_name } : {}),
    ...(template_id !== undefined ? { template_id } : {}),
  };

  const raw = await bwmClient.request({
    method: 'POST',
    url: '/bots/deploy',
    data: payload,
    isPaid: true,
  });
  return unwrapPayload(raw);
}

async function recoverBot(payload) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: '/bots/recover',
    data: payload,
    isPaid: true,
  });
  return unwrapPayload(raw);
}

async function listBots(params = {}) {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/bots',
    params,
  });
  const data = unwrapPayload(raw);
  const bots = Array.isArray(data)
    ? data
    : Array.isArray(data?.bots)
      ? data.bots
      : [];

  return bots.map((bot) => ({
    ...bot,
    days_remaining: calculateDaysRemaining(bot.expires_at),
  }));
}

async function getBot(id) {
  const raw = await bwmClient.request({
    method: 'GET',
    url: `/bots/${encodeURIComponent(id)}`,
  });
  const bot = unwrapPayload(raw);
  if (bot && typeof bot === 'object') {
    return {
      ...bot,
      days_remaining: calculateDaysRemaining(bot.expires_at),
    };
  }
  return bot;
}

async function startBot(id) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: `/bots/${encodeURIComponent(id)}/start`,
  });
  return unwrapPayload(raw);
}

async function stopBot(id) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: `/bots/${encodeURIComponent(id)}/stop`,
  });
  return unwrapPayload(raw);
}

async function restartBot(id) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: `/bots/${encodeURIComponent(id)}/restart`,
  });
  return unwrapPayload(raw);
}

async function extendBot(id, { days }) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: `/bots/${encodeURIComponent(id)}/extend`,
    data: { days },
    isPaid: true,
  });
  return unwrapPayload(raw);
}

async function getBotLogs(id, params = {}) {
  const raw = await bwmClient.request({
    method: 'GET',
    url: `/bots/${encodeURIComponent(id)}/logs`,
    params,
  });
  return unwrapPayload(raw);
}

async function getBotVars(id) {
  const raw = await bwmClient.request({
    method: 'GET',
    url: `/bots/${encodeURIComponent(id)}/vars`,
  });
  return unwrapPayload(raw);
}

async function updateBotVars(id, envVars) {
  const raw = await bwmClient.request({
    method: 'PUT',
    url: `/bots/${encodeURIComponent(id)}/vars`,
    data: { env_vars: envVars },
  });
  return unwrapPayload(raw);
}

async function deleteBot(id) {
  const raw = await bwmClient.request({
    method: 'DELETE',
    url: `/bots/${encodeURIComponent(id)}`,
  });
  return unwrapPayload(raw);
}

module.exports = {
  calculateDaysRemaining,
  getPricing,
  getTemplates,
  deployBot,
  recoverBot,
  listBots,
  getBot,
  startBot,
  stopBot,
  restartBot,
  extendBot,
  getBotLogs,
  getBotVars,
  updateBotVars,
  deleteBot,
};

