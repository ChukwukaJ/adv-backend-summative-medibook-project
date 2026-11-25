'use strict';

const { renderFeedbackPage } = require('../services/feedbackPage');

const show = (req, res) => {
  res.type('html').send(renderFeedbackPage(req.query.lang));
};

module.exports = { show };
