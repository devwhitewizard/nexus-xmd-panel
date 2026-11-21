const providerAssignmentService = require('../services/providerAssignment.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

/**
 * Admin: List all providers with declared vs implemented capabilities and enabled status.
 */
async function listProviders(req, res, next) {
  try {
    const providers = await providerAssignmentService.listProvidersWithStatus();
    return sendSuccess(res, {
      message: 'Providers and capabilities retrieved successfully',
      data: { providers },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: List package provider assignments.
 */
async function listAssignments(req, res, next) {
  try {
    const assignments = await providerAssignmentService.listPackageAssignmentsAdmin();
    return sendSuccess(res, {
      message: 'Package provider assignments retrieved successfully',
      data: { assignments },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: View a single package's provider assignment and availability status.
 */
async function getAssignment(req, res, next) {
  try {
    const assignment = await providerAssignmentService.getPackageAssignmentAdmin(
      req.params.packageId
    );
    return sendSuccess(res, {
      message: 'Package provider assignment retrieved successfully',
      data: { assignment },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Assign or update a package's provider and connection for future orders.
 */
async function assignProvider(req, res, next) {
  try {
    const assignment = await providerAssignmentService.assignProviderToPackage(
      req.user,
      req.params.packageId,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Package provider assignment updated successfully',
      data: { assignment },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Validate a package's provider assignment without modifying it.
 */
async function validateAssignment(req, res, next) {
  try {
    const validation = await providerAssignmentService.validatePackageAssignmentAdmin(
      req.params.packageId
    );
    return sendSuccess(res, {
      message: 'Package provider assignment is valid',
      data: validation,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listProviders,
  listAssignments,
  getAssignment,
  assignProvider,
  validateAssignment,
};

