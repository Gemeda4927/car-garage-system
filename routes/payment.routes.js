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
  manualPaymentUpdate,
  forceUpdatePayment,
  debugWebhook,
  testWebhook,  // ADD THIS - new test endpoint
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
      console.log('✅ Payment initialization complete, returning response');
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
      console.error('❌ Payment initialization error:', error);
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
      console.log('🔍 Verification completed for tx_ref:', tx_ref);
      
      // Find user by tx_ref
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
      console.error('❌ Verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Error verifying payment',
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
  updatePaymentStatus
);

// ============================================================================
// TEST WEBHOOK ENDPOINT (FOR DEBUGGING)
// ============================================================================

/**
 * @route   POST /api/v1/payments/test-webhook
 * @desc    Test webhook endpoint - logs everything but doesn't update DB
 * @access  Public (FOR TESTING ONLY)
 */
router.post('/test-webhook', testWebhook);

// ============================================================================
// DEBUG WEBHOOK (SIMULATES CHAPA CALLBACK)
// ============================================================================

/**
 * @route   POST /api/v1/payments/debug-webhook
 * @desc    Debug webhook - simulates Chapa callback and updates DB
 * @access  Public (FOR TESTING ONLY)
 */
router.post('/debug-webhook', debugWebhook);

// ============================================================================
// GET PAYMENT STATUS
// ============================================================================

/**
 * @route   GET /api/v1/payments/status
 * @desc    Get current user payment status
 * @access  Private
 */
router.get('/status', protect, checkPaymentStatus);

// ============================================================================
// FORCE UPDATE PAYMENT (EMERGENCY USE ONLY)
// ============================================================================

/**
 * @route   POST /api/v1/payments/force-update
 * @desc    Force update payment status by tx_ref
 * @access  Public (FOR TESTING/EMERGENCY ONLY)
 */
router.post('/force-update', forceUpdatePayment);

// ============================================================================
// MANUAL PAYMENT UPDATE (ADMIN ONLY)
// ============================================================================

/**
 * @route   POST /api/v1/payments/manual-update
 * @desc    Manually update payment status (ADMIN ONLY)
 * @access  Private (Admin)
 */
router.post(
  '/manual-update',
  protect,
  authorize('admin'),
  manualPaymentUpdate
);

// ============================================================================
// FORCE UPDATE FOR CURRENT USER (TEMPORARY - FOR DEBUGGING)
// ============================================================================

/**
 * @route   POST /api/v1/payments/force-update-user
 * @desc    Force update payment status for current user (TEMPORARY)
 * @access  Private (Garage Owner) - REMOVE AFTER TESTING
 */
router.post(
  '/force-update-user',
  protect,
  authorize('garage_owner'),
  async (req, res) => {
    try {
      const { status = 'paid' } = req.body;
      
      console.log('🔧 FORCE UPDATE USER triggered for user:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      console.log('✅ User found:', { 
        email: user.email, 
        currentStatus: user.garageInfo?.paymentStatus 
      });
      
      // Force update
      user.garageInfo.paymentStatus = status;
      
      if (status === 'paid') {
        user.garageInfo.paymentDate = new Date();
        user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        user.garageInfo.verificationStatus = 'payment_completed';
        user.garageInfo.verificationProgress.paymentCompleted = true;
      }
      
      await user.save();
      
      console.log('✅✅✅ FORCE UPDATE applied for user:', user.email);
      console.log('New status:', {
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus
      });
      
      res.json({
        success: true,
        message: `Payment status force updated to ${status}`,
        data: {
          paymentStatus: user.garageInfo.paymentStatus,
          verificationStatus: user.garageInfo.verificationStatus,
          paymentDate: user.garageInfo.paymentDate,
          paymentExpiry: user.garageInfo.paymentExpiry
        }
      });
    } catch (error) {
      console.error('❌ Force update error:', error);
      res.status(500).json({
        success: false,
        message: 'Error force updating payment',
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
  console.log('📋 Fetching payment plans');
  
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
// HEALTH CHECK ENDPOINT
// ============================================================================

/**
 * @route   GET /api/v1/payments/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
  console.log('💓 Health check requested');
  res.json({
    success: true,
    message: 'Payment service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/initialize',
      '/verify/:tx_ref',
      '/callback',
      '/test-webhook',
      '/debug-webhook',
      '/status',
      '/force-update',
      '/manual-update',
      '/force-update-user',
      '/plans',
      '/health'
    ]
  });
});

// ============================================================================
// APPLY ERROR HANDLER
// ============================================================================

router.use(paymentErrorHandler);

module.exports = router;