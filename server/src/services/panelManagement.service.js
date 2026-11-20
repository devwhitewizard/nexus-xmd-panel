const panelServerModel = require('../models/panelServer.model');
const orderModel = require('../models/order.model');
const transactionModel = require('../models/transaction.model');
const auditLogModel = require('../models/auditLog.model');
const bwmPanelsService = require('./bwm/panels.service');

async function getPlans() {
  return bwmPanelsService.getPlans();
}

async function listMyPanels(user) {
  if (user.role === 'admin') {
    return panelServerModel.findAll();
  }
  return panelServerModel.findByUserId(user.id);
}

async function provisionPanel(user, { username, password, plan }, reqMeta = {}) {
  const order = await orderModel.createOrder({
    userId: user.id,
    serviceType: 'panel_provision',
    status: 'pending',
    requestPayload: { username, plan },
  });

  try {
    const bwmResult = await bwmPanelsService.provisionPanel({ username, password, plan });
    const serverData =
      bwmResult?.server && typeof bwmResult.server === 'object' ? bwmResult.server : bwmResult;

    const bwmPanelId = serverData?.id ?? serverData?.panel_id ?? serverData?.server_id ?? null;
    const panelUrl =
      serverData?.panel_url ?? serverData?.url ?? serverData?.login_url ?? null;
    const planName = serverData?.plan_name ?? serverData?.plan?.name ?? plan;
    const chargedXd =
      bwmResult?.charged_xd ?? bwmResult?.cost_xd ?? bwmResult?.amount_xd ?? null;
    const balanceAfter =
      bwmResult?.balance_after ?? bwmResult?.xd_balance_after ?? null;
    const orderRef =
      bwmResult?.order_id ?? bwmResult?.transaction_id ?? bwmResult?.reference ?? null;

    const savedServer = await panelServerModel.createPanelServer({
      userId: user.id,
      orderId: order.id,
      bwmPanelId,
      planId: plan,
      planName,
      panelUrl,
      username: serverData?.username || username,
      status: serverData?.status || 'active',
      bwmMetadata: serverData || {},
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
        description: `Panel server provisioned: ${plan} (${username})`,
      });
    }

    await auditLogModel.createAuditLog({
      userId: user.id,
      action: 'PANEL_PROVISIONED',
      resourceType: 'panel_server',
      resourceId: savedServer.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: { plan, username, charged_xd: chargedXd },
    });

    return {
      server: savedServer,
      panel_credentials: {
        panel_url: panelUrl,
        username: serverData?.username || username,
        ...(serverData?.password ? { password: serverData.password } : {}),
      },
      billing: {
        order_id: order.id,
        charged_xd: chargedXd,
        balance_after: balanceAfter,
      },
    };
  } catch (err) {
    if (err.isUncertain) {
      await orderModel.updateOrder(order.id, {
        status: 'uncertain',
        errorMessage: err.message,
        bwmResponse: err.details || {},
      });

      await transactionModel.createTransaction({
        userId: user.id,
        orderId: order.id,
        ledgerType: 'bwm_xd',
        direction: 'debit',
        amount: 0,
        currency: 'XD',
        status: 'uncertain',
        description: `Panel provision ${plan} (uncertain outcome - verify before retrying)`,
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
      userId: user.id,
      action: 'PANEL_PROVISION_FAILED',
      resourceType: 'order',
      resourceId: order.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: err.isUncertain ? 'uncertain' : 'failed',
      details: { code: err.code, message: err.message, plan },
    });

    throw err;
  }
}

module.exports = {
  getPlans,
  listMyPanels,
  provisionPanel,
};

