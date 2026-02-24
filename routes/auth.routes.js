const express = require('express');
const router = express.Router();

// Import from auth controller
const {
  // Auth Middleware
  protect,
  authorize,

  // Auth Controllers
  register,
  registerGarageOwner,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  updateDetails,
  updatePassword,
  logout,

  // Registration Status Controller
  getRegistrationStatus,

  // Document Controllers
  uploadDocument,
  uploadDocuments,
  deleteDocument,
  getDocuments
} = require('../controllers/auth.controller');

// Import upload middleware
const {
  uploadFields,
  uploadMultipleFiles,
  uploadSingleFile
} = require('../middleware/upload.middleware');

const User = require('../models/User');

// ============================================================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================================================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new regular user
 * @access  Public
 */
router.post('/register', register);

/**
 * @route   POST /api/v1/auth/register-garage
 * @desc    Register a new garage owner with documents
 * @access  Public
 */


router.post(
  '/register-garage',
  (req, res, next) => {
    console.log('=== INCOMING FIELDS ===');
    if (req.body) console.log('Body fields:', Object.keys(req.body));
    if (req.files) console.log('File fields:', Object.keys(req.files));
    
    uploadFields(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  registerGarageOwner
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Forgot password - sends reset token to email
 * @access  Public
 */
router.post('/forgot-password', forgotPassword);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', resetPassword);

// ============================================================================
// PROTECTED ROUTES (Authentication Required)
// ============================================================================

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged in user profile
 * @access  Private
 */
router.get('/me', protect, getMe);

/**
 * @route   GET /api/v1/auth/registration-status
 * @desc    Get registration and payment status for garage owners
 * @access  Private
 */
router.get('/registration-status', protect, getRegistrationStatus);

/**
 * @route   PUT /api/v1/auth/updatedetails
 * @desc    Update user details
 * @access  Private
 */
router.put('/updatedetails', protect, updateDetails);

/**
 * @route   PUT /api/v1/auth/updatepassword
 * @desc    Update password
 * @access  Private
 */
router.put('/updatepassword', protect, updatePassword);

/**
 * @route   GET /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.get('/logout', protect, logout);

// ============================================================================
// DOCUMENT MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   POST /api/v1/auth/documents/upload
 * @desc    Upload a single document
 * @access  Private (Garage Owners only)
 */
router.post(
  '/documents/upload',
  protect,
  authorize('garage_owner'),
  (req, res, next) => {
    uploadSingleFile(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  uploadDocument
);

/**
 * @route   POST /api/v1/auth/documents/upload-multiple
 * @desc    Upload multiple documents
 * @access  Private (Garage Owners only)
 */
router.post(
  '/documents/upload-multiple',
  protect,
  authorize('garage_owner'),
  (req, res, next) => {
    uploadMultipleFiles(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  uploadDocuments
);

/**
 * @route   GET /api/v1/auth/documents
 * @desc    Get all documents for the logged in user
 * @access  Private (Garage Owners only)
 */
router.get(
  '/documents',
  protect,
  authorize('garage_owner'),
  getDocuments
);

/**
 * @route   DELETE /api/v1/auth/documents/:documentId
 * @desc    Delete a specific document
 * @access  Private (Garage Owners only)
 */
router.delete(
  '/documents/:documentId',
  protect,
  authorize('garage_owner'),
  deleteDocument
);

// ============================================================================
// ADMIN ROUTES (Admin Only)
// ============================================================================

/**
 * @route   GET /api/v1/auth/admin/garages/pending
 * @desc    Get all pending garage owner applications with payment status
 * @access  Private (Admin only)
 */
router.get(
  '/admin/garages/pending',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { status, payment } = req.query;

      let query = { role: 'garage_owner' };

      // Filter by verification status
      if (status) {
        query['garageInfo.verificationStatus'] = status;
      } else {
        // Default: show applications ready for review
        query['garageInfo.verificationStatus'] = { 
          $in: ['payment_completed', 'under_review', 'more_info_needed'] 
        };
      }

      // Filter by payment status
      if (payment) {
        query['garageInfo.paymentStatus'] = payment;
      }

      const pendingGarages = await User.find(query)
        .select('name email phone createdAt garageInfo.businessName garageInfo.verificationStatus garageInfo.paymentStatus garageInfo.documents')
        .sort({ createdAt: -1 });

      // Get counts for dashboard
      const [
        pendingPayment,
        paymentCompleted,
        underReview,
        approved,
        rejected
      ] = await Promise.all([
        User.countDocuments({ role: 'garage_owner', 'garageInfo.verificationStatus': 'pending_payment' }),
        User.countDocuments({ role: 'garage_owner', 'garageInfo.verificationStatus': 'payment_completed' }),
        User.countDocuments({ role: 'garage_owner', 'garageInfo.verificationStatus': 'under_review' }),
        User.countDocuments({ role: 'garage_owner', 'garageInfo.verificationStatus': 'approved' }),
        User.countDocuments({ role: 'garage_owner', 'garageInfo.verificationStatus': 'rejected' })
      ]);

      res.status(200).json({
        success: true,
        counts: {
          pending_payment: pendingPayment,
          payment_completed: paymentCompleted,
          under_review: underReview,
          approved,
          rejected
        },
        data: pendingGarages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching pending garages',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/v1/auth/admin/garages/:garageId
 * @desc    Get detailed garage owner information for review
 * @access  Private (Admin only)
 */
router.get(
  '/admin/garages/:garageId',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const garage = await User.findById(req.params.garageId)
        .select('-password')
        .populate('garageInfo.documents.verifiedBy', 'name email')
        .populate('garageInfo.adminReviews.reviewedBy', 'name email');

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Add payment summary
      const paymentSummary = {
        status: garage.garageInfo?.paymentStatus || 'not_required',
        plan: garage.garageInfo?.paymentPlan || 'basic',
        amount: garage.garageInfo?.paymentAmount || null,
        date: garage.garageInfo?.paymentDate || null,
        expiry: garage.garageInfo?.paymentExpiry || null,
        txRef: garage.garageInfo?.paymentTxRef || null
      };

      res.status(200).json({
        success: true,
        data: {
          ...garage.toObject(),
          paymentSummary
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching garage details',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/v1/auth/admin/garages/:garageId/approve
 * @desc    Approve a garage owner application
 * @access  Private (Admin only)
 */
router.put(
  '/admin/garages/:garageId/approve',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { comments, approvalNumber } = req.body;

      const garage = await User.findById(req.params.garageId);

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Check if payment is completed
      if (garage.garageInfo.paymentStatus !== 'paid' && garage.garageInfo.paymentStatus !== 'not_required') {
        return res.status(400).json({
          success: false,
          message: 'Cannot approve: Payment not completed'
        });
      }

      // Use the approve method from the model
      if (typeof garage.approve === 'function') {
        await garage.approve(req.user.id, { comments, approvalNumber });
      } else {
        // Fallback if method doesn't exist
        garage.garageInfo.verificationStatus = 'approved';
        garage.garageInfo.approvedAt = new Date();
        garage.garageInfo.approvedBy = req.user.id;
        garage.garageInfo.approvalNumber = approvalNumber || `GAR-${Date.now()}`;
        await garage.save();
      }

      res.status(200).json({
        success: true,
        message: 'Garage owner approved successfully',
        data: {
          id: garage._id,
          businessName: garage.garageInfo.businessName,
          verificationStatus: garage.garageInfo.verificationStatus,
          paymentStatus: garage.garageInfo.paymentStatus,
          approvalNumber: garage.garageInfo.approvalNumber,
          approvedAt: garage.garageInfo.approvedAt
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error approving garage',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/v1/auth/admin/garages/:garageId/reject
 * @desc    Reject a garage owner application
 * @access  Private (Admin only)
 */
router.put(
  '/admin/garages/:garageId/reject',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { reason, details } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const garage = await User.findById(req.params.garageId);

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Use the reject method from the model or fallback
      if (typeof garage.reject === 'function') {
        await garage.reject(req.user.id, reason, details || []);
      } else {
        garage.garageInfo.verificationStatus = 'rejected';
        garage.garageInfo.rejectionReason = reason;
        garage.garageInfo.rejectionDetails = details || [];
        garage.garageInfo.rejectedAt = new Date();
        garage.garageInfo.rejectedBy = req.user.id;
        await garage.save();
      }

      res.status(200).json({
        success: true,
        message: 'Garage owner application rejected',
        data: {
          id: garage._id,
          businessName: garage.garageInfo.businessName,
          verificationStatus: garage.garageInfo.verificationStatus,
          rejectionReason: garage.garageInfo.rejectionReason
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error rejecting garage',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/v1/auth/admin/garages/:garageId/request-info
 * @desc    Request more information from garage owner
 * @access  Private (Admin only)
 */
router.put(
  '/admin/garages/:garageId/request-info',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { requestedItems, description } = req.body;

      if (!requestedItems || !description) {
        return res.status(400).json({
          success: false,
          message: 'Requested items and description are required'
        });
      }

      const garage = await User.findById(req.params.garageId);

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Use the requestMoreInfo method from the model or fallback
      if (typeof garage.requestMoreInfo === 'function') {
        await garage.requestMoreInfo(req.user.id, requestedItems, description);
      } else {
        garage.garageInfo.verificationStatus = 'more_info_needed';
        if (!garage.garageInfo.infoRequests) {
          garage.garageInfo.infoRequests = [];
        }
        garage.garageInfo.infoRequests.push({
          requestedBy: req.user.id,
          items: requestedItems,
          description,
          requestedAt: new Date(),
          status: 'pending'
        });
        await garage.save();
      }

      res.status(200).json({
        success: true,
        message: 'Information requested successfully',
        data: {
          id: garage._id,
          businessName: garage.garageInfo.businessName,
          verificationStatus: garage.garageInfo.verificationStatus,
          infoRequests: garage.garageInfo.infoRequests
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error requesting information',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/v1/auth/admin/garages/:garageId/suspend
 * @desc    Suspend a garage owner account
 * @access  Private (Admin only)
 */
router.put(
  '/admin/garages/:garageId/suspend',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { reason, duration } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Suspension reason is required'
        });
      }

      const garage = await User.findById(req.params.garageId);

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Use the suspend method from the model or fallback
      if (typeof garage.suspend === 'function') {
        await garage.suspend(req.user.id, reason, duration);
      } else {
        garage.garageInfo.verificationStatus = 'suspended';
        garage.garageInfo.suspensionReason = reason;
        garage.garageInfo.suspendedAt = new Date();
        garage.garageInfo.suspendedBy = req.user.id;
        garage.garageInfo.suspensionDuration = duration;
        garage.isActive = false;
        await garage.save();
      }

      res.status(200).json({
        success: true,
        message: 'Garage owner suspended successfully',
        data: {
          id: garage._id,
          businessName: garage.garageInfo.businessName,
          verificationStatus: garage.garageInfo.verificationStatus,
          isActive: garage.isActive
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error suspending garage',
        error: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/v1/auth/admin/garages/:garageId/verify-document/:documentId
 * @desc    Verify a specific document
 * @access  Private (Admin only)
 */
router.put(
  '/admin/garages/:garageId/verify-document/:documentId',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { notes } = req.body;

      const garage = await User.findById(req.params.garageId);

      if (!garage || garage.role !== 'garage_owner') {
        return res.status(404).json({
          success: false,
          message: 'Garage owner not found'
        });
      }

      // Use the verifyDocument method from the model or fallback
      if (typeof garage.verifyDocument === 'function') {
        await garage.verifyDocument(req.params.documentId, req.user.id, notes);
      } else {
        const document = garage.garageInfo.documents.id(req.params.documentId);
        if (document) {
          document.status = 'verified';
          document.verifiedAt = new Date();
          document.verifiedBy = req.user.id;
          document.verificationNotes = notes;
          await garage.save();
        }
      }

      res.status(200).json({
        success: true,
        message: 'Document verified successfully',
        data: {
          documentId: req.params.documentId,
          status: 'verified'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error verifying document',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/v1/auth/admin/stats
 * @desc    Get admin statistics with payment info
 * @access  Private (Admin only)
 */
router.get(
  '/admin/stats',
  protect,
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const [
        totalUsers,
        totalGarages,
        pendingPayment,
        paymentCompleted,
        underReview,
        approvedGarages,
        rejectedGarages,
        suspendedGarages,
        totalRevenue
      ] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'garage_owner' }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'pending_payment' 
        }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'payment_completed' 
        }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'under_review' 
        }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'approved' 
        }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'rejected' 
        }),
        User.countDocuments({ 
          role: 'garage_owner', 
          'garageInfo.verificationStatus': 'suspended' 
        }),
        // Calculate total revenue from paid garages
        User.aggregate([
          { $match: { role: 'garage_owner', 'garageInfo.paymentStatus': 'paid' } },
          { $group: { _id: null, total: { $sum: '$garageInfo.paymentAmount' } } }
        ])
      ]);

      // Get payment status counts
      const paymentStats = await User.aggregate([
        { $match: { role: 'garage_owner' } },
        { $group: {
          _id: '$garageInfo.paymentStatus',
          count: { $sum: 1 }
        }}
      ]);

      const paymentCounts = {
        paid: 0,
        pending: 0,
        failed: 0,
        expired: 0,
        not_required: 0
      };

      paymentStats.forEach(stat => {
        if (stat._id) paymentCounts[stat._id] = stat.count;
      });

      res.status(200).json({
        success: true,
        data: {
          users: { total: totalUsers },
          garages: {
            total: totalGarages,
            byStatus: {
              pending_payment: pendingPayment,
              payment_completed: paymentCompleted,
              under_review: underReview,
              approved: approvedGarages,
              rejected: rejectedGarages,
              suspended: suspendedGarages
            },
            byPayment: paymentCounts
          },
          revenue: {
            total: totalRevenue[0]?.total || 0,
            currency: 'ETB'
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching stats',
        error: error.message
      });
    }
  }
);

// ============================================================================
// EXPORT ROUTER
// ============================================================================

module.exports = router;