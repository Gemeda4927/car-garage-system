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
  paymentErrorHandler
} = require('../middleware/payment.middleware');

const User = require('../models/User');

// ============================================================================
// INITIALIZE PAYMENT
// ============================================================================

/**
 * @route   POST /api/v1/payments/initialize
 * @desc    Initialize payment for garage listing
 * @access  Private (Garage Owner)
 */
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
      // Save transaction reference to user
      const user = await User.findById(req.user.id);
      user.garageInfo.paymentTxRef = req.tx_ref;
      user.garageInfo.paymentStatus = 'processing';
      user.garageInfo.paymentPlan = req.paymentDetails.plan;
      user.garageInfo.paymentAmount = req.paymentDetails.amount;
      await user.save();

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

// ============================================================================
// VERIFY PAYMENT
// ============================================================================

/**
 * @route   GET /api/v1/payments/verify/:tx_ref
 * @desc    Verify payment status
 * @access  Private
 */
router.get(
  '/verify/:tx_ref',
  protect,
  verifyChapaPayment,
  async (req, res) => {
    try {
      const { tx_ref } = req.params;
      
      // Find user by tx_ref
      const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
      
      if (user && req.verificationResult.success) {
        // Update user status if verified
        user.garageInfo.paymentStatus = 'paid';
        user.garageInfo.paymentDate = new Date();
        user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        user.garageInfo.verificationStatus = 'payment_completed';
        await user.save();
      }

      res.json({
        success: true,
        data: {
          verified: req.verificationResult.success,
          paymentDetails: req.verificationResult.data,
          userStatus: user?.garageInfo?.verificationStatus
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating payment status',
        error: error.message
      });
    }
  }
);

// ============================================================================
// PAYMENT CALLBACK (CHAPA Webhook)
// ============================================================================

/**
 * @route   POST /api/v1/payments/callback
 * @desc    CHAPA payment callback webhook
 * @access  Public (called by CHAPA)
 */
router.post(
  '/callback',
  verifyWebhookSignature,
  updatePaymentStatus,
  async (req, res) => {
    try {
      const { tx_ref, status } = req.body;
      
      console.log(`Payment callback received for transaction: ${tx_ref} with status: ${status}`);
      
      res.status(200).json({
        success: true,
        message: 'Callback received successfully'
      });
    } catch (error) {
      console.error('Callback error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing callback'
      });
    }
  }
);

// ============================================================================
// GET PAYMENT STATUS
// ============================================================================

/**
 * @route   GET /api/v1/payments/status
 * @desc    Get current user payment status
 * @access  Private
 */
router.get(
  '/status',
  protect,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user || user.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      res.json({
        success: true,
        data: {
          paymentStatus: user.garageInfo?.paymentStatus || 'not_required',
          verificationStatus: user.garageInfo?.verificationStatus,
          paymentDate: user.garageInfo?.paymentDate,
          paymentExpiry: user.garageInfo?.paymentExpiry,
          paymentPlan: user.garageInfo?.paymentPlan,
          canAccess: {
            dashboard: ['approved', 'under_review', 'payment_completed'].includes(user.garageInfo?.verificationStatus),
            payment: ['pending', 'failed', 'expired'].includes(user.garageInfo?.paymentStatus)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching payment status',
        error: error.message
      });
    }
  }
);

// ============================================================================
// GET PAYMENT PLANS
// ============================================================================

/**
 * @route   GET /api/v1/payments/plans
 * @desc    Get available payment plans
 * @access  Public
 */
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

// ============================================================================
// APPLY ERROR HANDLER
// ============================================================================

router.use(paymentErrorHandler);

module.exports = router;