const bwmClient = require('./bwm.client');

function unwrapPayload(response) {
  if (response && typeof response === 'object' && response.data !== undefined) {
    return response.data;
  }
  return response;
}

async function getPlans() {
  const raw = await bwmClient.request({
    method: 'GET',
    url: '/panel/plans',
    isPaid: false,
  });
  return unwrapPayload(raw);
}

async function provisionPanel({ username, password, plan }) {
  const raw = await bwmClient.request({
    method: 'POST',
    url: '/panel/provision',
    data: { username, password, plan },
    isPaid: true,
  });
  return unwrapPayload(raw);
}

module.exports = {
  getPlans,
  provisionPanel,
};

