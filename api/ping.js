module.exports = (req, res) => {
  res.status(200).json({ ok: true, where: 'vercel-fn', url: req.url });
};
