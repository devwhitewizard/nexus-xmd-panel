const accountService = require('../services/bwm/account.service');
const bwmBotsService = require('../services/bwm/bots.service');

async function main() {
  console.log('--- Fetching BWM XMD Account Details (Read-Only) ---\n');

  try {
    const balance = await accountService.getBalance();
    console.log('1. Account Balance:');
    console.log(JSON.stringify(balance, null, 2));
  } catch (err) {
    console.error('Failed to fetch /account/balance:', err.statusCode || '', err.message, err.details || '');
  }

  console.log('\n--------------------------------------------------\n');

  try {
    const orders = await accountService.getOrders();
    console.log(`2. Recent BWM API Calls (Total returned: ${orders.total}):`);
    console.log(JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to fetch /account/orders:', err.statusCode || '', err.message, err.details || '');
  }

  console.log('\n--------------------------------------------------\n');

  try {
    const pricing = await bwmBotsService.getPricing();
    console.log('3. Live Bot Pricing Tiers:');
    console.log(JSON.stringify(pricing, null, 2));
  } catch (err) {
    console.error('Failed to fetch /bots/pricing:', err.statusCode || '', err.message, err.details || '');
  }

  console.log('\n--------------------------------------------------\n');

  try {
    const templates = await bwmBotsService.getTemplates();
    console.log('4. Available Bot Templates:');
    console.log(JSON.stringify(templates, null, 2));
  } catch (err) {
    console.error('Failed to fetch /bots/templates:', err.statusCode || '', err.message, err.details || '');
  }
}

main();

