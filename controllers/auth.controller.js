const User = require('../model/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose'); // Add this import

dotenv.config();

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// @desc    Register user
// @route   POST /api/v1/auth/register
const register = async (req, res) => {
  try {
    console.log('=== REGISTRATION ATTEMPT ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Content-Type:', req.get('Content-Type'));
    
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      console.log('Missing required fields:', { 
        name: !!name, 
        email: !!email, 
        password: !!password 
      });
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields: name, email, password' 
      });
    }

    // Validate email format
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    console.log('MongoDB connection state:', dbState);
    console.log('MongoDB state meaning:', 
      dbState === 0 ? 'Disconnected' :
      dbState === 1 ? 'Connected' :
      dbState === 2 ? 'Connecting' :
      dbState === 3 ? 'Disconnecting' : 'Unknown'
    );

    if (dbState !== 1) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    // Check if user exists
    console.log('Checking if user exists with email:', email);
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log('User already exists:', email);
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }

    // Create user
    console.log('Creating new user...');
    const userData = {
      name,
      email,
      password,
      role: role || 'user'
    };
    console.log('User data (password hidden):', {
      ...userData,
      password: '[HIDDEN]'
    });

    const user = new User(userData);
    
    // Save user (this triggers the pre-save hook)
    console.log('Saving user to database...');
    const savedUser = await user.save();
    console.log('User saved successfully. ID:', savedUser._id);

    // Generate token
    console.log('Generating JWT token...');
    const token = generateToken(savedUser);
    console.log('Token generated successfully');

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
    console.error('=== REGISTRATION ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    // Handle duplicate key error (email already exists)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
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
      return res.status(500).json({
        success: false,
        message: 'Database connection error. Please try again later.'
      });
    }

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(500).json({
        success: false,
        message: 'Token generation failed'
      });
    }

    // Handle other errors
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      ...(process.env.NODE_ENV === 'development' && { 
        debug: {
          name: error.name,
          message: error.message
        }
      })
    });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
const login = async (req, res) => {
  try {
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Request body:', { ...req.body, password: '[HIDDEN]' });
    
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password' 
      });
    }

    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    console.log('Finding user with email:', email);

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    console.log('User found, checking password...');
    console.log('Stored password hash:', user.password ? '[HASHED]' : 'No password');
    
    // Check password
    const isMatch = await user.matchPassword(password);
    
    console.log('Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('Password mismatch for user:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Generate token
    console.log('Generating token for user:', user._id);
    const token = generateToken(user);

    console.log('Login successful for:', email);

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
    console.error('=== LOGIN ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      ...(process.env.NODE_ENV === 'development' && { 
        debug: error.message 
      })
    });
  }
};

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    console.log('=== FORGOT PASSWORD ATTEMPT ===');
    console.log('Request body:', req.body);
    
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email address'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found for password reset:', email);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHashed;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    console.log('Password reset token generated for:', email);

    res.status(200).json({
      success: true,
      message: 'Password reset token generated',
      data: {
        resetToken // In production, you would email this token
      }
    });
  } catch (error) {
    console.error('=== FORGOT PASSWORD ERROR ===');
    console.error('Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Reset password
// @route   POST /api/v1/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    console.log('=== RESET PASSWORD ATTEMPT ===');
    console.log('Request body:', { ...req.body, password: '[HIDDEN]' });
    
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Token and new password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Hash the token from request
    const resetTokenHashed = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHashed,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      console.log('Invalid or expired token used');
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }

    console.log('User found for password reset:', user.email);

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    console.log('Password reset successful for:', user.email);

    res.status(200).json({ 
      success: true,
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('=== RESET PASSWORD ERROR ===');
    console.error('Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
};