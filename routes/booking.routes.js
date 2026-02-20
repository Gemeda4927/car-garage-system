const express = require('express');
const router = express.Router();

const bookingController = require('../controllers/booking.controller');
const { protect, authorize } = require('../controllers/auth.controller');

router.use(protect);

router.route('/bookings')
  .post(bookingController.createBooking);

router.route('/bookings/my-bookings')
  .get(bookingController.getMyBookings);

router.route('/bookings/:id')
  .get(bookingController.getBooking)
  .put(bookingController.updateBooking);

router.route('/bookings/soft/:id')
  .delete(bookingController.softDeleteBooking);

router.route('/bookings')
  .get(authorize('admin'), bookingController.getAllBookingsWithDeleted);

router.route('/bookings/restore/:id')
  .put(authorize('admin'), bookingController.restoreBooking);

router.route('/bookings/hard/:id')
  .delete(authorize('admin'), bookingController.hardDeleteBooking);

module.exports = router;