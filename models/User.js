const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================================================
// DOCUMENT SCHEMA
// ============================================================================
const documentSchema = new mongoose.Schema({
  documentType: { 
    type: String, 
    enum: [
      'business_license', 
      'certificate_of_incorporation', 
      'tax_clearance', 
      'insurance_certificate',
      'garage_agreement',
      'terms_acceptance',
      'privacy_acknowledgment',
      'identity_proof',
      'address_proof',
      'professional_certification',
      'equipment_inventory',
      'staff_certifications',
      'fire_safety_certificate',
      'environmental_permit',
      'zoning_permit'
    ],
    required: true 
  },
  documentName: { type: String, required: true },
  documentUrl: { type: String, required: true },
  publicId: { type: String },
  fileSize: Number,
  mimeType: String,
  uploadedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationNotes: String,
  status: { 
    type: String, 
    enum: ['pending', 'verified', 'rejected', 'expired'], 
    default: 'pending' 
  },
  rejectionReason: String,
  metadata: {
    licenseNumber: String,
    issuingAuthority: String,
    issueDate: Date,
    expiryDate: Date,
    jurisdiction: String
  }
}, { _id: true });

// ============================================================================
// AGREEMENT SCHEMA
// ============================================================================
const agreementSchema = new mongoose.Schema({
  agreementType: { 
    type: String, 
    enum: [
      'terms_of_service',
      'garage_partnership_agreement',
      'commission_agreement',
      'data_processing_agreement',
      'quality_standards_agreement',
      'code_of_conduct',
      'payment_terms_agreement',
      'liability_waiver'
    ],
    required: true 
  },
  agreementName: String,
  agreementUrl: String,
  signedAt: { type: Date, default: Date.now },
  signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ipAddress: String,
  userAgent: String,
  signature: {
    type: { type: String, enum: ['digital', 'typed', 'uploaded'], default: 'digital' },
    value: String,
    fullName: String
  },
  version: String,
  expiresAt: Date,
  isActive: { type: Boolean, default: true }
}, { _id: true });

// ============================================================================
// ADMIN REVIEW SCHEMA
// ============================================================================
const adminReviewSchema = new mongoose.Schema({
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'needs_info', 'suspended', 'under_review'] 
  },
  comments: String,
  internalNotes: String,
  nextReviewDate: Date,
  reviewCriteria: [{
    criterion: String,
    passed: Boolean,
    notes: String
  }]
}, { _id: true });

// ============================================================================
// COMPLIANCE CHECKLIST SCHEMA
// ============================================================================
const complianceChecklistSchema = new mongoose.Schema({
  item: String,
  required: { type: Boolean, default: true },
  completed: { type: Boolean, default: false },
  completedAt: Date,
  documentId: { type: mongoose.Schema.Types.ObjectId },
  notes: String
});

// ============================================================================
// SERVICE CATEGORY SCHEMA
// ============================================================================
const serviceCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  basePrice: Number,
  duration: String,
  isActive: { type: Boolean, default: true },
  requiresCertification: [String],
  priceRange: {
    min: Number,
    max: Number
  }
}, { _id: true });

// ============================================================================
// BUSINESS HOURS SCHEMA
// ============================================================================
const businessHoursSchema = new mongoose.Schema({
  monday: { type: String, default: "9:00 AM - 6:00 PM" },
  tuesday: { type: String, default: "9:00 AM - 6:00 PM" },
  wednesday: { type: String, default: "9:00 AM - 6:00 PM" },
  thursday: { type: String, default: "9:00 AM - 6:00 PM" },
  friday: { type: String, default: "9:00 AM - 6:00 PM" },
  saturday: { type: String, default: "10:00 AM - 4:00 PM" },
  sunday: { type: String, default: "Closed" },
  holidayHours: [{
    date: Date,
    openTime: String,
    closeTime: String,
    reason: String
  }]
}, { _id: false });

// ============================================================================
// STAFF INFORMATION SCHEMA
// ============================================================================
const staffSchema = new mongoose.Schema({
  name: String,
  position: String,
  certifications: [String],
  joinedAt: Date,
  isActive: { type: Boolean, default: true }
}, { _id: true });

// ============================================================================
// EQUIPMENT SCHEMA
// ============================================================================
const equipmentSchema = new mongoose.Schema({
  name: String,
  type: String,
  manufacturer: String,
  model: String,
  serialNumber: String,
  purchaseDate: Date,
  lastMaintenance: Date,
  nextMaintenance: Date,
  isOperational: { type: Boolean, default: true },
  certificationRequired: String
}, { _id: true });

// ============================================================================
// GARAGE OWNER INFORMATION SCHEMA
// ============================================================================
const garageOwnerInfoSchema = new mongoose.Schema({
  // Basic Business Information
  businessName: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    trim: true
  },
  businessRegNumber: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    trim: true
  },
  taxId: { type: String, trim: true },
  yearsOfExperience: { type: String },
  
  // Location Information
  address: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    trim: true 
  },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, default: 'Nigeria', trim: true },
  zipCode: { type: String, trim: true },
  coordinates: {
    lat: Number,
    lng: Number
  },
  
  // Contact Information
  businessPhone: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    trim: true 
  },
  businessEmail: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    lowercase: true, 
    trim: true
  },
  website: { type: String, trim: true },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String
  },
  
  // Services & Specialties
  serviceCategories: [{ type: String }],
  specializedBrands: [{ type: String }],
  detailedServices: [serviceCategorySchema],

  // Business Description
  description: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    minlength: [20, 'Description must be at least 20 characters']
  },
  specialties: [{ type: String }],

  // ===== PAYMENT STATUS FIELDS =====
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'not_required'],
    default: 'pending'
  },
  paymentTxRef: { type: String, default: null },
  paymentAmount: { type: Number, default: null },
  paymentDate: { type: Date, default: null },
  paymentExpiry: { type: Date, default: null },
  paymentPlan: {
    type: String,
    enum: ['basic', 'premium', 'yearly'],
    default: 'basic'
  },
  
  // Business Details
  numberOfBays: { type: String },
  staffCount: { type: String },
  establishedYear: { type: String },
  staff: [staffSchema],
  equipment: [equipmentSchema],
  
  // Business Hours
  businessHours: { type: businessHoursSchema, default: () => ({}) },
  
  // Emergency Services
  emergencyServices: { type: Boolean, default: false },
  emergencyContact: {
    phone: String,
    available24_7: { type: Boolean, default: false }
  },
  
  // Documents & Licenses
  documents: [documentSchema],
  agreements: [agreementSchema],
  
  // Certifications & Licenses
  certifications: [{ type: String }],
  licenseNumber: { 
    type: String, 
    required: function() { return this.parent().role === 'garage_owner'; },
    trim: true
  },
  insuranceProvider: { type: String },
  insuranceNumber: { type: String },
  insuranceExpiry: Date,
  
  // Verification & Approval Status
  verificationStatus: { 
    type: String, 
    enum: [
      'pending',
      'documents_uploaded',
      'pending_payment', 
      'under_review',
      'more_info_needed',
      'approved',
      'rejected',
      'suspended',
      'banned',
      'payment_completed'
    ],
    default: 'pending'
  },
  
  // Verification Steps Progress
  verificationProgress: {
    documentsSubmitted: { type: Boolean, default: false },
    documentsVerified: { type: Boolean, default: false },
    agreementsSigned: { type: Boolean, default: false },
    backgroundCheck: { type: Boolean, default: false },
    siteInspection: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    bankVerified: { type: Boolean, default: false },
    complianceCheck: { type: Boolean, default: false }
  },
  
  // Compliance Checklist
  complianceChecklist: [complianceChecklistSchema],
  
  // Admin Reviews History
  adminReviews: [adminReviewSchema],
  
  // Current Admin Review
  currentReview: { type: adminReviewSchema, default: null },
  
  // Approval Details
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalExpiryDate: Date,
  approvalNumber: { type: String },
  
  // Rejection Details
  rejectedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: String,
  rejectionDetails: [{
    field: String,
    reason: String
  }],
  
  // More Info Requests
  infoRequests: [{
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    requestedItems: [String],
    description: String,
    respondedAt: Date,
    response: String,
    status: { type: String, enum: ['pending', 'responded', 'cancelled'] }
  }],
  
  // Ratings & Reviews
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  ratingBreakdown: {
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 }
  },
  
  // Business Status
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  featuredUntil: Date,
  
  // Subscription
  subscriptionPlan: { 
    type: String, 
    enum: ['free', 'basic', 'premium', 'enterprise'], 
    default: 'free' 
  },
  subscriptionExpiry: Date,
  subscriptionFeatures: {
    maxListings: { type: Number, default: 1 },
    prioritySupport: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    promotions: { type: Boolean, default: false }
  },
  
  // Payment & Commission
  commissionRate: { type: Number, default: 10 },
  paymentTerms: {
    invoiceCycle: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' },
    minimumPayout: { type: Number, default: 5000 },
    nextPayoutDate: Date
  },
  
  // Metadata
  completedProfile: { type: Boolean, default: false },
  profileCompletionPercentage: { type: Number, default: 0 },
  lastActive: Date,
  
  // Notes
  adminNotes: [{
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: true }
  }]
}, { _id: false, timestamps: true });

// ============================================================================
// MAIN USER SCHEMA
// ============================================================================
const userSchema = new mongoose.Schema({
  // Basic Information
  name: { 
    type: String, 
    required: [true, 'Name is required'], 
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    lowercase: true, 
    trim: true,
    unique: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'], 
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'],
    trim: true
  },
  role: { 
    type: String, 
    enum: ['user', 'garage_owner', 'admin', 'super_admin'], 
    default: 'user' 
  },
  
  // Profile
  profileImage: { type: String, default: '' },
  
  // Garage Owner Specific Information
  garageInfo: { type: garageOwnerInfoSchema, default: null },
  
  // User Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    language: { type: String, default: 'en' },
    currency: { type: String, default: 'NGN' },
    timezone: { type: String, default: 'Africa/Lagos' }
  },
  
  // Account Status
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  phoneVerificationToken: String,
  phoneVerificationExpire: Date,
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Login Tracking
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  
  // Devices
  devices: [{
    deviceId: String,
    deviceType: String,
    browser: String,
    os: String,
    ip: String,
    location: String,
    lastActive: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  }],
  
  // Activity Log
  activityLog: [{
    action: String,
    details: String,
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ============================================================================
// INDEXES
// ============================================================================
// Unique indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'garageInfo.businessRegNumber': 1 }, { unique: true, sparse: true });
userSchema.index({ 'garageInfo.approvalNumber': 1 }, { unique: true, sparse: true });

// Regular indexes for query performance
userSchema.index({ role: 1 });
userSchema.index({ 'garageInfo.businessName': 'text', 'garageInfo.description': 'text' });
userSchema.index({ 'garageInfo.verificationStatus': 1 });
userSchema.index({ 'garageInfo.city': 1, 'garageInfo.state': 1 });
userSchema.index({ 'garageInfo.averageRating': -1 });
userSchema.index({ 'garageInfo.isFeatured': 1 });
userSchema.index({ 'garageInfo.subscriptionExpiry': 1 });
userSchema.index({ 'garageInfo.businessEmail': 1 });
userSchema.index({ 'garageInfo.licenseNumber': 1 });

// ============================================================================
// PRE-SAVE HOOK - Hash password before saving
// ============================================================================
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    console.log('🔐 Hashing password for user:', this.email);
    
    // Generate salt
    const salt = await bcrypt.genSalt(10);
    
    // Hash password
    this.password = await bcrypt.hash(this.password, salt);
    
    console.log('✅ Password hashed successfully');
    next();
  } catch (error) {
    console.error('❌ Error hashing password:', error);
    next(error);
  }
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Match password
 */
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Calculate profile completion percentage
 */
userSchema.methods.calculateProfileCompletion = function() {
  if (this.role !== 'garage_owner' || !this.garageInfo) return 0;
  
  const fields = [
    'businessName', 'businessRegNumber', 'address', 'businessPhone', 
    'businessEmail', 'licenseNumber', 'description'
  ];
  
  // Only count payment fields if they exist
  if (this.garageInfo.paymentStatus === 'paid') fields.push('paymentStatus');
  
  const requiredFields = fields.filter(field => {
    const value = this.garageInfo[field];
    return value && value !== '';
  });
  
  return Math.round((requiredFields.length / fields.length) * 100);
};

/**
 * Check if account is locked
 */
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Increment login attempts
 */
userSchema.methods.incrementLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 3600000 };
  }
  
  return this.updateOne(updates);
};

// ============================================================================
// DOCUMENT MANAGEMENT METHODS
// ============================================================================

/**
 * Add document
 */
userSchema.methods.addDocument = async function(documentData) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.documents.push(documentData);
  this.garageInfo.verificationProgress.documentsSubmitted = true;
  this.garageInfo.verificationStatus = 'documents_uploaded';
  
  return this.save();
};

/**
 * Verify document
 */
userSchema.methods.verifyDocument = async function(documentId, adminId, notes) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  const document = this.garageInfo.documents.id(documentId);
  if (!document) throw new Error('Document not found');
  
  document.status = 'verified';
  document.verifiedAt = new Date();
  document.verifiedBy = adminId;
  document.verificationNotes = notes;
  
  // Check if all required documents are verified
  const allVerified = this.garageInfo.documents
    .filter(doc => doc.documentType !== 'optional')
    .every(doc => doc.status === 'verified');
  
  if (allVerified) {
    this.garageInfo.verificationProgress.documentsVerified = true;
  }
  
  return this.save();
};

// ============================================================================
// AGREEMENT METHODS
// ============================================================================

/**
 * Sign agreement
 */
userSchema.methods.signAgreement = async function(agreementData) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.agreements.push({
    ...agreementData,
    signedAt: new Date(),
    signedBy: this._id
  });
  
  this.garageInfo.verificationProgress.agreementsSigned = true;
  
  return this.save();
};

// ============================================================================
// ADMIN APPROVAL METHODS
// ============================================================================

/**
 * Submit for review
 */
userSchema.methods.submitForReview = async function() {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.verificationStatus = 'under_review';
  this.garageInfo.currentReview = {
    reviewedAt: new Date(),
    status: 'under_review'
  };
  
  return this.save();
};

/**
 * Approve garage
 */
userSchema.methods.approve = async function(adminId, approvalData = {}) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  const approvalNumber = `GAR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  this.garageInfo.verificationStatus = 'approved';
  this.garageInfo.approvedAt = new Date();
  this.garageInfo.approvedBy = adminId;
  this.garageInfo.approvalNumber = approvalNumber;
  this.garageInfo.isActive = true;
  
  this.garageInfo.adminReviews.push({
    reviewedBy: adminId,
    reviewedAt: new Date(),
    status: 'approved',
    ...approvalData
  });
  
  this.garageInfo.currentReview = null;
  
  return this.save();
};

/**
 * Reject garage
 */
userSchema.methods.reject = async function(adminId, reason, details = []) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.verificationStatus = 'rejected';
  this.garageInfo.rejectedAt = new Date();
  this.garageInfo.rejectedBy = adminId;
  this.garageInfo.rejectionReason = reason;
  this.garageInfo.rejectionDetails = details;
  
  this.garageInfo.adminReviews.push({
    reviewedBy: adminId,
    reviewedAt: new Date(),
    status: 'rejected',
    comments: reason
  });
  
  this.garageInfo.currentReview = null;
  
  return this.save();
};

/**
 * Request more information
 */
userSchema.methods.requestMoreInfo = async function(adminId, requestedItems, description) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.verificationStatus = 'more_info_needed';
  
  if (!this.garageInfo.infoRequests) {
    this.garageInfo.infoRequests = [];
  }
  
  this.garageInfo.infoRequests.push({
    requestedBy: adminId,
    requestedAt: new Date(),
    requestedItems,
    description,
    status: 'pending'
  });
  
  this.garageInfo.adminReviews.push({
    reviewedBy: adminId,
    reviewedAt: new Date(),
    status: 'needs_info',
    comments: description
  });
  
  return this.save();
};

/**
 * Suspend garage
 */
userSchema.methods.suspend = async function(adminId, reason, duration) {
  if (!this.garageInfo) throw new Error('Not a garage owner');
  
  this.garageInfo.verificationStatus = 'suspended';
  this.garageInfo.isActive = false;
  
  this.garageInfo.adminReviews.push({
    reviewedBy: adminId,
    reviewedAt: new Date(),
    status: 'suspended',
    comments: reason,
    nextReviewDate: duration ? new Date(Date.now() + duration) : null
  });
  
  return this.save();
};

// ============================================================================
// STATIC METHODS
// ============================================================================

/**
 * Find pending garages
 */
userSchema.statics.findPendingGarages = function() {
  return this.find({
    role: 'garage_owner',
    'garageInfo.verificationStatus': 'pending'
  }).sort({ createdAt: 1 });
};

/**
 * Find under review garages
 */
userSchema.statics.findUnderReviewGarages = function() {
  return this.find({
    role: 'garage_owner',
    'garageInfo.verificationStatus': 'under_review'
  }).populate('garageInfo.currentReview.reviewedBy', 'name email');
};

/**
 * Find approved garages
 */
userSchema.statics.findApprovedGarages = function(filters = {}) {
  const query = {
    role: 'garage_owner',
    'garageInfo.verificationStatus': 'approved',
    'garageInfo.isActive': true,
    ...filters
  };
  
  return this.find(query).sort({ 'garageInfo.averageRating': -1 });
};

/**
 * Find garages needing renewal
 */
userSchema.statics.findGaragesNeedingRenewal = function(daysBeforeExpiry = 30) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysBeforeExpiry);
  
  return this.find({
    role: 'garage_owner',
    'garageInfo.verificationStatus': 'approved',
    'garageInfo.approvalExpiryDate': { $lte: expiryDate, $gte: new Date() }
  });
};

// ============================================================================
// VIRTUALS
// ============================================================================

/**
 * Full address virtual
 */
userSchema.virtual('garageInfo.fullAddress').get(function() {
  if (!this.garageInfo) return '';
  const { address, city, state, country, zipCode } = this.garageInfo;
  return [address, city, state, country, zipCode].filter(Boolean).join(', ');
});

/**
 * Service count virtual
 */
userSchema.virtual('garageInfo.serviceCount').get(function() {
  return this.garageInfo?.serviceCategories?.length || 0;
});

/**
 * Document count virtual
 */
userSchema.virtual('garageInfo.documentCount').get(function() {
  return this.garageInfo?.documents?.length || 0;
});

/**
 * Verified document count virtual
 */
userSchema.virtual('garageInfo.verifiedDocumentCount').get(function() {
  return this.garageInfo?.documents?.filter(d => d.status === 'verified').length || 0;
});

/**
 * Is fully verified virtual
 */
userSchema.virtual('garageInfo.isFullyVerified').get(function() {
  if (!this.garageInfo) return false;
  return (
    this.garageInfo.verificationStatus === 'approved' &&
    this.garageInfo.verificationProgress.documentsVerified &&
    this.garageInfo.verificationProgress.agreementsSigned
  );
});

// ============================================================================
// EXPORT MODEL
// ============================================================================
const User = mongoose.model('User', userSchema);

module.exports = User;