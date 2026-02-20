const Review = require('../models/Review');
const Booking = require('../models/booking');
const Garage = require('../models/garage');

// Create a review
exports.createReview = async (req, res) => {
  try {
    const { garageId, rating, title, comment, bookingId } = req.body;

    // Check if user already reviewed this garage
    const existingReview = await Review.findOne({
      user: req.user._id,
      garage: garageId,
      isDeleted: false
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this garage'
      });
    }

    // If bookingId provided, verify booking exists and is completed
    if (bookingId) {
      const booking = await Booking.findOne({
        _id: bookingId,
        user: req.user._id,
        garage: garageId,
        status: 'completed'
      });

      if (!booking) {
        return res.status(400).json({
          success: false,
          message: 'Invalid booking or booking not completed'
        });
      }
    }

    const review = await Review.create({
      user: req.user._id,
      garage: garageId,
      booking: bookingId,
      rating,
      title,
      comment,
      isVerified: false // Admin can verify later
    });

    const populatedReview = await Review.findById(review._id)
      .populate('user', 'name email')
      .populate('garage', 'name');

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      review: populatedReview
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get reviews for a garage
exports.getGarageReviews = async (req, res) => {
  try {
    const { garageId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.find({ 
      garage: garageId, 
      isDeleted: false 
    })
      .populate('user', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Review.countDocuments({ 
      garage: garageId, 
      isDeleted: false 
    });

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review || review.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Only owner can update
    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const { rating, title, comment } = req.body;
    review.rating = rating || review.rating;
    review.title = title || review.title;
    review.comment = comment || review.comment;

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete review (soft delete)
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review || review.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Only owner or admin can delete
    if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    review.isDeleted = true;
    review.deletedAt = new Date();
    await review.save();

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};