// db.js
const mongoose = require('mongoose');

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI missing in environment');
}

// Cache גלובלי בין אינבוקציות חמות של Vercel
let cached = globalThis.__mongoose;
if (!cached) {
  cached = globalThis.__mongoose = { conn: null, promise: null };
}

async function connectMongoose() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 5,                 // מתאים ל-serverless
      minPoolSize: 0,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 20000
    }).then((m) => {
      return m;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectMongoose };
