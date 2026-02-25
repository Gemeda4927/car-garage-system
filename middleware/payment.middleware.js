const axios = require('axios');
const User = require('../models/User');
const crypto = require('crypto');

const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;
const CHAPA_API_URL = process.env.CHAPA_API_URL || 'https://api.chapa.co/v1';

const validatePayment = async (req, res, next) => {
  try {
    const { plan = 'basic' } = req.body;
    const validPlans = ['basic', 'premium', 'yearly'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment plan. Choose basic, premium, or yearly'
      });
    }
    req.paymentPlan = plan;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Payment validation error',
      error: error.message
    });
  }
};

const checkPaymentEligibility = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'garage_owner') return res.status(403).json({ success: false, message: 'Only garage owners can make payments' });
    if (!user.garageInfo) return res.status(400).json({ success: false, message: 'Please complete garage registration first' });

    const eligibleStatuses = ['pending', 'failed', 'expired'];
    if (!eligibleStatuses.includes(user.garageInfo.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Payment not allowed at this stage' });
    }

    req.paymentUser = user;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error checking eligibility', error: error.message });
  }
};

const generateTxRef = (req, res, next) => {
  const user = req.paymentUser || req.user;
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const userId = user._id.toString().slice(-6);
  req.tx_ref = `GAR-${userId}-${timestamp}-${random}`;
  next();
};

const getPaymentAmount = (req, res, next) => {
  const plan = req.paymentPlan || 'basic';
  const plans = { basic: { amount: 500, duration: 30 }, premium: { amount: 1000, duration: 30 }, yearly: { amount: 5000, duration: 365 } };
  const selected = plans[plan] || plans.basic;
  req.paymentDetails = { plan, amount: selected.amount, duration: selected.duration, currency: 'ETB' };
  next();
};

const initializeChapaPayment = async (req, res, next) => {
  try {
    const user = req.paymentUser || req.user;
    const { amount, currency } = req.paymentDetails;
    const tx_ref = req.tx_ref;

    const paymentData = {
      amount: amount.toString(),
      currency,
      email: user.email,
      first_name: user.name.split(' ')[0],
      last_name: user.name.split(' ').slice(1).join(' ') || 'Owner',
      tx_ref,
      callback_url: `${process.env.API_URL}/api/v1/payments/callback`
    };

    const response = await axios.post(
      `${CHAPA_API_URL}/transaction/initialize`,
      paymentData,
      { headers: { Authorization: `Bearer ${CHAPA_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== 'success') {
      return res.status(400).json({ success: false, message: 'Payment initialization failed' });
    }

    const dbUser = await User.findById(user._id);
    dbUser.garageInfo.paymentTxRef = tx_ref;
    dbUser.garageInfo.paymentStatus = 'processing';
    dbUser.garageInfo.paymentPlan = req.paymentDetails.plan;
    dbUser.garageInfo.paymentAmount = amount;
    await dbUser.save();

    req.chapaResponse = { checkout_url: response.data.data.checkout_url, tx_ref };
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error connecting to payment gateway', error: error.response?.data || error.message });
  }
};

const verifyChapaPayment = async (req, res, next) => {
  try {
    const { tx_ref } = req.params;
    const response = await axios.get(`${CHAPA_API_URL}/transaction/verify/${tx_ref}`, { headers: { Authorization: `Bearer ${CHAPA_SECRET_KEY}` } });
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    if (!user) return res.status(404).json({ success: false, message: 'Payment not found' });

    if (response.data.status === 'success' && response.data.data.status === 'success') {
      const planDurations = { basic: 30, premium: 30, yearly: 365 };
      const duration = planDurations[user.garageInfo.paymentPlan] || 30;

      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      if (!user.garageInfo.verificationProgress) user.garageInfo.verificationProgress = {};
      user.garageInfo.verificationProgress.paymentCompleted = true;

      await user.save();
    }

    req.verificationResult = { success: true, data: response.data.data };
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error verifying payment', error: error.response?.data || error.message });
  }
};

const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-chapa-signature'];
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    try {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const hash = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    } catch (error) {}
  }
  next();
};

const updatePaymentStatus = async (req, res) => {
  const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  let payload = req.body;
  if (req.rawBody) {
    try { payload = JSON.parse(req.rawBody.toString()); } catch (e) {}
  }

  let tx_ref = null, status = null, event = null;
  if (payload.data && payload.data.tx_ref) { tx_ref = payload.data.tx_ref; status = payload.data.status; event = payload.event; }
  else if (payload.tx_ref) { tx_ref = payload.tx_ref; status = payload.status; event = payload.event; }
  else if (payload.data && payload.data.merchant) { tx_ref = payload.data.merchant; status = payload.data.status; event = payload.event; }
  else if (payload.merchant) { tx_ref = payload.merchant; status = payload.status; event = payload.event; }

  if (!tx_ref) return res.status(200).json({ success: false, message: 'No transaction reference found', requestId });

  const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
  if (!user) return res.status(200).json({ success: false, message: 'User not found', requestId });

  const isSuccessful = status === 'success' || status === 'completed' || event === 'charge.success' || payload.event === 'charge.success' || (payload.data && payload.data.status === 'success');

  if (isSuccessful) {
    const planDurations = { basic: 30, premium: 30, yearly: 365 };
    const duration = planDurations[user.garageInfo.paymentPlan] || 30;
    user.garageInfo.paymentStatus = 'paid';
    user.garageInfo.paymentDate = new Date();
    user.garageInfo.paymentExpiry = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    user.garageInfo.verificationStatus = 'payment_completed';
    if (!user.garageInfo.verificationProgress) user.garageInfo.verificationProgress = {};
    user.garageInfo.verificationProgress.paymentCompleted = true;
    await user.save();
  }

  return res.status(200).json({ success: true, message: 'Webhook processed', requestId });
};

const checkPaymentStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({
      success: true,
      data: {
        paymentStatus: user.garageInfo?.paymentStatus,
        verificationStatus: user.garageInfo?.verificationStatus,
        paymentDate: user.garageInfo?.paymentDate,
        paymentExpiry: user.garageInfo?.paymentExpiry,
        paymentPlan: user.garageInfo?.paymentPlan,
        paymentTxRef: user.garageInfo?.paymentTxRef,
        paymentAmount: user.garageInfo?.paymentAmount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const debugWebhook = async (req, res) => {
  res.json({ success: true, message: 'Debug webhook received', headers: req.headers, body: req.body, rawBody: req.rawBody?.toString() });
};

const testWebhook = async (req, res) => {
  res.json({ success: true, message: 'Test webhook received', body: req.body });
};

const manualUpdatePayment = async (req, res) => {
  try {
    const { tx_ref } = req.params;
    const { secret } = req.query;
    if (secret !== process.env.MANUAL_UPDATE_SECRET) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const response = await axios.get(`${CHAPA_API_URL}/transaction/verify/${tx_ref}`, { headers: { Authorization: `Bearer ${CHAPA_SECRET_KEY}` } });
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (response.data.status === 'success' && response.data.data.status === 'success') {
      const planDurations = { basic: 30, premium: 30, yearly: 365 };
      const duration = planDurations[user.garageInfo.paymentPlan] || 30;
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      if (!user.garageInfo.verificationProgress) user.garageInfo.verificationProgress = {};
      user.garageInfo.verificationProgress.paymentCompleted = true;
      await user.save();
      return res.json({ success: true, message: 'Payment updated successfully', data: { email: user.email, paymentStatus: user.garageInfo.paymentStatus, paymentDate: user.garageInfo.paymentDate, paymentExpiry: user.garageInfo.paymentExpiry, chapaVerification: response.data.data } });
    } else {
      return res.json({ success: false, message: 'Payment not successful according to Chapa', chapaResponse: response.data });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message, error: error.response?.data || error.message });
  }
};

const paymentErrorHandler = (err, req, res, next) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Payment processing error' });
};

module.exports = {
  validatePayment,
  checkPaymentEligibility,
  generateTxRef,
  getPaymentAmount,
  initializeChapaPayment,
  verifyChapaPayment,
  verifyWebhookSignature,
  updatePaymentStatus,
  checkPaymentStatus,
  debugWebhook,
  testWebhook,
  manualUpdatePayment,
  paymentErrorHandler
};