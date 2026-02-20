const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    garage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Garage',
      required: true
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating'],
      min: 1,
      max: 5
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100
    },
    comment: {
      type: String,
      required: [true, 'Please provide a review comment'],
      trim: true,
      maxlength: 500
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    helpfulCount: {
      type: Number,
      default: 0
    },
    response: {
      comment: String,
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      respondedAt: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Ensure one review per user per garage
reviewSchema.index({ user: 1, garage: 1 }, { unique: true });

// Index for finding reviews by garage
reviewSchema.index({ garage: 1, createdAt: -1 });
reviewSchema.index({ garage: 1, rating: -1 });

// Update garage rating when review is saved
reviewSchema.statics.updateGarageRating = async function(garageId) {
  const Garage = mongoose.model('Garage');
  
  const stats = await this.aggregate([
    { $match: { garage: garageId, isDeleted: false } },
    { $group: {
        _id: '$garage',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 }
      }}
  ]);

  if (stats.length > 0) {
    await Garage.findByIdAndUpdate(garageId, {
      averageRating: Math.round(stats[0].avgRating * 10) / 10,
      totalReviews: stats[0].numReviews
    });
  } else {
    await Garage.findByIdAndUpdate(garageId, {
      averageRating: 0,
      totalReviews: 0
    });
  }
};

// Post-save middleware to update garage rating
reviewSchema.post('save', async function() {
  await this.constructor.updateGarageRating(this.garage);
});

// Post-remove middleware to update garage rating
reviewSchema.post('remove', async function() {
  await this.constructor.updateGarageRating(this.garage);
});

module.exports = mongoose.model('Review', reviewSchema);