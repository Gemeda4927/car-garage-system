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
    }
  },
  { timestamps: true }
);

garageSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Garage', garageSchema);