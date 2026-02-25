const express = require('express');
const router = express.Router();

const {
  protect,
  authorize
} = require('../controllers/auth.controller');

const {
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
} = require('../middleware/payment.middleware');

const User = require('../models/User');

router.post('/callback', updatePaymentStatus);
router.post('/debug-webhook', debugWebhook);
router.post('/test-webhook', testWebhook);

router.get('/manual-update/:tx_ref', manualUpdatePayment);

router.post(
  '/initialize',
  protect,
  authorize('garage_owner'),
  validatePayment,
  checkPaymentEligibility,
  generateTxRef,
  getPaymentAmount,
  initializeChapaPayment,
  async (req, res) => {
    try {
      res.json({
        success: true,
        message: 'Payment initialized successfully',
        data: {
          checkout_url: req.chapaResponse.checkout_url,
          tx_ref: req.tx_ref,
          amount: req.paymentDetails.amount,
          plan: req.paymentDetails.plan
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error saving payment reference',
        error: error.message
      });
    }
  }
);

router.get(
  '/verify/:tx_ref',
  protect,
  verifyChapaPayment,
  async (req, res) => {
    try {
      const { tx_ref } = req.params;
      const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });

      res.json({
        success: true,
        data: {
          verified: req.verificationResult?.success || false,
          paymentDetails: req.verificationResult?.data || null,
          userStatus: user?.garageInfo?.verificationStatus || 'unknown',
          paymentStatus: user?.garageInfo?.paymentStatus || 'unknown',
          tx_ref: tx_ref
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error verifying payment',
        error: error.message
      });
    }
  }
);

router.get('/status', protect, checkPaymentStatus);

router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'basic',
      name: 'Basic Listing',
      amount: parseInt(process.env.BASIC_PLAN_AMOUNT) || 500,
      currency: 'ETB',
      duration: '30 days',
      features: [
        'Garage profile listing',
        'Basic search visibility',
        'Contact information display',
        'Up to 5 service listings'
      ]
    },
    {
      id: 'premium',
      name: 'Premium Listing',
      amount: parseInt(process.env.PREMIUM_PLAN_AMOUNT) || 1000,
      currency: 'ETB',
      duration: '30 days',
      features: [
        'All Basic features',
        'Featured placement',
        'Priority in search results',
        'Unlimited service listings',
        'Customer reviews displayed',
        'Analytics dashboard'
      ]
    },
    {
      id: 'yearly',
      name: 'Yearly Premium',
      amount: parseInt(process.env.YEARLY_PLAN_AMOUNT) || 5000,
      currency: 'ETB',
      duration: '365 days',
      features: [
        'All Premium features',
        '20% discount compared to monthly',
        'Verified badge',
        'Promotion in newsletter',
        'Priority support'
      ]
    }
  ];

  res.json({
    success: true,
    data: plans
  });
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Payment service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/initialize',
      '/verify/:tx_ref',
      '/callback',
      '/debug-webhook',
      '/test-webhook',
      '/manual-update/:tx_ref',
      '/status',
      '/plans',
      '/health'
    ]
  });
});

router.use(paymentErrorHandler);

module.exports = router;