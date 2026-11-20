const bwmClient = require('./bwm.client');

function unwrapPayload(response) {
  if (response && typeof response === 'object' && response.data !== undefined) {
    return response.data;
  }
  return response;
}

async function getRates() {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/currency/rates',
    isPaid: false,
  });
  return unwrapPayload(raw);
}

async function convert({ amount, from, to }) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: '/currency/convert',
    data: { amount, from, to },
    isPaid: false,
  });
  return unwrapPayload(raw);
}

module.exports = {
  getRates,
  convert,
};

