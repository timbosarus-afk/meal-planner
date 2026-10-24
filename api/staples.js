// Vercel serverless function for the Pantry (formerly the staples list).
// Kept at /api/staples so existing callers keep working; logic lives in
// lib/pantry.js. See that file for the full set of operations.
const pantry = require('../lib/pantry');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return pantry(req, res);
};
