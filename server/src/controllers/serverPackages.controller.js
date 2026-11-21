const serverPackageService = require('../services/serverPackage.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

/**
 * Admin: Create a new server package.
 */
async function createPackage(req, res, next) {
  try {
    const pkg = await serverPackageService.createPackage(
      req.user,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Server package created successfully',
      data: { package: pkg },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: List all server packages with availability diagnostics.
 */
async function listPackagesAdmin(req, res, next) {
  try {
    const packages = await serverPackageService.listAllPackagesAdmin();
    return sendSuccess(res, {
      message: 'Server packages retrieved successfully',
      data: { packages },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Retrieve a single package with availability diagnostics.
 */
async function getPackageAdmin(req, res, next) {
  try {
    const pkg = await serverPackageService.getPackageAdmin(req.params.id);
    return sendSuccess(res, {
      message: 'Server package retrieved successfully',
      data: { package: pkg },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Update an existing package.
 */
async function updatePackage(req, res, next) {
  try {
    const pkg = await serverPackageService.updatePackage(
      req.user,
      req.params.id,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Server package updated successfully',
      data: { package: pkg },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Enable or disable a package.
 */
async function setPackageStatus(req, res, next) {
  try {
    const pkg = await serverPackageService.setPackageStatus(
      req.user,
      req.params.id,
      req.validatedBody.is_enabled,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: `Server package ${pkg.is_enabled ? 'enabled' : 'disabled'} successfully`,
      data: { package: pkg },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Delete a package when no dependent servers or orders exist.
 */
async function deletePackage(req, res, next) {
  try {
    const result = await serverPackageService.deletePackage(
      req.user,
      req.params.id,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Server package deleted successfully',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Customer: List currently enabled and available packages.
 */
async function listPackagesCustomer(req, res, next) {
  try {
    const packages = await serverPackageService.listAvailablePackagesForCustomer();
    return sendSuccess(res, {
      message: 'Available server packages retrieved successfully',
      data: { packages },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Customer: View a single enabled and available package.
 */
async function getPackageCustomer(req, res, next) {
  try {
    const pkg = await serverPackageService.getAvailablePackageForCustomer(req.params.id);
    return sendSuccess(res, {
      message: 'Server package retrieved successfully',
      data: { package: pkg },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPackage,
  listPackagesAdmin,
  getPackageAdmin,
  updatePackage,
  setPackageStatus,
  deletePackage,
  listPackagesCustomer,
  getPackageCustomer,
};

