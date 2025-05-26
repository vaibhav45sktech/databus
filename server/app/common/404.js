// common/middleware/404.js

const ServerUtils = require('./utils/server-utils');

/**
 * Middleware to handle 404 Not Found errors.
 * Responds with HTML, JSON, or plain text depending on the request's Accept header.
 */
function handle404(req, res, next) {
  res.status(404);

  // HTML response
  if (req.accepts('html')) {
    const data = {
      auth: ServerUtils.getAuthInfoFromRequest(req)
    };
    return res.render('404', { title: 'Not found', data });
  }

  // JSON response
  if (req.accepts('json')) {
    return res.json({
      error: 'Not found',
      message: 'The requested resource could not be found.'
    });
  }

  // Plain text fallback
  res.type('txt').send('The requested resource could not be found.\n');
}

module.exports = handle404;
