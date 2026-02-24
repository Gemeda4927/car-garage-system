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
  checkPaymentStatus,  // ADD THIS - new function
  manualPaymentUpdate, // ADD THIS - for testing
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
      // Transaction already saved in middleware, just return response
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
      
      // Find user by tx_ref
      const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
      
      res.json({
        success: true,
        data: {
          verified: req.verificationResult?.success || false,
          paymentDetails: req.verificationResult?.data || null,
          userStatus: user?.garageInfo?.verificationStatus || 'unknown',
          paymentStatus: user?.garageInfo?.paymentStatus || 'unknown'
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
// PAYMENT CALLBACK (CHAPA Webhook) - FIXED VERSION
// ============================================================================

/**
 * @route   POST /api/v1/payments/callback
 * @desc    CHAPA payment callback webhook
 * @access  Public (called by CHAPA)
 * 
 * IMPORTANT: This endpoint must:
 * 1. Return 200 OK as fast as possible
 * 2. Update database based on payment status
 * 3. Handle duplicate webhooks gracefully
 */
router.post(
  '/callback',
  verifyWebhookSignature,           // Verify it's from Chapa
  updatePaymentStatus               // This now handles the response
);

// No additional code here - updatePaymentStatus sends the response

// ============================================================================
// GET PAYMENT STATUS - UPDATED
// ============================================================================

/**
 * @route   GET /api/v1/payments/status
 * @desc    Get current user payment status
 * @access  Private
 */
router.get(
  '/status',
  protect,
  checkPaymentStatus                // Using the dedicated middleware
);

// ============================================================================
// MANUAL PAYMENT UPDATE (FOR TESTING/ADMIN)
// ============================================================================

/**
 * @route   POST /api/v1/payments/manual-update
 * @desc    Manually update payment status (ADMIN ONLY)
 * @access  Private (Admin)
 */
router.post(
  '/manual-update',
  protect,
  authorize('admin'),               // Only admins can do this
  manualPaymentUpdate
);

// ============================================================================
// FORCE UPDATE FOR CURRENT USER (TEMPORARY - FOR DEBUGGING)
// ============================================================================

/**
 * @route   POST /api/v1/payments/force-update
 * @desc    Force update payment status for current user (TEMPORARY)
 * @access  Private (Garage Owner) - REMOVE AFTER TESTING
 */
router.post(
  '/force-update',
  protect,
  authorize('garage_owner'),
  async (req, res) => {
    try {
      const { status = 'paid' } = req.body;
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Force update
      user.garageInfo.paymentStatus = status;
      
      if (status === 'paid') {
        user.garageInfo.paymentDate = new Date();
        user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        user.garageInfo.verificationStatus = 'payment_completed';
        user.garageInfo.verificationProgress.paymentCompleted = true;
      }
      
      await user.save();
      
      console.log('✅ FORCE UPDATE applied for user:', user.email);
      
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
// WEBHOOK DEBUG ENDPOINT (TEMPORARY)
// ============================================================================

/**
 * @route   POST /api/v1/payments/debug-webhook
 * @desc    Debug webhook - simulates Chapa callback
 * @access  Public (TEMPORARY - REMOVE AFTER TESTING)
 */
router.post('/debug-webhook', async (req, res) => {
  try {
    const { tx_ref, status = 'success' } = req.body;
    
    if (!tx_ref) {
      return res.status(400).json({
        success: false,
        message: 'tx_ref is required'
      });
    }
    
    console.log('🔧 DEBUG WEBHOOK CALLED with:', { tx_ref, status });
    
    // Find user
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found for this tx_ref'
      });
    }
    
    console.log('✅ Debug: User found:', user.email);
    
    // Update database
    if (status === 'success') {
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      await user.save();
      
      console.log('✅✅✅ DEBUG: Database updated to PAID');
    }
    
    res.json({
      success: true,
      message: 'Debug webhook processed',
      data: {
        user: user.email,
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus
      }
    });
  } catch (error) {
    console.error('❌ Debug webhook error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// APPLY ERROR HANDLER
// ============================================================================

router.use(paymentErrorHandler);

module.exports = router;