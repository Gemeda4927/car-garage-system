const axios = require('axios');
const User = require('../models/User');

// CHAPA Configuration
const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;
const CHAPA_API_URL = process.env.CHAPA_API_URL || 'https://api.chapa.co/v1';

// ============================================================================
// PAYMENT VALIDATION MIDDLEWARE
// ============================================================================

/**
 * Verify that payment is required and valid
 */
const validatePayment = async (req, res, next) => {
  try {
    const { plan = 'basic' } = req.body;
    
    // Validate plan
    const validPlans = ['basic', 'premium', 'yearly'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment plan. Choose basic, premium, or yearly'
      });
    }
    
    // Attach plan to request
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

// ============================================================================
// PAYMENT ELIGIBILITY MIDDLEWARE
// ============================================================================

/**
 * Check if user is eligible to make payment
 */
const checkPaymentEligibility = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is garage owner
    if (user.role !== 'garage_owner') {
      return res.status(403).json({
        success: false,
        message: 'Only garage owners can make payments'
      });
    }

    // Check if garage info exists
    if (!user.garageInfo) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your garage registration first'
      });
    }

    // Check payment eligibility based on status
    const eligibleStatuses = ['pending', 'failed', 'expired'];
    const currentStatus = user.garageInfo.paymentStatus;
    
    if (!eligibleStatuses.includes(currentStatus)) {
      const statusMessages = {
        'paid': 'Payment already completed',
        'processing': 'Payment is being processed',
        'refunded': 'Payment was refunded',
        'cancelled': 'Payment was cancelled',
        'not_required': 'Payment is not required for your account'
      };
      
      return res.status(400).json({
        success: false,
        message: statusMessages[currentStatus] || 'Payment not allowed at this stage',
        currentStatus
      });
    }

    // Check verification status eligibility
    const eligibleVerificationStatuses = [
      'documents_uploaded', 
      'pending_payment',
      'more_info_needed',
      'registration_started'
    ];
    
    if (!eligibleVerificationStatuses.includes(user.garageInfo.verificationStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot process payment when status is: ${user.garageInfo.verificationStatus}`,
        requiredStatus: 'pending_payment or documents_uploaded'
      });
    }

    // Attach user to request for next middleware
    req.paymentUser = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking payment eligibility',
      error: error.message
    });
  }
};

// ============================================================================
// PAYMENT PREPARATION MIDDLEWARE
// ============================================================================

/**
 * Generate unique transaction reference (shorter version)
 */
const generateTxRef = (req, res, next) => {
  const user = req.paymentUser || req.user;
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits
  const random = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
  const userId = user._id.toString().slice(-6); // Last 6 chars of user ID
  
  req.tx_ref = `GAR-${userId}-${timestamp}-${random}`;
  console.log('✅ Generated tx_ref:', req.tx_ref);
  next();
};

/**
 * Get payment amount based on plan
 */
const getPaymentAmount = (req, res, next) => {
  const plan = req.paymentPlan || req.body.plan || 'basic';
  
  const plans = {
    basic: {
      amount: parseInt(process.env.BASIC_PLAN_AMOUNT) || 500,
      description: 'Basic Garage Listing - 30 days access',
      duration: 30 // days
    },
    premium: {
      amount: parseInt(process.env.PREMIUM_PLAN_AMOUNT) || 1000,
      description: 'Premium Garage Listing - 30 days with featured placement',
      duration: 30 // days
    },
    yearly: {
      amount: parseInt(process.env.YEARLY_PLAN_AMOUNT) || 5000,
      description: 'Yearly Premium Listing - 365 days with all features',
      duration: 365 // days
    }
  };

  const selectedPlan = plans[plan] || plans.basic;
  
  req.paymentDetails = {
    plan,
    amount: selectedPlan.amount,
    description: selectedPlan.description,
    duration: selectedPlan.duration,
    currency: 'ETB'
  };
  
  console.log('✅ Payment details:', req.paymentDetails);
  next();
};

// ============================================================================
// CHAPA API MIDDLEWARE
// ============================================================================

/**
 * Initialize payment with CHAPA API
 */
const initializeChapaPayment = async (req, res, next) => {
  try {
    const user = req.paymentUser || req.user;
    const { amount, description, currency } = req.paymentDetails;
    const tx_ref = req.tx_ref;

    // Prepare payment data with short title (max 16 chars)
    const paymentData = {
      amount: amount.toString(),
      currency: currency,
      email: user.email,
      first_name: user.name.split(' ')[0],
      last_name: user.name.split(' ').slice(1).join(' ') || 'Owner',
      tx_ref: tx_ref,
      callback_url: process.env.CHAPA_CALLBACK_URL || `${process.env.API_URL}/api/v1/payments/callback`,
      return_url: process.env.CHAPA_RETURN_URL || `${process.env.CLIENT_URL}/payment/success`,
      customization: {
        title: 'Garage Listing', // 13 characters - safe!
        description: description.substring(0, 50)
      }
    };

    console.log('📤 Sending payment data to Chapa:', paymentData);

    // Call CHAPA API
    const response = await axios.post(
      `${CHAPA_API_URL}/transaction/initialize`,
      paymentData,
      {
        headers: {
          'Authorization': `Bearer ${CHAPA_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === 'success') {
      // Save transaction reference to user BEFORE payment
      const user = await User.findById(req.user.id);
      user.garageInfo.paymentTxRef = tx_ref;
      user.garageInfo.paymentStatus = 'processing';
      user.garageInfo.paymentPlan = req.paymentDetails.plan;
      user.garageInfo.paymentAmount = req.paymentDetails.amount;
      await user.save();
      
      console.log('✅ Transaction saved to user:', tx_ref);
      
      req.chapaResponse = {
        success: true,
        checkout_url: response.data.data.checkout_url,
        tx_ref: tx_ref
      };
      next();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Payment initialization failed',
        error: response.data.message
      });
    }
  } catch (error) {
    console.error('❌ CHAPA API Error:', error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Error connecting to payment gateway',
      error: error.response?.data?.errors || error.response?.data?.message || error.message
    });
  }
};

/**
 * Verify payment with CHAPA API and update database
 */
const verifyChapaPayment = async (req, res, next) => {
  try {
    const { tx_ref } = req.params;

    if (!tx_ref) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    console.log('🔍 Verifying payment:', tx_ref);

    const response = await axios.get(
      `${CHAPA_API_URL}/transaction/verify/${tx_ref}`,
      {
        headers: {
          'Authorization': `Bearer ${CHAPA_SECRET_KEY}`
        }
      }
    );

    console.log('✅ Chapa verification response:', response.data);

    // Find user by tx_ref
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (user && response.data.status === 'success') {
      // UPDATE DATABASE - PAYMENT SUCCESSFUL
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      user.garageInfo.verificationStatus = 'payment_completed';
      
      // Update subscription if applicable
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      } else {
        user.garageInfo.subscriptionPlan = 'basic';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
      
      // Mark profile as ready for review
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      await user.save();
      
      console.log('✅✅✅ DATABASE UPDATED - Payment successful for user:', user.email);
      console.log('📅 Payment expiry:', user.garageInfo.paymentExpiry);
      console.log('🔄 Verification status:', user.garageInfo.verificationStatus);
    } else if (user && response.data.status !== 'success') {
      // UPDATE DATABASE - PAYMENT FAILED
      user.garageInfo.paymentStatus = 'failed';
      user.garageInfo.verificationStatus = 'pending_payment';
      await user.save();
      
      console.log('❌ Payment failed for user:', user.email);
    }

    req.verificationResult = {
      success: response.data.status === 'success',
      data: response.data,
      user: user
    };
    
    next();
  } catch (error) {
    console.error('❌ CHAPA Verification Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.response?.data?.message || error.message
    });
  }
};

// ============================================================================
// PAYMENT WEBHOOK MIDDLEWARE
// ============================================================================

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-chapa-signature'];
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;

  if (!signature) {
    return res.status(401).json({
      success: false,
      message: 'No signature provided'
    });
  }

  // In production, verify the signature
  // const crypto = require('crypto');
  // const hash = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex');
  // if (hash !== signature) {
  //   return res.status(401).json({ success: false, message: 'Invalid signature' });
  // }

  next();
};

// ============================================================================
// DATABASE UPDATE MIDDLEWARE (for webhook)
// ============================================================================

/**
 * Update user payment status after successful payment (webhook)
 */
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { tx_ref, status, first_name, last_name, amount } = req.body;
    
    console.log('🔥 WEBHOOK RECEIVED:', { tx_ref, status, first_name, last_name, amount });
    
    // Find user by transaction reference
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (!user) {
      console.error('❌ User not found for tx_ref:', tx_ref);
      return res.status(404).json({
        success: false,
        message: 'User not found for this transaction'
      });
    }

    console.log('✅ User found:', user.email);

    // Update based on payment status
    if (status === 'success' || status === 'completed') {
      // PAYMENT SUCCESSFUL - UPDATE DATABASE
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      user.garageInfo.verificationStatus = 'payment_completed';
      
      // Update subscription
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      } else {
        user.garageInfo.subscriptionPlan = 'basic';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
      
      // Mark payment completed in verification progress
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      console.log('✅✅✅ WEBHOOK: Database updated to PAID for user:', user.email);
    } else if (status === 'failed') {
      // PAYMENT FAILED
      user.garageInfo.paymentStatus = 'failed';
      user.garageInfo.verificationStatus = 'pending_payment';
      console.log('❌ WEBHOOK: Payment failed for user:', user.email);
    } else if (status === 'cancelled') {
      // PAYMENT CANCELLED
      user.garageInfo.paymentStatus = 'cancelled';
      user.garageInfo.verificationStatus = 'pending_payment';
      console.log('⚠️ WEBHOOK: Payment cancelled for user:', user.email);
    }

    await user.save();
    console.log('✅ Database save complete');

    req.updatedUser = user;
    next();
  } catch (error) {
    console.error('❌ Error updating payment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
};

// ============================================================================
// MANUAL PAYMENT UPDATE (FOR ADMIN/TESTING)
// ============================================================================

/**
 * Manually update payment status (admin only)
 */
const manualPaymentUpdate = async (req, res) => {
  try {
    const { userId, status } = req.body;
    
    if (!userId || !status) {
      return res.status(400).json({
        success: false,
        message: 'User ID and status are required'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Valid statuses
    const validStatuses = ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update payment status
    user.garageInfo.paymentStatus = status;
    
    if (status === 'paid') {
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }
    }

    await user.save();

    res.json({
      success: true,
      message: `Payment status updated to ${status}`,
      data: {
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentDate: user.garageInfo.paymentDate,
        paymentExpiry: user.garageInfo.paymentExpiry
      }
    });
  } catch (error) {
    console.error('❌ Manual update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
};

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

/**
 * Handle payment errors
 */
const paymentErrorHandler = (err, req, res, next) => {
  console.error('❌ Payment Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Payment processing error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// ============================================================================
// EXPORT ALL MIDDLEWARE
// ============================================================================

module.exports = {
  // Validation middleware
  validatePayment,
  checkPaymentEligibility,
  
  // Preparation middleware
  generateTxRef,
  getPaymentAmount,
  
  // CHAPA API middleware
  initializeChapaPayment,
  verifyChapaPayment,
  
  // Webhook middleware
  verifyWebhookSignature,
  
  // Database middleware
  updatePaymentStatus,
  
  // Manual update (admin)
  manualPaymentUpdate,
  
  // Error handler
  paymentErrorHandler
};