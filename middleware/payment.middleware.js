const axios = require('axios');
const User = require('../models/User');
const crypto = require('crypto');

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
  console.log('\n🟡 [1/8] VALIDATE PAYMENT - Starting payment validation');
  console.log('📝 Request body:', req.body);
  
  try {
    const { plan = 'basic' } = req.body;
    console.log('📋 Selected plan:', plan);
    
    // Validate plan
    const validPlans = ['basic', 'premium', 'yearly'];
    if (!validPlans.includes(plan)) {
      console.log('❌ Invalid plan selected:', plan);
      return res.status(400).json({
        success: false,
        message: 'Invalid payment plan. Choose basic, premium, or yearly'
      });
    }
    
    console.log('✅ Plan validated successfully');
    req.paymentPlan = plan;
    next();
  } catch (error) {
    console.error('❌ Validation error:', error);
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
  console.log('\n🟡 [2/8] CHECK ELIGIBILITY - Verifying user eligibility');
  console.log('👤 User ID:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', { 
      email: user.email, 
      role: user.role,
      paymentStatus: user.garageInfo?.paymentStatus,
      verificationStatus: user.garageInfo?.verificationStatus
    });

    // Check if user is garage owner
    if (user.role !== 'garage_owner') {
      console.log('❌ User is not a garage owner. Role:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Only garage owners can make payments'
      });
    }
    console.log('✅ User is a garage owner');

    // Check if garage info exists
    if (!user.garageInfo) {
      console.log('❌ No garage info found for user');
      return res.status(400).json({
        success: false,
        message: 'Please complete your garage registration first'
      });
    }
    console.log('✅ Garage info exists');

    // Check payment eligibility based on status
    const eligibleStatuses = ['pending', 'failed', 'expired'];
    const currentStatus = user.garageInfo.paymentStatus;
    
    console.log('💰 Current payment status:', currentStatus);
    
    if (!eligibleStatuses.includes(currentStatus)) {
      console.log('❌ Payment not allowed. Current status:', currentStatus);
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
    console.log('✅ Payment status eligible');

    // Check verification status eligibility
    const eligibleVerificationStatuses = [
      'documents_uploaded', 
      'pending_payment',
      'more_info_needed',
      'registration_started'
    ];
    
    console.log('📋 Current verification status:', user.garageInfo.verificationStatus);
    
    if (!eligibleVerificationStatuses.includes(user.garageInfo.verificationStatus)) {
      console.log('❌ Verification status not eligible:', user.garageInfo.verificationStatus);
      return res.status(400).json({
        success: false,
        message: `Cannot process payment when status is: ${user.garageInfo.verificationStatus}`,
        requiredStatus: 'pending_payment or documents_uploaded'
      });
    }
    console.log('✅ Verification status eligible');

    // Attach user to request for next middleware
    req.paymentUser = user;
    console.log('✅ Eligibility check passed');
    next();
  } catch (error) {
    console.error('❌ Eligibility check error:', error);
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
  console.log('\n🟡 [3/8] GENERATE TX REF - Creating transaction reference');
  
  const user = req.paymentUser || req.user;
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const userId = user._id.toString().slice(-6);
  
  req.tx_ref = `GAR-${userId}-${timestamp}-${random}`;
  
  console.log('📊 Generated using:', {
    userId: userId,
    timestamp: timestamp,
    random: random
  });
  console.log('✅ Generated tx_ref:', req.tx_ref);
  
  next();
};

/**
 * Get payment amount based on plan
 */
const getPaymentAmount = (req, res, next) => {
  console.log('\n🟡 [4/8] GET PAYMENT AMOUNT - Calculating payment details');
  
  const plan = req.paymentPlan || req.body.plan || 'basic';
  console.log('📋 Selected plan:', plan);
  
  const plans = {
    basic: {
      amount: parseInt(process.env.BASIC_PLAN_AMOUNT) || 500,
      description: 'Basic Garage Listing - 30 days access',
      duration: 30
    },
    premium: {
      amount: parseInt(process.env.PREMIUM_PLAN_AMOUNT) || 1000,
      description: 'Premium Garage Listing - 30 days with featured placement',
      duration: 30
    },
    yearly: {
      amount: parseInt(process.env.YEARLY_PLAN_AMOUNT) || 5000,
      description: 'Yearly Premium Listing - 365 days with all features',
      duration: 365
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
  
  console.log('✅ Payment details calculated:', req.paymentDetails);
  next();
};

// ============================================================================
// CHAPA API MIDDLEWARE
// ============================================================================

/**
 * Initialize payment with CHAPA API
 */
const initializeChapaPayment = async (req, res, next) => {
  console.log('\n🟡 [5/8] INITIALIZE CHAPA PAYMENT - Calling Chapa API');
  
  try {
    const user = req.paymentUser || req.user;
    const { amount, description, currency } = req.paymentDetails;
    const tx_ref = req.tx_ref;

    console.log('👤 User:', { email: user.email, name: user.name });

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
        title: 'Garage Listing',
        description: description.substring(0, 50)
      }
    };

    console.log('📤 Sending payment data to Chapa:', JSON.stringify(paymentData, null, 2));
    console.log('🔑 Using Chapa secret key:', CHAPA_SECRET_KEY ? '✅ Present' : '❌ Missing');

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

    console.log('📥 Chapa API response:', JSON.stringify(response.data, null, 2));

    if (response.data.status === 'success') {
      console.log('✅ Chapa initialization successful');
      
      const user = await User.findById(req.user.id);
      console.log('💾 Saving transaction to user database...');
      
      user.garageInfo.paymentTxRef = tx_ref;
      user.garageInfo.paymentStatus = 'processing';
      user.garageInfo.paymentPlan = req.paymentDetails.plan;
      user.garageInfo.paymentAmount = req.paymentDetails.amount;
      await user.save();
      
      console.log('✅ Transaction saved to user:', {
        tx_ref: tx_ref,
        status: 'processing',
        userId: user._id
      });
      
      req.chapaResponse = {
        success: true,
        checkout_url: response.data.data.checkout_url,
        tx_ref: tx_ref
      };
      
      console.log('🚀 Checkout URL:', response.data.data.checkout_url);
      next();
    } else {
      console.log('❌ Chapa initialization failed:', response.data.message);
      return res.status(400).json({
        success: false,
        message: 'Payment initialization failed',
        error: response.data.message
      });
    }
  } catch (error) {
    console.error('❌ CHAPA API Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', error.response.data);
    }
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
  console.log('\n🟡 [VERIFY] Verifying payment with Chapa');
  
  try {
    const { tx_ref } = req.params;
    console.log('🔍 Verifying tx_ref:', tx_ref);

    if (!tx_ref) {
      console.log('❌ No tx_ref provided');
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    console.log('📡 Calling Chapa verification API...');
    const response = await axios.get(
      `${CHAPA_API_URL}/transaction/verify/${tx_ref}`,
      {
        headers: {
          'Authorization': `Bearer ${CHAPA_SECRET_KEY}`
        }
      }
    );

    console.log('📥 Chapa verification response:', JSON.stringify(response.data, null, 2));

    console.log('🔍 Searching for user with tx_ref:', tx_ref);
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (!user) {
      console.log('❌ No user found with tx_ref:', tx_ref);
    } else {
      console.log('✅ User found:', { email: user.email, currentStatus: user.garageInfo.paymentStatus });
    }
    
    if (user && response.data.status === 'success') {
      console.log('💰 Payment verified - updating database to PAID');
      
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        console.log('📅 Yearly subscription set');
      } else {
        user.garageInfo.subscriptionPlan = 'basic';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        console.log('📅 Monthly subscription set');
      }
      
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      await user.save();
      
      console.log('✅✅✅ DATABASE UPDATED - Payment successful for user:', {
        email: user.email,
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentDate: user.garageInfo.paymentDate,
        paymentExpiry: user.garageInfo.paymentExpiry
      });
    } else if (user && response.data.status !== 'success') {
      console.log('❌ Payment verification failed - updating database to FAILED');
      
      user.garageInfo.paymentStatus = 'failed';
      user.garageInfo.verificationStatus = 'pending_payment';
      await user.save();
      
      console.log('✅ Database updated to FAILED for user:', user.email);
    }

    req.verificationResult = {
      success: response.data.status === 'success',
      data: response.data,
      user: user
    };
    
    console.log('✅ Verification complete');
    next();
  } catch (error) {
    console.error('❌ CHAPA Verification Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.response?.data?.message || error.message
    });
  }
};

// ============================================================================
// PAYMENT WEBHOOK HANDLER - ENHANCED LOGGING
// ============================================================================

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (req, res, next) => {
  console.log('\n🟡 [WEBHOOK SIGNATURE] Verifying webhook signature');
  
  const signature = req.headers['x-chapa-signature'];
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;

  console.log('📋 Webhook Headers Received:', {
    'x-chapa-signature': signature ? '✅ Present' : '❌ Missing',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
    'host': req.headers['host'],
    'content-length': req.headers['content-length']
  });

  if (!signature) {
    console.warn('⚠️ No signature provided in webhook');
  }

  if (webhookSecret && signature) {
    console.log('🔐 Verifying signature with secret...');
    const hash = crypto.createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== signature) {
      console.error('❌ Invalid webhook signature');
      console.log('Expected:', hash);
      console.log('Received:', signature);
    } else {
      console.log('✅ Webhook signature verified');
    }
  } else {
    console.log('⚠️ Signature verification skipped - missing secret or signature');
  }

  next();
};

/**
 * Update user payment status after successful payment (webhook) - ENHANCED LOGGING
 */
const updatePaymentStatus = async (req, res) => {
  console.log('\n🔥🔥🔥 [WEBHOOK RECEIVED] PAYMENT UPDATE STARTED');
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('📦 FULL WEBHOOK PAYLOAD:', JSON.stringify(req.body, null, 2));
  console.log('📋 ALL HEADERS:', JSON.stringify(req.headers, null, 2));
  console.log('🌐 Request IP:', req.ip);
  console.log('🔌 Request Method:', req.method);
  console.log('📌 Request URL:', req.originalUrl);
  
  try {
    const { tx_ref, status, first_name, last_name, amount, currency, event } = req.body;
    
    console.log('🔍 EXTRACTED WEBHOOK DATA:', {
      tx_ref,
      status,
      first_name,
      last_name,
      amount,
      currency,
      event
    });
    
    if (!tx_ref) {
      console.error('❌ CRITICAL ERROR: No tx_ref in webhook payload');
      console.log('📦 Full body for debugging:', req.body);
      
      // Log all keys in the body to help debug
      console.log('🔑 Keys in webhook body:', Object.keys(req.body));
      
      return res.status(200).json({ 
        success: false, 
        message: 'Missing tx_ref',
        received: req.body,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('🔍 PROCESSING WEBHOOK for tx_ref:', tx_ref);
    console.log('💰 Payment status from Chapa:', status);
    
    // Find user by transaction reference
    console.log('🔎 SEARCHING DATABASE for user with tx_ref:', tx_ref);
    console.log('⏱️ Search started at:', new Date().toISOString());
    
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    console.log('⏱️ Search completed at:', new Date().toISOString());
    
    if (!user) {
      console.error('❌❌❌ USER NOT FOUND for tx_ref:', tx_ref);
      
      // List all users with paymentTxRef for debugging
      console.log('🔍 SEARCHING ALL users with paymentTxRef...');
      const allUsers = await User.find({ 
        'garageInfo.paymentTxRef': { $exists: true, $ne: null } 
      }).select('email garageInfo.paymentTxRef _id');
      
      console.log('📋 TOTAL USERS with paymentTxRef found:', allUsers.length);
      
      if (allUsers.length === 0) {
        console.log('⚠️ No users have any paymentTxRef in database');
      } else {
        allUsers.forEach((u, index) => {
          console.log(`  ${index + 1}. ID: ${u._id}, Email: ${u.email}, tx_ref: ${u.garageInfo?.paymentTxRef}`);
        });
        
        // Check if any tx_ref partially matches
        console.log('🔍 Checking for partial matches...');
        allUsers.forEach(u => {
          const storedRef = u.garageInfo?.paymentTxRef;
          if (storedRef && tx_ref && storedRef.includes(tx_ref.slice(-10))) {
            console.log(`⚠️ POSSIBLE MATCH: User ${u.email} has tx_ref: ${storedRef} (ends with ${tx_ref.slice(-10)})`);
          }
        });
      }
      
      return res.status(200).json({ 
        success: false, 
        message: 'User not found for this transaction',
        tx_ref: tx_ref,
        searchedIn: 'garageInfo.paymentTxRef',
        timestamp: new Date().toISOString()
      });
    }

    console.log('✅✅ USER FOUND SUCCESSFULLY!');
    console.log('📊 USER DETAILS:', { 
      id: user._id.toString(),
      email: user.email, 
      currentPaymentStatus: user.garageInfo.paymentStatus,
      currentVerificationStatus: user.garageInfo.verificationStatus,
      paymentPlan: user.garageInfo.paymentPlan,
      hasPaymentDate: !!user.garageInfo.paymentDate,
      hasPaymentExpiry: !!user.garageInfo.paymentExpiry,
      documentsCount: user.garageInfo.documents?.length || 0,
      agreementsCount: user.garageInfo.agreements?.length || 0
    });

    // Update based on payment status
    if (status === 'success' || status === 'completed' || status === 'successful') {
      console.log('💰💰💰 PAYMENT SUCCESSFUL - UPDATING DATABASE...');
      
      // Store old values for comparison
      const oldValues = {
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus
      };
      
      console.log('📊 OLD VALUES:', oldValues);
      
      // PAYMENT SUCCESSFUL - UPDATE DATABASE
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      
      console.log('📅 Setting payment date:', user.garageInfo.paymentDate);
      console.log('📅 Setting payment expiry:', user.garageInfo.paymentExpiry);
      
      // Update subscription based on plan
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        console.log('📅 Yearly subscription set, expires:', user.garageInfo.subscriptionExpiry);
      } else {
        user.garageInfo.subscriptionPlan = 'basic';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        console.log('📅 Monthly subscription set, expires:', user.garageInfo.subscriptionExpiry);
      }
      
      // Mark payment completed in verification progress
      if (!user.garageInfo.verificationProgress) {
        user.garageInfo.verificationProgress = {};
      }
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      console.log('💾 SAVING to database...');
      console.log('⏱️ Save started at:', new Date().toISOString());
      
      await user.save();
      
      console.log('⏱️ Save completed at:', new Date().toISOString());
      console.log('✅✅✅✅✅ WEBHOOK: DATABASE UPDATED TO PAID SUCCESSFULLY!');
      console.log('📊 OLD VALUES:', oldValues);
      console.log('📊 NEW VALUES:', {
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentDate: user.garageInfo.paymentDate,
        paymentExpiry: user.garageInfo.paymentExpiry,
        subscriptionPlan: user.garageInfo.subscriptionPlan,
        subscriptionExpiry: user.garageInfo.subscriptionExpiry
      });
      
      // Verify the update by fetching again
      console.log('🔍 VERIFYING update with new query...');
      const verifyUser = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
      console.log('✅ VERIFICATION AFTER UPDATE:', {
        paymentStatus: verifyUser.garageInfo.paymentStatus,
        verificationStatus: verifyUser.garageInfo.verificationStatus,
        paymentDate: verifyUser.garageInfo.paymentDate,
        paymentExpiry: verifyUser.garageInfo.paymentExpiry
      });
      
      console.log('📤 SENDING SUCCESS RESPONSE to Chapa');
      
      return res.status(200).json({
        success: true,
        message: 'Payment status updated successfully to PAID',
        data: {
          paymentStatus: user.garageInfo.paymentStatus,
          verificationStatus: user.garageInfo.verificationStatus,
          paymentDate: user.garageInfo.paymentDate,
          paymentExpiry: user.garageInfo.paymentExpiry
        },
        timestamp: new Date().toISOString()
      });
      
    } else if (status === 'failed') {
      console.log('❌❌ PAYMENT FAILED - UPDATING DATABASE...');
      
      user.garageInfo.paymentStatus = 'failed';
      user.garageInfo.verificationStatus = 'pending_payment';
      await user.save();
      
      console.log('✅ Database updated to FAILED for user:', user.email);
      
      return res.status(200).json({
        success: true,
        message: 'Payment failed status recorded',
        data: {
          paymentStatus: user.garageInfo.paymentStatus,
          verificationStatus: user.garageInfo.verificationStatus
        },
        timestamp: new Date().toISOString()
      });
      
    } else {
      console.log('❓ Unknown payment status:', status);
      
      return res.status(200).json({
        success: true,
        message: 'Unknown status received',
        data: { status, tx_ref },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌❌❌ CRITICAL ERROR in webhook:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    return res.status(200).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ============================================================================
// WEBHOOK TEST ENDPOINT (FOR DEBUGGING)
// ============================================================================

/**
 * Test webhook endpoint - logs everything but doesn't update DB
 */
const testWebhook = async (req, res) => {
  console.log('\n🧪 [TEST WEBHOOK] Test webhook received');
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('📦 FULL TEST PAYLOAD:', JSON.stringify(req.body, null, 2));
  console.log('📋 ALL HEADERS:', JSON.stringify(req.headers, null, 2));
  console.log('🌐 Request IP:', req.ip);
  console.log('🔌 Request Method:', req.method);
  console.log('📌 Request URL:', req.originalUrl);
  
  return res.status(200).json({
    success: true,
    message: 'Test webhook received',
    received: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
};

// ============================================================================
// FORCE UPDATE ENDPOINT (FOR TESTING/EMERGENCY)
// ============================================================================

/**
 * Force update payment status for a user (USE ONLY FOR TESTING)
 */
const forceUpdatePayment = async (req, res) => {
  console.log('\n🔧 [FORCE UPDATE] Manual force update triggered');
  
  try {
    const { tx_ref, status = 'paid' } = req.body;
    
    console.log('📋 Force update params:', { tx_ref, status });
    
    if (!tx_ref) {
      console.log('❌ No tx_ref provided');
      return res.status(400).json({
        success: false,
        message: 'tx_ref is required'
      });
    }

    console.log('🔎 Searching for user with tx_ref:', tx_ref);
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (!user) {
      console.log('❌ User not found for tx_ref:', tx_ref);
      return res.status(404).json({
        success: false,
        message: 'User not found for this tx_ref'
      });
    }

    console.log('✅ User found:', { 
      email: user.email, 
      currentStatus: user.garageInfo.paymentStatus 
    });

    // Force update
    user.garageInfo.paymentStatus = 'paid';
    user.garageInfo.paymentDate = new Date();
    user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    user.garageInfo.verificationStatus = 'payment_completed';
    user.garageInfo.verificationProgress.paymentCompleted = true;
    
    await user.save();
    
    console.log('✅✅✅ FORCE UPDATE COMPLETE');
    console.log('New status:', {
      paymentStatus: user.garageInfo.paymentStatus,
      verificationStatus: user.garageInfo.verificationStatus
    });
    
    res.json({
      success: true,
      message: 'Payment status force updated to PAID',
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
      message: error.message
    });
  }
};

// ============================================================================
// CHECK PAYMENT STATUS ENDPOINT
// ============================================================================

/**
 * Check payment status for a user
 */
const checkPaymentStatus = async (req, res) => {
  console.log('\n📊 [STATUS CHECK] Checking payment status for user:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const paymentStatus = user.garageInfo?.paymentStatus || 'not_required';
    const verificationStatus = user.garageInfo?.verificationStatus || 'pending';
    
    console.log('📊 Payment status check result:', {
      email: user.email,
      paymentStatus,
      verificationStatus,
      paymentDate: user.garageInfo?.paymentDate,
      paymentExpiry: user.garageInfo?.paymentExpiry,
      paymentPlan: user.garageInfo?.paymentPlan,
      paymentTxRef: user.garageInfo?.paymentTxRef
    });

    res.json({
      success: true,
      data: {
        paymentStatus,
        verificationStatus,
        paymentDate: user.garageInfo?.paymentDate || null,
        paymentExpiry: user.garageInfo?.paymentExpiry || null,
        paymentPlan: user.garageInfo?.paymentPlan || null,
        paymentTxRef: user.garageInfo?.paymentTxRef || null,
        canAccess: {
          dashboard: ['approved', 'under_review', 'payment_completed'].includes(verificationStatus),
          payment: ['pending', 'failed', 'expired', 'processing'].includes(paymentStatus)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
};

// ============================================================================
// DEBUG WEBHOOK (FOR TESTING)
// ============================================================================

/**
 * Debug webhook - simulates Chapa callback
 */
const debugWebhook = async (req, res) => {
  console.log('\n🔧 [DEBUG WEBHOOK] Simulating Chapa callback');
  
  try {
    const { tx_ref, status = 'success' } = req.body;
    
    console.log('📋 Debug webhook params:', { tx_ref, status });
    
    if (!tx_ref) {
      console.log('❌ No tx_ref provided');
      return res.status(400).json({
        success: false,
        message: 'tx_ref is required'
      });
    }
    
    console.log('🔎 Searching for user with tx_ref:', tx_ref);
    const user = await User.findOne({ 'garageInfo.paymentTxRef': tx_ref });
    
    if (!user) {
      console.log('❌ User not found for tx_ref:', tx_ref);
      return res.status(404).json({
        success: false,
        message: 'User not found for this tx_ref'
      });
    }
    
    console.log('✅ User found:', { 
      email: user.email, 
      currentStatus: user.garageInfo.paymentStatus 
    });
    
    if (status === 'success') {
      console.log('💰 Simulating successful payment...');
      user.garageInfo.paymentStatus = 'paid';
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      await user.save();
      
      console.log('✅✅✅ DEBUG: Database updated to PAID');
      console.log('New status:', {
        paymentStatus: user.garageInfo.paymentStatus,
        verificationStatus: user.garageInfo.verificationStatus
      });
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
};

// ============================================================================
// MANUAL PAYMENT UPDATE (FOR ADMIN)
// ============================================================================

/**
 * Manually update payment status (admin only)
 */
const manualPaymentUpdate = async (req, res) => {
  console.log('\n👤 [MANUAL UPDATE] Admin manual update triggered');
  
  try {
    const { userId, status } = req.body;
    
    console.log('📋 Manual update params:', { userId, status });
    
    if (!userId || !status) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'User ID and status are required'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', { 
      email: user.email, 
      currentStatus: user.garageInfo.paymentStatus 
    });

    const validStatuses = ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    user.garageInfo.paymentStatus = status;
    
    if (status === 'paid') {
      user.garageInfo.paymentDate = new Date();
      user.garageInfo.paymentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.garageInfo.verificationStatus = 'payment_completed';
      user.garageInfo.verificationProgress.paymentCompleted = true;
      
      if (user.garageInfo.paymentPlan === 'yearly') {
        user.garageInfo.subscriptionPlan = 'premium';
        user.garageInfo.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }
    }

    await user.save();

    console.log('✅ Manual update completed for user:', {
      email: user.email,
      newStatus: user.garageInfo.paymentStatus
    });
    
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
  console.error('\n❌❌❌ PAYMENT ERROR HANDLER TRIGGERED');
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  
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
  
  // Additional utilities
  checkPaymentStatus,
  manualPaymentUpdate,
  forceUpdatePayment,
  debugWebhook,
  testWebhook,  // New test endpoint
  
  // Error handler
  paymentErrorHandler
};