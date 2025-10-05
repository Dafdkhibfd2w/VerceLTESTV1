const app = require('../server');

module.exports = (req, res) => {
  const before = req.url;
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  console.log(`[VERCEL API] ${req.method} ${before} -> ${req.url}`);
  res.setHeader('x-debug-before', before);
  res.setHeader('x-debug-after', req.url);
  return app(req, res);
};
