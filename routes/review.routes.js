const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { protect, authorize } = require('../controllers/auth.controller');

// All routes require authentication
router.use(protect);

// Create review
router.post('/', reviewController.createReview);

// Get reviews for a garage (public)
router.get('/garage/:garageId', reviewController.getGarageReviews);

// Update/delete own review
router.route('/:id')
  .put(reviewController.updateReview)
  .delete(reviewController.deleteReview);

module.exports = router;