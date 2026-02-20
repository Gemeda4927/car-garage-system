const mongoose = require('mongoose');

const garageSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Garage name is required'],
      trim: true
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date
    },
    description: {
      type: String,
      trim: true
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true, index: true },
      state: { type: String },
      country: { type: String, default: 'Ethiopia' },
      postalCode: { type: String }
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },
    googlePlaceId: String,
    formattedAddress: String,
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    // Optional: Add contact information
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    website: {
      type: String,
      trim: true
    },
    // Operating hours
    openingHours: {
      monday: { open: String, close: String, closed: { type: Boolean, default: false } },
      tuesday: { open: String, close: String, closed: { type: Boolean, default: false } },
      wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
      thursday: { open: String, close: String, closed: { type: Boolean, default: false } },
      friday: { open: String, close: String, closed: { type: Boolean, default: false } },
      saturday: { open: String, close: String, closed: { type: Boolean, default: false } },
      sunday: { open: String, close: String, closed: { type: Boolean, default: true } }
    },
    // Services offered
    servicesOffered: [{
      name: String,
      description: String,
      price: Number,
      duration: Number, // in minutes
      category: String
    }],
    // Images
    images: [{
      url: String,
      caption: String,
      isPrimary: { type: Boolean, default: false }
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// =====================================
// VIRTUAL FIELDS (for population)
// =====================================

// Virtual for bookings
garageSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'garage',
  options: { sort: { appointmentDate: -1 } }
});

// Virtual for reviews
garageSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'garage',
  options: { sort: { createdAt: -1 } }
});

// Virtual for completed bookings count
garageSchema.virtual('completedBookingsCount', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'garage',
  count: true,
  match: { status: 'completed', isDeleted: false }
});

// Virtual for pending bookings
garageSchema.virtual('pendingBookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'garage',
  match: { status: { $in: ['pending', 'confirmed'] }, isDeleted: false }
});

// =====================================
// INDEXES
// =====================================

// Geospatial index for location-based queries
garageSchema.index({ location: '2dsphere' });

// Compound indexes for common queries
garageSchema.index({ isDeleted: 1, isActive: 1, averageRating: -1 });
garageSchema.index({ isDeleted: 1, 'address.city': 1, averageRating: -1 });
garageSchema.index({ isVerified: 1, isDeleted: 1 });

// =====================================
// INSTANCE METHODS
// =====================================

// Update rating based on reviews
garageSchema.methods.updateRating = async function() {
  const Review = mongoose.model('Review');
  
  const result = await Review.aggregate([
    { $match: { garage: this._id, isDeleted: false } },
    { $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }}
  ]);
  
  if (result.length > 0) {
    this.averageRating = Math.round(result[0].averageRating * 10) / 10;
    this.totalReviews = result[0].totalReviews;
  } else {
    this.averageRating = 0;
    this.totalReviews = 0;
  }
  
  await this.save();
  return this;
};

// Check if garage is available at specific date/time
garageSchema.methods.isAvailable = async function(date, duration) {
  const Booking = mongoose.model('Booking');
  
  const appointmentEnd = new Date(date.getTime() + duration * 60000);
  
  const conflictingBookings = await Booking.countDocuments({
    garage: this._id,
    isDeleted: false,
    status: { $in: ['pending', 'confirmed', 'in_progress'] },
    appointmentDate: {
      $lt: appointmentEnd,
      $gte: new Date(date.getTime() - duration * 60000)
    }
  });
  
  return conflictingBookings === 0;
};

// Get upcoming appointments
garageSchema.methods.getUpcomingAppointments = function(limit = 10) {
  return mongoose.model('Booking')
    .find({
      garage: this._id,
      isDeleted: false,
      status: { $in: ['pending', 'confirmed'] },
      appointmentDate: { $gte: new Date() }
    })
    .populate('user', 'name email phone')
    .sort('appointmentDate')
    .limit(limit);
};

// =====================================
// STATIC METHODS
// =====================================

// Find nearby garages
garageSchema.statics.findNearby = function(lng, lat, maxDistance = 10000, limit = 20) {
  return this.find({
    isDeleted: false,
    isActive: true,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: maxDistance
      }
    }
  }).limit(limit);
};

// Search garages by criteria
garageSchema.statics.search = function(criteria = {}) {
  const query = { isDeleted: false, ...criteria };
  
  if (criteria.city) {
    query['address.city'] = new RegExp(criteria.city, 'i');
  }
  
  if (criteria.minRating) {
    query.averageRating = { $gte: criteria.minRating };
  }
  
  if (criteria.verified) {
    query.isVerified = criteria.verified === 'true';
  }
  
  return this.find(query)
    .populate('owner', 'name email')
    .sort(criteria.sort || '-createdAt')
    .limit(parseInt(criteria.limit) || 20);
};

// =====================================
// MIDDLEWARE
// =====================================

// Pre-save middleware
garageSchema.pre('save', function(next) {
  // Auto-generate formatted address if not provided
  if (!this.formattedAddress && this.address) {
    const { street, city, state, country, postalCode } = this.address;
    const parts = [street, city, state, country, postalCode].filter(Boolean);
    this.formattedAddress = parts.join(', ');
  }
  next();
});

// Post-save middleware
garageSchema.post('save', function(doc) {
  console.log(`Garage "${doc.name}" saved successfully`);
});

// Pre-remove middleware
garageSchema.pre('remove', async function(next) {
  // Check for existing bookings before allowing removal
  const Booking = mongoose.model('Booking');
  const bookingCount = await Booking.countDocuments({ garage: this._id });
  
  if (bookingCount > 0) {
    next(new Error('Cannot delete garage with existing bookings. Use soft delete instead.'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Garage', garageSchema);