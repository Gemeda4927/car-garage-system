const Booking = require('../models/Booking');

/*
=====================================
CREATE BOOKING
=====================================
*/
exports.createBooking = async (req, res) => {
  try {
    const booking = await Booking.create({
      ...req.body,
      user: req.user._id
    });

    res.status(201).json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET MY BOOKINGS (NOT DELETED)
=====================================
*/
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      user: req.user._id,
      isDeleted: false
    }).populate('garage');

    res.status(200).json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET ALL BOOKINGS (ADMIN, INCLUDING DELETED)
=====================================
*/
exports.getAllBookingsWithDeleted = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user')
      .populate('garage');

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET SINGLE BOOKING
=====================================
*/
exports.getBooking = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      isDeleted: false
    })
      .populate('user')
      .populate('garage');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.status(200).json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
UPDATE BOOKING
=====================================
*/
exports.updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking || booking.isDeleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    Object.assign(booking, req.body);
    await booking.save();

    res.status(200).json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
SOFT DELETE BOOKING
=====================================
*/
exports.softDeleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.isDeleted = true;
    booking.deletedAt = new Date();

    await booking.save();

    res.status(200).json({ message: 'Booking soft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
RESTORE BOOKING
=====================================
*/
exports.restoreBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.isDeleted = false;
    booking.deletedAt = null;

    await booking.save();

    res.status(200).json({ message: 'Booking restored' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
HARD DELETE BOOKING
=====================================
*/
exports.hardDeleteBooking = async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: 'Booking permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};