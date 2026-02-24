const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

dotenv.config();

// ============================================================================
// CLOUDINARY CONFIGURATION
// ============================================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configured with cloud:', process.env.CLOUDINARY_CLOUD_NAME);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate JWT Token
 */
const generateToken = (user) => {
  console.log('🔐 Generating JWT token for user:', user.email);
  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
  console.log('✅ Token generated successfully');
  return token;
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  const isValid = emailRegex.test(email);
  console.log(`📧 Email validation for ${email}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  return isValid;
};

/**
 * Check database connection
 */
const checkDbConnection = () => {
  const dbState = mongoose.connection.readyState;
  const stateMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };

  const status = {
    isConnected: dbState === 1,
    state: stateMap[dbState] || 'Unknown',
    code: dbState
  };

  console.log(`📊 Database connection status: ${status.state} (${status.code})`);
  return status;
};

/**
 * Send error response
 */
const sendErrorResponse = (res, status, message, error = null) => {
  console.log(`❌ Error Response [${status}]: ${message}`);
  if (error) console.error('Error details:', error);

  const response = { success: false, message };

  if (process.env.NODE_ENV === 'development' && error) {
    response.debug = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return res.status(status).json(response);
};

/**
 * Upload file to Cloudinary from buffer
 */
const uploadFromBuffer = (fileBuffer, folder = 'smartgarage/documents', options = {}) => {
  console.log(`📤 Uploading file to Cloudinary folder: ${folder}`);
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        ...options
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload successful:', result.secure_url);
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Upload profile image to Cloudinary
 */
const uploadProfileImage = (fileBuffer, userId) => {
  console.log(`📤 Uploading profile image for user: ${userId}`);
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'smartgarage/profiles',
        resource_type: 'image',
        public_id: `profile-${userId}-${Date.now()}`,
        transformation: [
          { width: 400, height: 400, crop: 'fill' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('❌ Profile image upload error:', error);
          reject(error);
        } else {
          console.log('✅ Profile image uploaded:', result.secure_url);
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Delete file from Cloudinary
 */
const deleteFromCloudinary = async (publicId) => {
  console.log(`🗑️ Deleting file from Cloudinary: ${publicId}`);
  
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Cloudinary deletion result:', result);
    return result;
  } catch (error) {
    console.error('❌ Error deleting from Cloudinary:', error);
    throw error;
  }
};

/**
 * Generate approval number for garage owners
 */
const generateApprovalNumber = () => {
  const prefix = 'GAR';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  const approvalNumber = `${prefix}-${timestamp}-${random}`;
  console.log('📋 Generated approval number:', approvalNumber);
  return approvalNumber;
};

/**
 * Calculate registration progress percentage
 */
const calculateProgress = (garageInfo) => {
  console.log('📊 Calculating registration progress');
  
  let total = 0;
  let completed = 0;

  // Step 1: Basic info (always true after registration)
  total++;
  completed++;

  // Step 2: Business details
  total++;
  if (garageInfo.businessName && garageInfo.businessRegNumber) completed++;

  // Step 3: Documents
  total++;
  if (garageInfo.documents && garageInfo.documents.length >= 1) completed++;

  // Step 4: Payment
  total++;
  if (garageInfo.paymentStatus === 'paid') completed++;

  // Step 5: Admin approval
  total++;
  if (garageInfo.verificationStatus === 'approved') completed++;

  const progress = Math.round((completed / total) * 100);
  console.log(`📈 Progress: ${progress}% (${completed}/${total} steps completed)`);
  
  return progress;
};

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
  console.log('\n🛡️ [PROTECT] Verifying authentication');
  
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔑 Token received:', token.substring(0, 20) + '...');
    }

    if (!token) {
      console.log('❌ No token provided');
      return sendErrorResponse(res, 401, 'Not authorized to access this route');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token verified for user:', decoded.email);

      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        console.log('❌ User not found for token');
        return sendErrorResponse(res, 401, 'User not found');
      }

      if (user.isActive === false) {
        console.log('❌ User account is deactivated:', user.email);
        return sendErrorResponse(res, 401, 'User account is deactivated');
      }

      console.log('✅ User authenticated:', { id: user._id, email: user.email, role: user.role });
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        console.log('❌ Invalid token');
        return sendErrorResponse(res, 401, 'Invalid token');
      }
      if (error.name === 'TokenExpiredError') {
        console.log('❌ Token expired');
        return sendErrorResponse(res, 401, 'Token expired');
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return sendErrorResponse(res, 500, 'Server error during authentication', error);
  }
};

/**
 * Authorize roles - Restrict access to specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log(`\n🔒 [AUTHORIZE] Checking roles: ${roles.join(', ')}`);
    console.log('👤 User role:', req.user?.role);

    if (!req.user) {
      console.log('❌ No user in request');
      return sendErrorResponse(res, 401, 'Not authorized');
    }

    if (!roles.includes(req.user.role)) {
      console.log(`❌ Role ${req.user.role} not authorized`);
      return sendErrorResponse(res, 403, `User role ${req.user.role} is not authorized to access this route`);
    }

    console.log('✅ Authorization successful');
    next();
  };
};

// ============================================================================
// AUTH CONTROLLERS
// ============================================================================

// ----------------------------------------------------------------------------
// Register Regular User (with optional profile image)
// ----------------------------------------------------------------------------

/**
 * @desc    Register regular user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  console.log('\n📝 [1/6] REGISTER USER - Starting registration');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { name, email, password, phone, role } = req.body;
    let profileImage = null;

    // Validate required fields
    console.log('📋 Validating required fields...');
    if (!name || !email || !password || !phone) {
      console.log('❌ Missing required fields');
      return sendErrorResponse(res, 400, 'Please provide all required fields: name, email, password, phone');
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return sendErrorResponse(res, 400, 'Please provide a valid email address');
    }

    // Validate password length
    if (password.length < 8) {
      console.log('❌ Password too short');
      return sendErrorResponse(res, 400, 'Password must be at least 8 characters long');
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      console.log('❌ Password not strong enough');
      return sendErrorResponse(res, 400, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    // Validate role if provided
    const validRoles = ['user', 'garage_owner'];
    if (role && !validRoles.includes(role)) {
      console.log('❌ Invalid role:', role);
      return sendErrorResponse(res, 400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check database connection
    const dbStatus = checkDbConnection();
    if (!dbStatus.isConnected) {
      return sendErrorResponse(res, 500, 'Database not connected');
    }

    // Check if user exists
    console.log('🔍 Checking if user exists:', email);
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log('❌ User already exists:', email);
      return sendErrorResponse(res, 400, 'User already exists');
    }
    console.log('✅ Email available');

    // Handle profile image upload if provided
    if (req.file) {
      console.log('📸 Profile image provided, uploading...');
      try {
        const result = await uploadProfileImage(req.file.buffer, `temp-${Date.now()}`);
        profileImage = result.secure_url;
        console.log('✅ Profile image uploaded:', profileImage);
      } catch (uploadError) {
        console.error('❌ Error uploading profile image:', uploadError);
        // Continue without profile image if upload fails
      }
    }

    // Create user
    console.log('👤 Creating new user...');
    const userData = {
      name,
      email,
      password,
      phone,
      role: role || 'user',
      profileImage
    };

    const user = new User(userData);
    const savedUser = await user.save();
    console.log('✅ User saved with ID:', savedUser._id);

    // Generate token
    const token = generateToken(savedUser);

    // Send response
    console.log('📤 Registration successful for:', email);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        phone: savedUser.phone,
        role: savedUser.role,
        profileImage: savedUser.profileImage,
        token
      }
    });
  } catch (error) {
    console.error('❌=== REGISTRATION ERROR ===', error);

    if (error.code === 11000) {
      return sendErrorResponse(res, 400, 'Email already exists');
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => ({
        field: val.path,
        message: val.message
      }));
      console.log('❌ Validation errors:', messages);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      return sendErrorResponse(res, 500, 'Database connection error. Please try again later.');
    }

    sendErrorResponse(res, 500, 'Server error during registration', error);
  }
};

// ----------------------------------------------------------------------------
// Register Garage Owner (BANK DETAILS REMOVED - with optional profile image)
// ----------------------------------------------------------------------------

/**
 * @desc    Register garage owner with documents
 * @route   POST /api/v1/auth/register-garage
 * @access  Public
 */
const registerGarageOwner = async (req, res) => {
  console.log('\n🏢 [1/8] GARAGE OWNER REGISTRATION - Starting');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Files received:', req.files ? Object.keys(req.files) : 'No files');
  
  try {
    const {
      name, email, password, phone,
      businessName, businessRegNumber, taxId, yearsOfExperience,
      address, city, state, country, zipCode,
      businessPhone, businessEmail, website,
      serviceCategories, specializedBrands,
      numberOfBays, staffCount,
      mondayHours, tuesdayHours, wednesdayHours, thursdayHours,
      fridayHours, saturdayHours, sundayHours,
      emergencyServices,
      licenseNumber, insuranceProvider, insuranceNumber,
      description, specialties, establishedYear
    } = req.body;

    let profileImage = null;

    // Validate required fields
    console.log('📋 [2/8] Validating required fields...');
    if (!name || !email || !password || !phone) {
      console.log('❌ Missing user fields');
      return sendErrorResponse(res, 400, 'Please provide all required user fields');
    }

    if (!businessName || !businessRegNumber || !address || !businessPhone || !businessEmail || !licenseNumber || !description) {
      console.log('❌ Missing business fields');
      return sendErrorResponse(res, 400, 'Please provide all required business fields');
    }
    console.log('✅ All required fields present');

    // Validate email format
    if (!isValidEmail(email) || !isValidEmail(businessEmail)) {
      return sendErrorResponse(res, 400, 'Please provide valid email addresses');
    }

    // Validate password length
    if (password.length < 8) {
      console.log('❌ Password too short');
      return sendErrorResponse(res, 400, 'Password must be at least 8 characters long');
    }

    // Check database connection
    const dbStatus = checkDbConnection();
    if (!dbStatus.isConnected) {
      return sendErrorResponse(res, 500, 'Database not connected');
    }

    // Check if user exists
    console.log('🔍 [3/8] Checking if user exists...');
    const userExists = await User.findOne({
      $or: [
        { email },
        { 'garageInfo.businessEmail': businessEmail },
        { 'garageInfo.businessRegNumber': businessRegNumber }
      ]
    });

    if (userExists) {
      if (userExists.email === email) {
        console.log('❌ Email already exists:', email);
        return sendErrorResponse(res, 400, 'Email already exists');
      }
      if (userExists.garageInfo?.businessEmail === businessEmail) {
        console.log('❌ Business email already exists:', businessEmail);
        return sendErrorResponse(res, 400, 'Business email already exists');
      }
      if (userExists.garageInfo?.businessRegNumber === businessRegNumber) {
        console.log('❌ Business registration number already exists:', businessRegNumber);
        return sendErrorResponse(res, 400, 'Business registration number already exists');
      }
    }
    console.log('✅ Email and business info available');

    // Handle profile image upload if provided
    if (req.files && req.files.profileImage) {
      console.log('📸 [4/8] Uploading profile image...');
      try {
        const file = req.files.profileImage[0];
        const result = await uploadProfileImage(file.buffer, `temp-${Date.now()}`);
        profileImage = result.secure_url;
        console.log('✅ Profile image uploaded:', profileImage);
      } catch (uploadError) {
        console.error('❌ Error uploading profile image:', uploadError);
        // Continue without profile image if upload fails
      }
    }

    // Process uploaded documents with Cloudinary
    const documents = [];
    const agreements = [];

    // Helper function to upload to Cloudinary
    const uploadToCloudinary = async (file) => {
      try {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'smartgarage/documents',
              resource_type: 'auto',
              public_id: `${Date.now()}-${file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '-')}`,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
      } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
      }
    };

    // Handle business license
    console.log('📄 [5/8] Processing uploaded documents...');
    if (req.files && req.files.businessLicense) {
      try {
        const file = req.files.businessLicense[0];
        console.log('📄 Uploading business license:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'business_license',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending',
          metadata: {
            licenseNumber: licenseNumber,
            issuingAuthority: 'Government Agency',
            issueDate: new Date()
          }
        });
        console.log('✅ Business license uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading business license:', uploadError);
        return sendErrorResponse(res, 500, 'Error uploading business license file');
      }
    }

    // Handle certificate of incorporation (optional)
    if (req.files && req.files.certificateOfIncorporation) {
      try {
        const file = req.files.certificateOfIncorporation[0];
        console.log('📄 Uploading certificate of incorporation:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'certificate_of_incorporation',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending'
        });
        console.log('✅ Certificate uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading certificate:', uploadError);
        // Don't fail registration for optional documents
      }
    }

    // Handle tax clearance (optional)
    if (req.files && req.files.taxClearance) {
      try {
        const file = req.files.taxClearance[0];
        console.log('📄 Uploading tax clearance:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'tax_clearance',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending'
        });
        console.log('✅ Tax clearance uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading tax clearance:', uploadError);
        // Don't fail registration for optional documents
      }
    }

    // Handle insurance certificate (optional)
    if (req.files && req.files.insuranceCertificate) {
      try {
        const file = req.files.insuranceCertificate[0];
        console.log('📄 Uploading insurance certificate:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'insurance_certificate',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending',
          metadata: {
            insuranceProvider,
            insuranceNumber,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          }
        });
        console.log('✅ Insurance certificate uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading insurance:', uploadError);
        // Don't fail registration for optional documents
      }
    }

    // Handle garage agreement (required)
    if (req.files && req.files.garageAgreement) {
      try {
        const file = req.files.garageAgreement[0];
        console.log('📄 Uploading garage agreement:', file.originalname);
        const result = await uploadToCloudinary(file);
        agreements.push({
          agreementType: 'garage_partnership_agreement',
          agreementName: file.originalname,
          agreementUrl: result.secure_url,
          signedAt: new Date(),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          signature: {
            type: 'uploaded',
            value: result.secure_url
          },
          version: '1.0',
          isActive: true
        });
        console.log('✅ Garage agreement uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading agreement:', uploadError);
        return sendErrorResponse(res, 500, 'Error uploading agreement file');
      }
    } else {
      console.log('❌ Garage agreement is required but not provided');
      return sendErrorResponse(res, 400, 'Garage agreement is required');
    }

    // Handle identity proof (optional)
    if (req.files && req.files.identityProof) {
      try {
        const file = req.files.identityProof[0];
        console.log('📄 Uploading identity proof:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'identity_proof',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending'
        });
        console.log('✅ Identity proof uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading identity proof:', uploadError);
        // Don't fail registration for optional documents
      }
    }

    // Handle address proof (optional)
    if (req.files && req.files.addressProof) {
      try {
        const file = req.files.addressProof[0];
        console.log('📄 Uploading address proof:', file.originalname);
        const result = await uploadToCloudinary(file);
        documents.push({
          documentType: 'address_proof',
          documentName: file.originalname,
          documentUrl: result.secure_url,
          publicId: result.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'pending'
        });
        console.log('✅ Address proof uploaded:', result.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading address proof:', uploadError);
        // Don't fail registration for optional documents
      }
    }

    // Handle other documents (optional)
    if (req.files && req.files.otherDocuments) {
      console.log(`📄 Processing ${req.files.otherDocuments.length} other documents...`);
      for (const file of req.files.otherDocuments) {
        try {
          const result = await uploadToCloudinary(file);
          documents.push({
            documentType: 'other',
            documentName: file.originalname,
            documentUrl: result.secure_url,
            publicId: result.public_id,
            fileSize: file.size,
            mimeType: file.mimetype,
            status: 'pending'
          });
          console.log('✅ Other document uploaded:', result.secure_url);
        } catch (uploadError) {
          console.error('❌ Error uploading other document:', uploadError);
          // Continue with other documents even if one fails
        }
      }
    }

    console.log(`✅ Documents uploaded: ${documents.length}, Agreements: ${agreements.length}`);

    // Create compliance checklist
    const complianceChecklist = [
      { item: 'Business License', required: true, completed: documents.some(d => d.documentType === 'business_license') },
      { item: 'Certificate of Incorporation', required: false, completed: documents.some(d => d.documentType === 'certificate_of_incorporation') },
      { item: 'Tax Clearance', required: false, completed: documents.some(d => d.documentType === 'tax_clearance') },
      { item: 'Insurance Certificate', required: false, completed: documents.some(d => d.documentType === 'insurance_certificate') },
      { item: 'Garage Agreement', required: true, completed: agreements.length > 0 },
      { item: 'Identity Proof', required: false, completed: documents.some(d => d.documentType === 'identity_proof') },
      { item: 'Address Proof', required: false, completed: documents.some(d => d.documentType === 'address_proof') },
      { item: 'Phone Verified', required: true, completed: false },
      { item: 'Email Verified', required: true, completed: false }
    ];

    // Prepare garage info
    console.log('🏗️ [6/8] Building garage info object...');
    const garageInfo = {
      businessName,
      businessRegNumber,
      taxId,
      yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : undefined,
      address,
      city,
      state,
      country: country || 'Nigeria',
      zipCode,
      businessPhone,
      businessEmail,
      website,
      serviceCategories: serviceCategories ? serviceCategories.split(',').map(s => s.trim()) : [],
      specializedBrands: specializedBrands ? specializedBrands.split(',').map(s => s.trim()) : [],
      numberOfBays: numberOfBays ? parseInt(numberOfBays) : undefined,
      staffCount: staffCount ? parseInt(staffCount) : undefined,
      businessHours: {
        monday: mondayHours || '9:00 AM - 6:00 PM',
        tuesday: tuesdayHours || '9:00 AM - 6:00 PM',
        wednesday: wednesdayHours || '9:00 AM - 6:00 PM',
        thursday: thursdayHours || '9:00 AM - 6:00 PM',
        friday: fridayHours || '9:00 AM - 6:00 PM',
        saturday: saturdayHours || '10:00 AM - 4:00 PM',
        sunday: sundayHours || 'Closed'
      },
      emergencyServices: emergencyServices === 'true',
      licenseNumber,
      insuranceProvider,
      insuranceNumber,
      documents,
      agreements,
      description,
      specialties: specialties ? specialties.split(',').map(s => s.trim()) : [],
      establishedYear: establishedYear ? parseInt(establishedYear) : undefined,
      
      // Payment Status Fields
      paymentStatus: 'pending',
      paymentTxRef: null,
      paymentAmount: null,
      paymentDate: null,
      paymentExpiry: null,
      paymentPlan: 'basic',
      
      // Verification Status Fields
      verificationStatus: 'pending_payment',
      
      verificationProgress: {
        documentsSubmitted: documents.length > 0,
        documentsVerified: false,
        agreementsSigned: agreements.length > 0,
        backgroundCheck: false,
        siteInspection: false,
        phoneVerified: false,
        emailVerified: false,
        bankVerified: true,
        complianceCheck: false
      },
      
      registrationProgress: {
        step1_completed: true,
        step2_completed: true,
        step3_completed: documents.length > 0, 
        step4_completed: false,
        step5_completed: false
      },
      
      complianceChecklist,
      isActive: true
    };

    // Create user
    console.log('👤 [7/8] Creating user in database...');
    const userData = {
      name,
      email,
      password,
      phone,
      role: 'garage_owner',
      profileImage,
      garageInfo
    };

    const user = new User(userData);
    const savedUser = await user.save();
    console.log('✅ User saved with ID:', savedUser._id);

    // Generate token
    const token = generateToken(savedUser);

    // Send complete user data in response
    console.log('📤 [8/8] Registration successful for:', email);
    console.log('🏢 Garage:', businessName);
    console.log('📊 Status:', savedUser.garageInfo.verificationStatus);
    
    res.status(201).json({
      success: true,
      message: 'Garage owner registered successfully. Please complete payment to proceed.',
      data: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        phone: savedUser.phone,
        role: savedUser.role,
        profileImage: savedUser.profileImage || null,
        isEmailVerified: savedUser.isEmailVerified,
        isPhoneVerified: savedUser.isPhoneVerified,
        createdAt: savedUser.createdAt,
        
        garageInfo: {
          businessName: savedUser.garageInfo.businessName,
          businessRegNumber: savedUser.garageInfo.businessRegNumber,
          taxId: savedUser.garageInfo.taxId,
          yearsOfExperience: savedUser.garageInfo.yearsOfExperience,
          address: savedUser.garageInfo.address,
          city: savedUser.garageInfo.city,
          state: savedUser.garageInfo.state,
          country: savedUser.garageInfo.country,
          zipCode: savedUser.garageInfo.zipCode,
          businessPhone: savedUser.garageInfo.businessPhone,
          businessEmail: savedUser.garageInfo.businessEmail,
          website: savedUser.garageInfo.website,
          serviceCategories: savedUser.garageInfo.serviceCategories,
          specializedBrands: savedUser.garageInfo.specializedBrands,
          numberOfBays: savedUser.garageInfo.numberOfBays,
          staffCount: savedUser.garageInfo.staffCount,
          businessHours: savedUser.garageInfo.businessHours,
          emergencyServices: savedUser.garageInfo.emergencyServices,
          licenseNumber: savedUser.garageInfo.licenseNumber,
          insuranceProvider: savedUser.garageInfo.insuranceProvider,
          insuranceNumber: savedUser.garageInfo.insuranceNumber,
          documents: savedUser.garageInfo.documents.map(doc => ({
            id: doc._id,
            documentType: doc.documentType,
            documentName: doc.documentName,
            documentUrl: doc.documentUrl,
            status: doc.status,
            uploadedAt: doc.uploadedAt,
            metadata: doc.metadata
          })),
          agreements: savedUser.garageInfo.agreements.map(ag => ({
            id: ag._id,
            agreementType: ag.agreementType,
            agreementName: ag.agreementName,
            agreementUrl: ag.agreementUrl,
            signedAt: ag.signedAt,
            isActive: ag.isActive
          })),
          description: savedUser.garageInfo.description,
          specialties: savedUser.garageInfo.specialties,
          establishedYear: savedUser.garageInfo.establishedYear,
          paymentStatus: savedUser.garageInfo.paymentStatus,
          paymentPlan: savedUser.garageInfo.paymentPlan,
          paymentAmount: savedUser.garageInfo.paymentAmount,
          paymentDate: savedUser.garageInfo.paymentDate,
          paymentExpiry: savedUser.garageInfo.paymentExpiry,
          paymentTxRef: savedUser.garageInfo.paymentTxRef,
          verificationStatus: savedUser.garageInfo.verificationStatus,
          verificationProgress: savedUser.garageInfo.verificationProgress,
          registrationProgress: savedUser.garageInfo.registrationProgress,
          complianceChecklist: savedUser.garageInfo.complianceChecklist,
          completedProfile: savedUser.garageInfo.completedProfile,
          profileCompletionPercentage: savedUser.garageInfo.profileCompletionPercentage,
          isActive: savedUser.garageInfo.isActive,
          createdAt: savedUser.garageInfo.createdAt,
          updatedAt: savedUser.garageInfo.updatedAt
        },
        
        preferences: savedUser.preferences || {
          notifications: { email: true, sms: true, push: true },
          language: 'en',
          currency: 'NGN',
          timezone: 'Africa/Lagos'
        },
        
        token,
        
        nextStep: 'payment',
        paymentInfo: {
          required: true,
          amount: parseInt(process.env.BASIC_PLAN_AMOUNT) || 500,
          currency: 'ETB',
          plans: [
            { id: 'basic', name: 'Basic Listing', amount: parseInt(process.env.BASIC_PLAN_AMOUNT) || 500 },
            { id: 'premium', name: 'Premium Listing', amount: parseInt(process.env.PREMIUM_PLAN_AMOUNT) || 1000 },
            { id: 'yearly', name: 'Yearly Listing', amount: parseInt(process.env.YEARLY_PLAN_AMOUNT) || 5000 }
          ]
        }
      }
    });

  } catch (error) {
    console.error('❌=== GARAGE OWNER REGISTRATION ERROR ===', error);

    if (error.code === 11000) {
      return sendErrorResponse(res, 400, 'Email or business registration already exists');
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => ({
        field: val.path,
        message: val.message
      }));
      console.log('❌ Validation errors:', messages);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    sendErrorResponse(res, 500, 'Server error during garage owner registration', error);
  }
};

// ----------------------------------------------------------------------------
// Upload Profile Image (separate endpoint)
// ----------------------------------------------------------------------------

/**
 * @desc    Upload profile image for authenticated user
 * @route   POST /api/v1/auth/upload-profile-image
 * @access  Private
 */
const uploadProfileImageController = async (req, res) => {
  console.log('\n📸 [PROFILE IMAGE UPLOAD] Starting');
  console.log('User:', req.user.id);
  
  try {
    if (!req.file) {
      console.log('❌ No image provided');
      return sendErrorResponse(res, 400, 'Please upload an image');
    }

    console.log('📄 File:', req.file.originalname, `(${req.file.size} bytes)`);

    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    // Delete old profile image if exists
    if (user.profileImage) {
      console.log('🗑️ Deleting old profile image...');
      const publicId = user.profileImage.split('/').pop().split('.')[0];
      try {
        await deleteFromCloudinary(`smartgarage/profiles/${publicId}`);
        console.log('✅ Old profile image deleted');
      } catch (deleteError) {
        console.error('❌ Error deleting old profile image:', deleteError);
      }
    }

    // Upload new profile image
    console.log('📤 Uploading new profile image...');
    const result = await uploadProfileImage(req.file.buffer, user._id);
    
    user.profileImage = result.secure_url;
    await user.save();

    console.log('✅ Profile image uploaded successfully:', result.secure_url);

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('❌=== PROFILE IMAGE UPLOAD ERROR ===', error);
    sendErrorResponse(res, 500, 'Error uploading profile image', error);
  }
};

// ----------------------------------------------------------------------------
// Check Registration Status
// ----------------------------------------------------------------------------

/**
 * @desc    Check registration and payment status
 * @route   GET /api/v1/auth/registration-status
 * @access  Private
 */
const getRegistrationStatus = async (req, res) => {
  console.log('\n📊 [REGISTRATION STATUS] Checking for user:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    if (user.role !== 'garage_owner' || !user.garageInfo) {
      console.log('ℹ️ User is not a garage owner');
      return res.status(200).json({
        success: true,
        data: {
          role: user.role,
          message: 'Not a garage owner account'
        }
      });
    }

    console.log('✅ Garage owner found:', {
      businessName: user.garageInfo.businessName,
      verificationStatus: user.garageInfo.verificationStatus,
      paymentStatus: user.garageInfo.paymentStatus
    });

    // Status messages for frontend
    const statusMessages = {
      'registration_started': 'Please complete your business details',
      'documents_uploaded': 'Documents uploaded. Please complete payment',
      'pending_payment': 'Waiting for payment confirmation',
      'payment_completed': 'Payment received! Your application is under review',
      'under_review': 'Admin is reviewing your application',
      'more_info_needed': 'Additional information required',
      'approved': 'Congratulations! Your garage is now active',
      'rejected': 'Application rejected. Please contact support',
      'suspended': 'Account suspended',
      'banned': 'Account banned'
    };

    // Next actions for frontend
    const nextActions = {
      'registration_started': '/register/step2',
      'documents_uploaded': '/payment',
      'pending_payment': '/payment/status',
      'payment_completed': '/dashboard',
      'under_review': '/dashboard',
      'more_info_needed': '/register/additional-info',
      'approved': '/dashboard',
      'rejected': '/contact-support',
      'suspended': '/contact-support',
      'banned': '/contact-support'
    };

    // What user can access
    const canAccess = {
      dashboard: ['approved', 'under_review', 'payment_completed'].includes(user.garageInfo.verificationStatus),
      payment: ['documents_uploaded', 'pending_payment', 'failed', 'expired'].includes(user.garageInfo.verificationStatus) || 
               ['pending', 'failed', 'expired'].includes(user.garageInfo.paymentStatus),
      edit: ['registration_started', 'more_info_needed'].includes(user.garageInfo.verificationStatus),
      documents: true
    };

    const progress = calculateProgress(user.garageInfo);
    console.log('📊 Progress:', progress);

    res.status(200).json({
      success: true,
      data: {
        currentStep: user.garageInfo.registrationProgress,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentStatus: user.garageInfo.paymentStatus,
        paymentPlan: user.garageInfo.paymentPlan,
        paymentDate: user.garageInfo.paymentDate,
        paymentExpiry: user.garageInfo.paymentExpiry,
        message: statusMessages[user.garageInfo.verificationStatus] || 'Processing',
        nextAction: nextActions[user.garageInfo.verificationStatus] || '/dashboard',
        canAccess,
        progress
      }
    });
  } catch (error) {
    console.error('❌=== STATUS CHECK ERROR ===', error);
    sendErrorResponse(res, 500, 'Error fetching status', error);
  }
};

// ----------------------------------------------------------------------------
// Login User
// ----------------------------------------------------------------------------

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  console.log('\n🔐 [LOGIN] Attempt for email:', req.body.email);
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return sendErrorResponse(res, 400, 'Please provide email and password');
    }

    const dbStatus = checkDbConnection();
    if (!dbStatus.isConnected) {
      return sendErrorResponse(res, 500, 'Database not connected');
    }

    console.log('🔍 Finding user...');
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log('❌ User not found:', email);
      return sendErrorResponse(res, 401, 'Invalid credentials');
    }

    console.log('✅ User found:', { id: user._id, email: user.email, role: user.role });

    if (user.isLocked && user.isLocked()) {
      const lockTime = new Date(user.lockUntil);
      console.log('🔒 Account is locked until:', lockTime);
      return sendErrorResponse(res, 401, `Account is locked until ${lockTime.toLocaleString()}`);
    }

    console.log('🔑 Checking password...');
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      console.log('❌ Invalid password');
      await user.incrementLoginAttempts();
      return sendErrorResponse(res, 401, 'Invalid credentials');
    }

    console.log('✅ Password correct');

    if (user.loginAttempts > 0) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
      console.log('✅ Login attempts reset');
    }

    if (user.isActive === false) {
      console.log('❌ Account is deactivated');
      return sendErrorResponse(res, 401, 'Your account has been deactivated. Please contact support.');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();
    console.log('✅ Last login updated');

    const token = generateToken(user);

    // Prepare response data
    const responseData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profileImage: user.profileImage,
      token
    };

    // Add garage info with payment status for garage owners
    if (user.role === 'garage_owner' && user.garageInfo) {
      console.log('🏢 Garage owner login, adding garage info');
      
      let loginMessage = 'Login successful';
      let redirectTo = '/dashboard';

      if (user.garageInfo.verificationStatus === 'pending_payment' || 
          user.garageInfo.paymentStatus === 'pending' ||
          user.garageInfo.paymentStatus === 'failed') {
        loginMessage = 'Please complete payment to continue';
        redirectTo = '/payment';
      } else if (user.garageInfo.verificationStatus === 'payment_completed' ||
                user.garageInfo.verificationStatus === 'under_review') {
        loginMessage = 'Your application is under review';
        redirectTo = '/dashboard';
      } else if (user.garageInfo.verificationStatus === 'approved') {
        loginMessage = 'Welcome back! Your garage is active';
        redirectTo = '/dashboard';
      } else if (user.garageInfo.verificationStatus === 'rejected') {
        loginMessage = 'Your application was rejected. Please contact support';
        redirectTo = '/contact-support';
      }

      responseData.garageInfo = {
        businessName: user.garageInfo.businessName,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentStatus: user.garageInfo.paymentStatus,
        isVerified: user.garageInfo.verificationStatus === 'approved',
        profileCompletion: calculateProgress(user.garageInfo),
        documentsCount: user.garageInfo.documents?.length || 0,
        agreementsCount: user.garageInfo.agreements?.length || 0,
        nextStep: redirectTo,
        message: loginMessage
      };
      
      console.log('📊 Garage status:', {
        businessName: user.garageInfo.businessName,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentStatus: user.garageInfo.paymentStatus,
        nextStep: redirectTo
      });
    }

    console.log('✅ Login successful for:', email);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: responseData
    });
  } catch (error) {
    console.error('❌=== LOGIN ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during login', error);
  }
};

// ----------------------------------------------------------------------------
// Forgot Password
// ----------------------------------------------------------------------------

/**
 * @desc    Forgot password
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  console.log('\n🔐 [FORGOT PASSWORD] Request for email:', req.body.email);
  
  try {
    const { email } = req.body;

    if (!email) {
      console.log('❌ No email provided');
      return sendErrorResponse(res, 400, 'Please provide email address');
    }

    const user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not found:', email);
      return sendErrorResponse(res, 404, 'User not found');
    }

    console.log('✅ User found, generating reset token');

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHashed;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    console.log('✅ Reset token generated for:', email);
    console.log('🔑 Reset token (plain):', resetToken);
    console.log('🔐 Reset token (hashed):', resetTokenHashed);

    res.status(200).json({
      success: true,
      message: 'Password reset email sent',
      data: {
        resetToken
      }
    });
  } catch (error) {
    console.error('❌=== FORGOT PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during password reset request', error);
  }
};

// ----------------------------------------------------------------------------
// Reset Password
// ----------------------------------------------------------------------------

/**
 * @desc    Reset password
 * @route   POST /api/v1/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  console.log('\n🔐 [RESET PASSWORD] Attempt');
  
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      console.log('❌ Missing token or password');
      return sendErrorResponse(res, 400, 'Token and new password are required');
    }

    if (password.length < 8) {
      console.log('❌ Password too short');
      return sendErrorResponse(res, 400, 'Password must be at least 8 characters long');
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      console.log('❌ Password not strong enough');
      return sendErrorResponse(res, 400, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    const resetTokenHashed = crypto.createHash('sha256').update(token).digest('hex');
    console.log('🔐 Hashed token:', resetTokenHashed);

    const user = await User.findOne({
      resetPasswordToken: resetTokenHashed,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ Invalid or expired token');
      return sendErrorResponse(res, 400, 'Invalid or expired token');
    }

    console.log('✅ User found:', user.email);

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    console.log('✅ Password reset successful for:', user.email);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('❌=== RESET PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during password reset', error);
  }
};

// ----------------------------------------------------------------------------
// Get Current User Profile
// ----------------------------------------------------------------------------

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  console.log('\n👤 [GET PROFILE] For user:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id).select('-password');

    console.log('✅ User found:', { id: user._id, email: user.email, role: user.role });

    const responseData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profileImage: user.profileImage,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt
    };

    // Add garage info with payment status for garage owners
    if (user.role === 'garage_owner' && user.garageInfo) {
      console.log('🏢 Adding garage info for garage owner');
      responseData.garageInfo = {
        businessName: user.garageInfo.businessName,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentStatus: user.garageInfo.paymentStatus,
        paymentPlan: user.garageInfo.paymentPlan,
        paymentDate: user.garageInfo.paymentDate,
        paymentExpiry: user.garageInfo.paymentExpiry,
        isVerified: user.garageInfo.verificationStatus === 'approved',
        profileCompletion: calculateProgress(user.garageInfo),
        documentsCount: user.garageInfo.documents?.length || 0,
        agreementsCount: user.garageInfo.agreements?.length || 0,
        averageRating: user.garageInfo.averageRating,
        totalReviews: user.garageInfo.totalReviews,
        registrationProgress: user.garageInfo.registrationProgress
      };
      
      console.log('📊 Garage status:', {
        businessName: user.garageInfo.businessName,
        verificationStatus: user.garageInfo.verificationStatus,
        paymentStatus: user.garageInfo.paymentStatus
      });
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('❌=== GET PROFILE ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while fetching profile', error);
  }
};

// ----------------------------------------------------------------------------
// Update User Details
// ----------------------------------------------------------------------------

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/auth/updatedetails
 * @access  Private
 */
const updateDetails = async (req, res) => {
  console.log('\n📝 [UPDATE DETAILS] For user:', req.user.id);
  console.log('Update data:', req.body);
  
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone
    };

    Object.keys(fieldsToUpdate).forEach(key =>
      fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
    );

    console.log('Fields to update:', fieldsToUpdate);

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    }).select('-password');

    console.log('✅ User updated:', { id: user._id, email: user.email });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('❌=== UPDATE PROFILE ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while updating profile', error);
  }
};

// ----------------------------------------------------------------------------
// Update Password
// ----------------------------------------------------------------------------

/**
 * @desc    Update password
 * @route   PUT /api/v1/auth/updatepassword
 * @access  Private
 */
const updatePassword = async (req, res) => {
  console.log('\n🔐 [UPDATE PASSWORD] For user:', req.user.id);
  
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      console.log('❌ Missing password fields');
      return sendErrorResponse(res, 400, 'Please provide current and new password');
    }

    if (newPassword.length < 8) {
      console.log('❌ New password too short');
      return sendErrorResponse(res, 400, 'New password must be at least 8 characters long');
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      console.log('❌ New password not strong enough');
      return sendErrorResponse(res, 400, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    const user = await User.findById(req.user.id).select('+password');

    console.log('🔑 Verifying current password...');
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      console.log('❌ Current password incorrect');
      return sendErrorResponse(res, 401, 'Current password is incorrect');
    }

    console.log('✅ Current password verified, updating to new password');
    user.password = newPassword;
    await user.save();

    console.log('✅ Password updated successfully');
    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('❌=== UPDATE PASSWORD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while updating password', error);
  }
};

// ----------------------------------------------------------------------------
// Logout User
// ----------------------------------------------------------------------------

/**
 * @desc    Logout user
 * @route   GET /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  console.log('\n🚪 [LOGOUT] User:', req.user.id);
  
  try {
    console.log('✅ Logout successful');
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌=== LOGOUT ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during logout', error);
  }
};

// ============================================================================
// DOCUMENT CONTROLLERS
// ============================================================================

// ----------------------------------------------------------------------------
// Upload Single Document
// ----------------------------------------------------------------------------

/**
 * @desc    Upload document for authenticated user
 * @route   POST /api/v1/auth/upload-document
 * @access  Private
 */
const uploadDocument = async (req, res) => {
  console.log('\n📄 [DOCUMENT UPLOAD] Starting for user:', req.user.id);
  
  try {
    if (!req.file) {
      console.log('❌ No file provided');
      return sendErrorResponse(res, 400, 'Please upload a file');
    }

    const { documentType, metadata } = req.body;

    if (!documentType) {
      console.log('❌ No document type provided');
      return sendErrorResponse(res, 400, 'Please provide document type');
    }

    console.log('📋 Document type:', documentType);
    console.log('📄 File:', req.file.originalname, `(${req.file.size} bytes)`);

    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    if (user.role !== 'garage_owner' || !user.garageInfo) {
      console.log('❌ User is not a garage owner');
      return sendErrorResponse(res, 403, 'Only garage owners can upload documents');
    }

    // Upload to Cloudinary
    console.log('📤 Uploading to Cloudinary...');
    const result = await uploadFromBuffer(req.file.buffer, 'smartgarage/documents', {
      public_id: `${Date.now()}-${req.file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '-')}`
    });

    const document = {
      documentType,
      documentName: req.file.originalname,
      documentUrl: result.secure_url,
      publicId: result.public_id,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'pending',
      metadata: metadata ? JSON.parse(metadata) : {}
    };

    if (!user.garageInfo.documents) {
      user.garageInfo.documents = [];
    }
    user.garageInfo.documents.push(document);

    user.garageInfo.verificationProgress.documentsSubmitted = true;
    user.garageInfo.registrationProgress.step3_completed = true;

    if (user.garageInfo.verificationStatus === 'registration_started') {
      user.garageInfo.verificationStatus = 'documents_uploaded';
    }

    if (user.garageInfo.complianceChecklist) {
      const checklistItem = user.garageInfo.complianceChecklist.find(
        item => item.item.toLowerCase().includes(documentType.replace(/_/g, ' '))
      );
      if (checklistItem) {
        checklistItem.completed = true;
        checklistItem.completedAt = new Date();
        checklistItem.documentId = document._id;
        console.log('✅ Compliance checklist updated');
      }
    }

    await user.save();
    console.log('✅ Document saved to database');

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        documentId: document._id,
        documentType: document.documentType,
        documentUrl: document.documentUrl,
        status: document.status
      }
    });
  } catch (error) {
    console.error('❌=== DOCUMENT UPLOAD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during document upload', error);
  }
};

// ----------------------------------------------------------------------------
// Upload Multiple Documents
// ----------------------------------------------------------------------------

/**
 * @desc    Upload multiple documents
 * @route   POST /api/v1/auth/upload-documents
 * @access  Private
 */
const uploadDocuments = async (req, res) => {
  console.log('\n📚 [MULTIPLE DOCUMENTS UPLOAD] Starting for user:', req.user.id);
  
  try {
    if (!req.files || req.files.length === 0) {
      console.log('❌ No files provided');
      return sendErrorResponse(res, 400, 'Please upload files');
    }

    console.log(`📄 ${req.files.length} files received`);

    const { documentTypes } = req.body;
    const types = documentTypes ? documentTypes.split(',') : [];

    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    if (user.role !== 'garage_owner' || !user.garageInfo) {
      console.log('❌ User is not a garage owner');
      return sendErrorResponse(res, 403, 'Only garage owners can upload documents');
    }

    const uploadedDocuments = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`📤 Uploading file ${i+1}/${req.files.length}:`, file.originalname);
      
      // Upload to Cloudinary
      const result = await uploadFromBuffer(file.buffer, 'smartgarage/documents', {
        public_id: `${Date.now()}-${file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '-')}-${i}`
      });

      const document = {
        documentType: types[i] || 'other',
        documentName: file.originalname,
        documentUrl: result.secure_url,
        publicId: result.public_id,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'pending'
      };

      if (!user.garageInfo.documents) {
        user.garageInfo.documents = [];
      }
      user.garageInfo.documents.push(document);
      uploadedDocuments.push({
        id: document._id,
        type: document.documentType,
        url: document.documentUrl
      });
      console.log(`✅ File ${i+1} uploaded:`, result.secure_url);
    }

    user.garageInfo.verificationProgress.documentsSubmitted = true;
    user.garageInfo.registrationProgress.step3_completed = true;

    if (user.garageInfo.verificationStatus === 'registration_started') {
      user.garageInfo.verificationStatus = 'documents_uploaded';
    }

    await user.save();
    console.log(`✅ All ${uploadedDocuments.length} documents saved to database`);

    res.status(200).json({
      success: true,
      message: `${uploadedDocuments.length} documents uploaded successfully`,
      data: {
        documents: uploadedDocuments,
        totalDocuments: user.garageInfo.documents.length
      }
    });
  } catch (error) {
    console.error('❌=== MULTIPLE DOCUMENTS UPLOAD ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during documents upload', error);
  }
};

// ----------------------------------------------------------------------------
// Delete Document
// ----------------------------------------------------------------------------

/**
 * @desc    Delete document
 * @route   DELETE /api/v1/auth/document/:documentId
 * @access  Private
 */
const deleteDocument = async (req, res) => {
  console.log('\n🗑️ [DELETE DOCUMENT] For user:', req.user.id);
  console.log('Document ID:', req.params.documentId);
  
  try {
    const { documentId } = req.params;

    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    if (user.role !== 'garage_owner' || !user.garageInfo) {
      console.log('❌ User is not a garage owner');
      return sendErrorResponse(res, 403, 'Only garage owners can delete documents');
    }

    const document = user.garageInfo.documents.id(documentId);
    if (!document) {
      console.log('❌ Document not found');
      return sendErrorResponse(res, 404, 'Document not found');
    }

    console.log('📄 Document found:', document.documentName);

    if (document.publicId) {
      console.log('🗑️ Deleting from Cloudinary:', document.publicId);
      await deleteFromCloudinary(document.publicId);
      console.log('✅ Deleted from Cloudinary');
    }

    document.remove();
    await user.save();

    console.log('✅ Document deleted from database');
    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('❌=== DOCUMENT DELETION ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error during document deletion', error);
  }
};

// ----------------------------------------------------------------------------
// Get User Documents
// ----------------------------------------------------------------------------

/**
 * @desc    Get user documents
 * @route   GET /api/v1/auth/documents
 * @access  Private
 */
const getDocuments = async (req, res) => {
  console.log('\n📋 [GET DOCUMENTS] For user:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      console.log('❌ User not found');
      return sendErrorResponse(res, 404, 'User not found');
    }

    if (user.role !== 'garage_owner' || !user.garageInfo) {
      console.log('ℹ️ User is not a garage owner');
      return sendErrorResponse(res, 403, 'Only garage owners have documents');
    }

    const documents = user.garageInfo.documents || [];
    console.log(`📊 Found ${documents.length} documents`);

    res.status(200).json({
      success: true,
      data: {
        documents,
        total: documents.length,
        verified: documents.filter(d => d.status === 'verified').length,
        pending: documents.filter(d => d.status === 'pending').length,
        rejected: documents.filter(d => d.status === 'rejected').length
      }
    });
  } catch (error) {
    console.error('❌=== GET DOCUMENTS ERROR ===', error);
    sendErrorResponse(res, 500, 'Server error while fetching documents', error);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
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
  uploadProfileImage: uploadProfileImageController,

  // Status Controller
  getRegistrationStatus,

  // Document Controllers
  uploadDocument,
  uploadDocuments,
  deleteDocument,
  getDocuments,

  // Cloudinary Helpers
  uploadFromBuffer,
  uploadProfileImage,
  deleteFromCloudinary
};