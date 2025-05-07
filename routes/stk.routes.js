const express = require('express');
const router = express.Router();
const stkPush = require('../daraja/stkPush');

// POST /mpesa/stk
router.post('/stk', async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: 'Phone and amount required' });

  try {
    const result = await stkPush(phone, amount);
    res.status(200).json(result);
  } catch (err) {
    console.error('STK error:', err.message);
    res.status(500).json({ error: 'STK push failed' });
  }
});

// Callback endpoint
router.post('/stkcallback', (req, res) => {
  console.log('Callback received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // Safaricom expects a 200
});

module.exports = router;
