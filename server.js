const app = require("./app");
const PORT = process.env.PORT || 8080;

const vercel = false; // שנה ל-true אם רוצים export בלבד
if (vercel) {
  module.exports = app;
} else {
  app.listen(PORT, () => console.log(`🚀 Server listening on :${PORT}`));
}
