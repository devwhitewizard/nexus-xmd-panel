const botModel = require('../models/bot.model');
const orderModel = require('../models/order.model');
const transactionModel = require('../models/transaction.model');
const auditLogModel = require('../models/auditLog.model');
const bwmBotsService = require('./bwm/bots.service');
const { BadRequestError, ForbiddenError } = require('../utils/errors');

function extractBillingFields(bwmResponse) {
  if (!bwmResponse || typeof bwmResponse !== 'object') {
    return { chargedXd: null, balanceAfter: null, orderRef: null };
  }
  return {
    chargedXd: bwmResponse.charged_xd ?? bwmResponse.cost_xd ?? bwmResponse.amount_xd ?? null,
    balanceAfter: bwmResponse.balance_after ?? bwmResponse.xd_balance_after ?? null,
    orderRef: bwmResponse.order_id ?? bwmResponse.transaction_id ?? bwmResponse.reference ?? null,
  };
}

function formatBotRecord(dbBot, liveBot = null) {
  const expiresAt = liveBot?.expires_at || dbBot.expires_at;
  return {
    id: dbBot.id,
    user_id: dbBot.user_id,
    bwm_bot_id: dbBot.bwm_bot_id,
    app_name: liveBot?.app_name || dbBot.app_name,
    custom_name: liveBot?.custom_name || dbBot.custom_name,
    template_id: liveBot?.template_id || dbBot.template_id,
    status: liveBot?.status || dbBot.status,
    deployed_at: liveBot?.created_at || dbBot.deployed_at,
    expires_at: expiresAt,
    days_remaining: bwmBotsService.calculateDaysRemaining(expiresAt),
    last_synced_at: dbBot.last_synced_at,
    created_at: dbBot.created_at,
    updated_at: dbBot.updated_at,
  };
}

async function recordPaidOperationFailure({ order, userId, serviceType, err, description, reqMeta }) {
  if (err.isUncertain) {
    await orderModel.updateOrder(order.id, {
      status: 'uncertain',
      errorMessage: err.message,
      bwmResponse: err.details || {},
    });

    await transactionModel.createTransaction({
      userId,
      orderId: order.id,
      ledgerType: 'bwm_xd',
      direction: 'debit',
      amount: 0,
      currency: 'XD',
      status: 'uncertain',
      description: `${description} (uncertain outcome - requires reconciliation)`,
      metadata: err.details || {},
    });
  } else {
    await orderModel.updateOrder(order.id, {
      status: 'failed',
      errorMessage: err.message,
      bwmResponse: err.details || {},
    });
  }

  await auditLogModel.createAuditLog({
    userId,
    action: `${serviceType.toUpperCase()}_FAILED`,
    resourceType: 'order',
    resourceId: order.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: err.isUncertain ? 'uncertain' : 'failed',
    details: { code: err.code, message: err.message },
  });
}

async function deployBot(user, payload, reqMeta = {}) {
  const order = await orderModel.createOrder({
    userId: user.id,
    serviceType: 'bot_deploy',
    status: 'pending',
    days: payload.days,
    requestPayload: payload,
  });

  try {
    const bwmResult = await bwmBotsService.deployBot(payload);
    const botData = bwmResult?.bot && typeof bwmResult.bot === 'object' ? bwmResult.bot : bwmResult;
    const bwmBotId = botData?.id ?? botData?.bot_id ?? payload.app_name;
    const { chargedXd, balanceAfter, orderRef } = extractBillingFields(bwmResult);

    const dbBot = await botModel.createBot({
      userId: user.id,
      bwmBotId,
      appName: botData?.app_name || payload.app_name,
      customName: botData?.custom_name || payload.custom_name || null,
      templateId: botData?.template_id || payload.template_id || null,
      status: botData?.status || 'deploying',
      deployedAt: botData?.created_at || new Date().toISOString(),
      expiresAt: botData?.expires_at || null,
      bwmMetadata: botData || {},
    });

    await orderModel.updateOrder(order.id, {
      botId: dbBot.id,
      bwmOrderRef: orderRef ? String(orderRef) : null,
      status: 'completed',
      chargedXd,
      balanceAfter,
      bwmResponse: bwmResult,
    });

    if (chargedXd !== null && chargedXd !== undefined) {
      await transactionModel.createTransaction({
        userId: user.id,
        orderId: order.id,
        ledgerType: 'bwm_xd',
        direction: 'debit',
        amount: chargedXd,
        currency: 'XD',
        balanceAfter,
        bwmReference: orderRef ? String(orderRef) : null,
        status: 'completed',
        description: `Bot deployment: ${dbBot.app_name} (${payload.days} days)`,
      });
    }

    await auditLogModel.createAuditLog({
      userId: user.id,
      action: 'BOT_DEPLOYED',
      resourceType: 'bot',
      resourceId: dbBot.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: { app_name: dbBot.app_name, days: payload.days, charged_xd: chargedXd },
    });

    return {
      bot: formatBotRecord(dbBot, botData),
      billing: {
        order_id: order.id,
        charged_xd: chargedXd,
        balance_after: balanceAfter,
      },
    };
  } catch (err) {
    await recordPaidOperationFailure({
      order,
      userId: user.id,
      serviceType: 'bot_deploy',
      err,
      description: `Bot deployment: ${payload.app_name}`,
      reqMeta,
    });
    throw err;
  }
}

async function recoverBot(user, payload, reqMeta = {}) {
  const order = await orderModel.createOrder({
    userId: user.id,
    serviceType: 'bot_recover',
    status: 'pending',
    requestPayload: payload,
  });

  try {
    const bwmResult = await bwmBotsService.recoverBot(payload);
    const botData = bwmResult?.bot && typeof bwmResult.bot === 'object' ? bwmResult.bot : bwmResult;
    const bwmBotId = botData?.id ?? botData?.bot_id ?? payload.bot_id ?? payload.app_name;
    const { chargedXd, balanceAfter, orderRef } = extractBillingFields(bwmResult);

    let dbBot = bwmBotId ? await botModel.findByBwmBotId(bwmBotId) : null;
    if (!dbBot && bwmBotId) {
      dbBot = await botModel.createBot({
        userId: user.id,
        bwmBotId,
        appName: botData?.app_name || payload.app_name || String(bwmBotId),
        customName: botData?.custom_name || payload.custom_name || null,
        templateId: botData?.template_id || null,
        status: botData?.status || 'active',
        deployedAt: botData?.created_at || new Date().toISOString(),
        expiresAt: botData?.expires_at || null,
        bwmMetadata: botData || {},
      });
    } else if (dbBot) {
      if (user.role !== 'admin' && dbBot.user_id !== user.id) {
        throw new ForbiddenError('Recovered bot belongs to another customer');
      }
      dbBot = await botModel.updateBotById(dbBot.id, {
        status: botData?.status || dbBot.status,
        expiresAt: botData?.expires_at || dbBot.expires_at,
        bwmMetadata: botData || {},
      });
    }

    await orderModel.updateOrder(order.id, {
      botId: dbBot ? dbBot.id : null,
      bwmOrderRef: orderRef ? String(orderRef) : null,
      status: 'completed',
      chargedXd,
      balanceAfter,
      bwmResponse: bwmResult,
    });

    if (chargedXd !== null && chargedXd !== undefined) {
      await transactionModel.createTransaction({
        userId: user.id,
        orderId: order.id,
        ledgerType: 'bwm_xd',
        direction: 'debit',
        amount: chargedXd,
        currency: 'XD',
        balanceAfter,
        bwmReference: orderRef ? String(orderRef) : null,
        status: 'completed',
        description: `Bot recovery: ${dbBot?.app_name || payload.app_name || bwmBotId}`,
      });
    }

    await auditLogModel.createAuditLog({
      userId: user.id,
      action: 'BOT_RECOVERED',
      resourceType: 'bot',
      resourceId: dbBot?.id || bwmBotId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: { charged_xd: chargedXd },
    });

    return {
      bot: dbBot ? formatBotRecord(dbBot, botData) : botData,
      billing: {
        order_id: order.id,
        charged_xd: chargedXd,
        balance_after: balanceAfter,
      },
    };
  } catch (err) {
    await recordPaidOperationFailure({
      order,
      userId: user.id,
      serviceType: 'bot_recover',
      err,
      description: 'Bot recovery',
      reqMeta,
    });
    throw err;
  }
}

async function listBots(user) {
  const dbBots =
    user.role === 'admin'
      ? await botModel.findAllActive()
      : await botModel.findByUserId(user.id);

  return dbBots.map((bot) => formatBotRecord(bot));
}

async function getBot(bot) {
  const liveBot = await bwmBotsService.getBot(bot.bwm_bot_id);
  const updated = await botModel.updateBotById(bot.id, {
    status: liveBot?.status || bot.status,
    expiresAt: liveBot?.expires_at || bot.expires_at,
    customName: liveBot?.custom_name || bot.custom_name,
    bwmMetadata: liveBot || {},
  });
  return formatBotRecord(updated || bot, liveBot);
}

async function startBot(user, bot, reqMeta = {}) {
  const result = await bwmBotsService.startBot(bot.bwm_bot_id);
  await botModel.updateBotById(bot.id, {
    status: result?.status || 'running',
  });
  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'BOT_STARTED',
    resourceType: 'bot',
    resourceId: bot.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });
  return result;
}

async function stopBot(user, bot, reqMeta = {}) {
  const result = await bwmBotsService.stopBot(bot.bwm_bot_id);
  await botModel.updateBotById(bot.id, {
    status: result?.status || 'stopped',
  });
  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'BOT_STOPPED',
    resourceType: 'bot',
    resourceId: bot.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });
  return result;
}

async function restartBot(user, bot, reqMeta = {}) {
  const result = await bwmBotsService.restartBot(bot.bwm_bot_id);
  await botModel.updateBotById(bot.id, {
    status: result?.status || 'running',
  });
  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'BOT_RESTARTED',
    resourceType: 'bot',
    resourceId: bot.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });
  return result;
}

async function extendBot(user, bot, { days }, reqMeta = {}) {
  const order = await orderModel.createOrder({
    userId: user.id,
    botId: bot.id,
    serviceType: 'bot_extend',
    status: 'pending',
    days,
    requestPayload: { bot_id: bot.id, bwm_bot_id: bot.bwm_bot_id, days },
  });

  try {
    const bwmResult = await bwmBotsService.extendBot(bot.bwm_bot_id, { days });
    const { chargedXd, balanceAfter, orderRef } = extractBillingFields(bwmResult);
    const newExpiresAt = bwmResult?.expires_at || bwmResult?.bot?.expires_at || null;

    const updatedBot = await botModel.updateBotById(bot.id, {
      expiresAt: newExpiresAt,
      status: bwmResult?.status || bot.status,
      bwmMetadata: bwmResult || {},
    });

    await orderModel.updateOrder(order.id, {
      bwmOrderRef: orderRef ? String(orderRef) : null,
      status: 'completed',
      chargedXd,
      balanceAfter,
      bwmResponse: bwmResult,
    });

    if (chargedXd !== null && chargedXd !== undefined) {
      await transactionModel.createTransaction({
        userId: user.id,
        orderId: order.id,
        ledgerType: 'bwm_xd',
        direction: 'debit',
        amount: chargedXd,
        currency: 'XD',
        balanceAfter,
        bwmReference: orderRef ? String(orderRef) : null,
        status: 'completed',
        description: `Bot extension: ${bot.app_name} (+${days} days)`,
      });
    }

    await auditLogModel.createAuditLog({
      userId: user.id,
      action: 'BOT_EXTENDED',
      resourceType: 'bot',
      resourceId: bot.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      details: { days, charged_xd: chargedXd, expires_at: newExpiresAt },
    });

    return {
      bot: formatBotRecord(updatedBot || bot, bwmResult),
      billing: {
        order_id: order.id,
        charged_xd: chargedXd,
        balance_after: balanceAfter,
      },
    };
  } catch (err) {
    await recordPaidOperationFailure({
      order,
      userId: user.id,
      serviceType: 'bot_extend',
      err,
      description: `Bot extension: ${bot.app_name}`,
      reqMeta,
    });
    throw err;
  }
}

async function getBotLogs(bot, params) {
  return bwmBotsService.getBotLogs(bot.bwm_bot_id, params);
}

async function getBotVars(bot) {
  return bwmBotsService.getBotVars(bot.bwm_bot_id);
}

async function updateBotVars(user, bot, envVars, reqMeta = {}) {
  const result = await bwmBotsService.updateBotVars(bot.bwm_bot_id, envVars);
  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'BOT_VARS_UPDATED',
    resourceType: 'bot',
    resourceId: bot.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { updated_keys: Object.keys(envVars) },
  });
  return result;
}

async function deleteBot(user, bot, { recoveryAuthorized = false, reason = '' } = {}, reqMeta = {}) {
  // Delete bots only through an authorized recovery workflow
  if (user.role !== 'admin' && !recoveryAuthorized) {
    throw new ForbiddenError(
      'Bot deletion is only permitted through an authorized recovery workflow',
      {},
      'RECOVERY_AUTHORIZATION_REQUIRED'
    );
  }

  if (!recoveryAuthorized) {
    throw new BadRequestError(
      'recovery_authorized=true is required to delete a bot via the recovery workflow',
      {},
      'RECOVERY_WORKFLOW_REQUIRED'
    );
  }

  const result = await bwmBotsService.deleteBot(bot.bwm_bot_id);
  await botModel.softDeleteBot(bot.id);

  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'BOT_DELETED_RECOVERY',
    resourceType: 'bot',
    resourceId: bot.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { bwm_bot_id: bot.bwm_bot_id, reason },
  });

  return result;
}

module.exports = {
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

