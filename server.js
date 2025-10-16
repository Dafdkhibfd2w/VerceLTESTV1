const app = require("./app");
const PORT = process.env.PORT || 8080;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server listening on :${PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
module.exports = app;