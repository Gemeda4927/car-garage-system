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

    description: {
      type: String,
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

    // =====================================
    // ✅ SERVICES ADDED HERE
    // =====================================
    services: [
      {
        name: {
          type: String,
          required: true,
          trim: true
        },
        description: {
          type: String,
          trim: true
        },
        price: {
          type: Number,
          required: true,
          min: 0
        },
        duration: {
          type: Number, // in minutes
          required: true
        },
        isActive: {
          type: Boolean,
          default: true
        }
      }
    ],

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
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

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

// Geospatial index
garageSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Garage', garageSchema);