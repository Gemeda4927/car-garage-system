const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

// =====================================
// HELPER FUNCTIONS
// =====================================

/**
 * Generate JWT Token
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      role: user.role,
      email: user.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Validate email format
 * @param {String} email - Email to validate
 * @returns {Boolean} - Is valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

/**
 * Check database connection
 * @returns {Object} - Connection status
 */
const checkDbConnection = () => {
  const dbState = mongoose.connection.readyState;
  const stateMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };
  
  return {
    isConnected: dbState === 1,
    state: stateMap[dbState] || 'Unknown',
    code: dbState
  };
};

/**
 * Send error response with optional debug info
 * @param {Object} res - Response object
 * @param {Number} status - HTTP status code
 * @param {String} message - Error message
 * @param {Object} error - Error object for debugging
 */
const sendErrorResponse = (res, status, message, error = null) => {
  const response = {
    success: false,
    message
  };

  // Add debug info in development
  if (process.env.NODE_ENV === 'development' && error) {
    response.debug = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return res.status(status).json(response);
};

// =====================================
// AUTH MIDDLEWARE
// =====================================

/**
 * Protect routes - Verify JWT token
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return sendErrorResponse(res, 401, 'Not authorized to access this route');
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return sendErrorResponse(res, 401, 'User not found');
      }

      // Check if user is active
      if (user.isActive === false) {
        return sendErrorResponse(res, 401, 'User account is deactivated');
      }

      // Attach user to request object
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return sendErrorResponse(res, 401, 'Invalid token');
      }
      if (error.name === 'TokenExpiredError') {
        return sendErrorResponse(res, 401, 'Token expired');
      }
      throw error;
    }
  } catch (error) {
    return sendErrorResponse(res, 500, 'Server error during authentication', error);
  }
};

/**
 * Authorize roles - Restrict access to specific roles
 * @param {...String} roles - Allowed roles
 * @returns {Function} - Middleware function
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendErrorResponse(res, 401, 'Not authorized');
    }

    if (!roles.includes(req.user.role)) {
      return sendErrorResponse(res, 403, `User role ${req.user.role} is not authorized to access this route`);
    }

    next();
  };
};

// =====================================
// AUTH CONTROLLERS
// =====================================

/**
 * @desc    Register user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    console.log('=== REGISTRATION ATTEMPT ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return sendErrorResponse(res, 400, 'Please provide all required fields: name, email, password');
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return sendErrorResponse(res, 400, 'Please provide a valid email address');
    }

    // Validate password length
    if (password.length < 6) {
      return sendErrorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // Validate role if provided
    const validRoles = ['user', 'garage_owner', 'admin'];
    if (role && !validRoles.includes(role)) {
      return sendErrorResponse(res, 400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check database connection
    const dbStatus = checkDbConnection();
    if (!dbStatus.isConnected) {
      return sendErrorResponse(res, 500, 'Database not connected');
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return sendErrorResponse(res, 400, 'User already exists');
    }

    // Create user
    const userData = {
      name,
      email,
      password,
      role: role || 'user'
    };

    const user = new User(userData);
    const savedUser = await user.save();

    // Generate token
    const token = generateToken(savedUser);

    // Send response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        token
      }
    });
  } catch (error) {
    console.error('=== REGISTRATION ERROR ===', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return sendErrorResponse(res, 400, 'Email already exists');
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => ({
        field: val.path,
        message: val.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    // Handle MongoDB connection errors
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      return sendErrorResponse(res, 500, 'Database connection error. Please try again later.');
    }

    sendErrorResponse(res, 500, 'Server error during registration', error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    console.log('=== LOGIN ATTEMPT ===');
    
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return sendErrorResponse(res, 400, 'Please provide email and password');
    }

    // Check database connection
    const dbStatus = checkDbConnection();
    if (!dbStatus.isConnected) {
      return sendErrorResponse(res, 500, 'Database not connected');
    }

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return sendErrorResponse(res, 401, 'Invalid credentials');
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return sendErrorResponse(res, 401, 'Invalid credentials');
    }

    // Check if user is active
    if (user.isActive === false) {
      return sendErrorResponse(res, 401, 'Your account has been deactivated. Please contact support.');
    }

    // Generate token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (error) {
    console.error('=== LOGIN ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during login', error);
  }
};

/**
 * @desc    Forgot password
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(res, 400, 'Please provide email address');
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHashed;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // TODO: Send email with reset token
    console.log('Password reset token generated for:', email);

    res.status(200).json({
      success: true,
      message: 'Password reset token generated',
      data: {
        resetToken // In production, remove this and send via email
      }
    });
  } catch (error) {
    console.error('=== FORGOT PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during password reset request', error);
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/v1/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return sendErrorResponse(res, 400, 'Token and new password are required');
    }

    if (password.length < 6) {
      return sendErrorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // Hash the token from request
    const resetTokenHashed = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHashed,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return sendErrorResponse(res, 400, 'Invalid or expired token');
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({ 
      success: true,
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('=== RESET PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during password reset', error);
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('=== GET PROFILE ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while fetching profile', error);
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/auth/updatedetails
 * @access  Private
 */
const updateDetails = async (req, res) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email
    };

    // Remove undefined fields
    Object.keys(fieldsToUpdate).forEach(key => 
      fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
    );

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    }).select('-password');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('=== UPDATE PROFILE ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while updating profile', error);
  }
};

/**
 * @desc    Update password
 * @route   PUT /api/v1/auth/updatepassword
 * @access  Private
 */
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendErrorResponse(res, 400, 'Please provide current and new password');
    }

    if (newPassword.length < 6) {
      return sendErrorResponse(res, 400, 'New password must be at least 6 characters long');
    }

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return sendErrorResponse(res, 401, 'Current password is incorrect');
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('=== UPDATE PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while updating password', error);
  }
};

/**
 * @desc    Logout user / Clear cookie
 * @route   GET /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('=== LOGOUT ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during logout', error);
  }
};

// =====================================
// EXPORTS
// =====================================

module.exports = {
  // Middleware
  protect,
  authorize,
  
  // Auth Controllers
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  updateDetails,
  updatePassword,
  logout
};