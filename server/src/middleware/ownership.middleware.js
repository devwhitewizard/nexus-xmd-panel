const botModel = require('../models/bot.model');
const { NotFoundError, ForbiddenError, UnauthorizedError } = require('../utils/errors');

async function requireBotOwnership(req, res, next) {
  try {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const { id } = req.params;
    const bot = await botModel.findByIdOrBwmId(id);

    if (!bot) {
      return next(new NotFoundError('Bot not found'));
    }

    if (req.user.role !== 'admin' && bot.user_id !== req.user.id) {
      return next(new ForbiddenError('You do not have access to this bot'));
    }

    req.bot = bot;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireBotOwnership,
};

