const Garage = require('../models/garage');
const Booking = require('../models/booking');

/*
=====================================
HELPER FUNCTIONS
=====================================
*/

/**
 * Populate garage with related data
 * @param {Object} query - Mongoose query
 * @returns {Object} Populated query
 */
const populateGarageData = (query) => {
  return query
    .populate('owner', 'name email phone')
    .populate({
      path: 'bookings',
      match: { isDeleted: false },
      select: 'user appointmentDate status totalPrice services',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate({
      path: 'reviews',
      select: 'rating comment user createdAt',
      populate: {
        path: 'user',
        select: 'name'
      }
    });
};

/*
=====================================
CREATE GARAGE
=====================================
*/
exports.createGarage = async (req, res) => {
  try {
    const garage = await Garage.create({
      ...req.body,
      owner: req.user._id
    });

    // Fetch populated garage
    const populatedGarage = await populateGarageData(
      Garage.findById(garage._id)
    );

    res.status(201).json({ 
      success: true, 
      message: 'Garage created successfully',
      garage: populatedGarage 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
GET ALL GARAGES (NOT DELETED)
=====================================
*/
exports.getGarages = async (req, res) => {
  try {
    let query = Garage.find({ isDeleted: false });

    // Add filters from query params
    if (req.query.city) {
      query = query.where('address.city').equals(req.query.city);
    }
    if (req.query.isVerified) {
      query = query.where('isVerified').equals(req.query.isVerified === 'true');
    }
    if (req.query.minRating) {
      query = query.where('averageRating').gte(parseFloat(req.query.minRating));
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Garage.countDocuments({ isDeleted: false });
    const garages = await populateGarageData(
      query.sort('-createdAt').skip(skip).limit(limit)
    );

    // Filter active services for each garage
    const garagesWithActiveServices = garages.map(garage => {
      const garageObj = garage.toObject();
      garageObj.services = garage.services.filter(s => s.isActive !== false);
      return garageObj;
    });

    res.status(200).json({ 
      success: true, 
      count: garagesWithActiveServices.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      garages: garagesWithActiveServices
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
GET ALL GARAGES (INCLUDING DELETED)
=====================================
*/
exports.getAllGaragesWithDeleted = async (req, res) => {
  try {
    const garages = await populateGarageData(
      Garage.find().sort('-createdAt')
    );

    // Filter active services for each garage
    const garagesWithActiveServices = garages.map(garage => {
      const garageObj = garage.toObject();
      garageObj.services = garage.services.filter(s => s.isActive !== false);
      return garageObj;
    });

    res.status(200).json({
      success: true,
      count: garagesWithActiveServices.length,
      garages: garagesWithActiveServices
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
GET SINGLE GARAGE
=====================================
*/
exports.getGarage = async (req, res) => {
  try {
    const garage = await populateGarageData(
      Garage.findOne({
        _id: req.params.id,
        isDeleted: false
      })
    );

    if (!garage) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    // Only active services
    const activeServices = garage.services.filter(
      (s) => s.isActive !== false
    );

    // Get upcoming bookings count
    const upcomingBookings = garage.bookings?.filter(
      booking => new Date(booking.appointmentDate) > new Date() && 
                 ['pending', 'confirmed'].includes(booking.status)
    ).length || 0;

    // Add stats to response with filtered services
    const garageWithStats = {
      ...garage.toObject(),
      services: activeServices,
      stats: {
        upcomingBookings,
        totalBookings: garage.bookings?.length || 0,
        averageRating: garage.averageRating,
        totalReviews: garage.totalReviews
      }
    };

    res.status(200).json({ 
      success: true, 
      garage: garageWithStats 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
UPDATE GARAGE
=====================================
*/
exports.updateGarage = async (req, res) => {
  try {
    let garage = await Garage.findById(req.params.id);

    if (!garage || garage.isDeleted) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    // Check ownership (admin can update any garage)
    if (garage.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this garage' 
      });
    }

    garage = await Garage.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    const updatedGarage = await populateGarageData(
      Garage.findById(garage._id)
    );

    res.status(200).json({ 
      success: true, 
      message: 'Garage updated successfully',
      garage: updatedGarage 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
ADD SERVICE
=====================================
*/
exports.addService = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: 'Garage not found'
      });
    }

    garage.services.push(req.body);
    await garage.save();

    res.status(200).json({
      success: true,
      message: 'Service added successfully',
      services: garage.services
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/*
=====================================
UPDATE SERVICE
=====================================
*/
exports.updateService = async (req, res) => {
  try {
    const { serviceId } = req.params;

    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: 'Garage not found'
      });
    }

    const service = garage.services.id(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    Object.assign(service, req.body);
    await garage.save();

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      service
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/*
=====================================
DELETE SERVICE (Soft)
=====================================
*/
exports.deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;

    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({
        success: false,
        message: 'Garage not found'
      });
    }

    const service = garage.services.id(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    service.isActive = false;
    await garage.save();

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/*
=====================================
SOFT DELETE GARAGE
=====================================
*/
exports.softDeleteGarage = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    // Check if garage has active bookings
    const activeBookings = await Booking.findOne({
      garage: req.params.id,
      status: { $in: ['pending', 'confirmed', 'in_progress'] },
      isDeleted: false
    });

    if (activeBookings) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete garage with active bookings. Please cancel or complete all bookings first.'
      });
    }

    garage.isDeleted = true;
    garage.deletedAt = new Date();

    await garage.save();

    // Soft delete all associated bookings
    await Booking.updateMany(
      { garage: req.params.id },
      { 
        isDeleted: true, 
        deletedAt: new Date(),
        status: 'cancelled'
      }
    );

    res.status(200).json({ 
      success: true,
      message: 'Garage and associated bookings soft deleted' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
RESTORE GARAGE
=====================================
*/
exports.restoreGarage = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    garage.isDeleted = false;
    garage.deletedAt = null;

    await garage.save();

    // Restore associated non-permanently deleted bookings
    await Booking.updateMany(
      { 
        garage: req.params.id,
        isDeleted: true,
        deletedAt: { $exists: true }
      },
      { 
        isDeleted: false, 
        deletedAt: null,
        status: 'pending' // Reset to pending
      }
    );

    res.status(200).json({ 
      success: true,
      message: 'Garage and associated bookings restored' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
HARD DELETE (PERMANENT)
=====================================
*/
exports.hardDeleteGarage = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    // Check for any bookings
    const hasBookings = await Booking.findOne({ garage: req.params.id });
    
    if (hasBookings) {
      return res.status(400).json({
        success: false,
        message: 'Cannot permanently delete garage with booking history. Soft delete instead.'
      });
    }

    await Garage.findByIdAndDelete(req.params.id);

    res.status(200).json({ 
      success: true,
      message: 'Garage permanently deleted' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
GET GARAGE BOOKINGS
=====================================
*/
exports.getGarageBookings = async (req, res) => {
  try {
    const garage = await Garage.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!garage) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    // Check access (owner or admin)
    if (garage.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view these bookings' 
      });
    }

    // Build query based on filters
    let query = { 
      garage: req.params.id,
      isDeleted: false 
    };

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      query.appointmentDate = {};
      if (req.query.startDate) {
        query.appointmentDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.appointmentDate.$lte = new Date(req.query.endDate);
      }
    }

    const bookings = await Booking.find(query)
      .populate('user', 'name email phone')
      .sort(req.query.sort || '-appointmentDate');

    // Calculate stats
    const stats = {
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      completed: bookings.filter(b => b.status === 'completed').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
      totalRevenue: bookings
        .filter(b => b.status === 'completed' && b.payment?.status === 'paid')
        .reduce((sum, b) => sum + (b.totalPrice || 0), 0)
    };

    res.status(200).json({
      success: true,
      stats,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
UPDATE GARAGE VERIFICATION STATUS
=====================================
*/
exports.verifyGarage = async (req, res) => {
  try {
    const { verified } = req.body;
    
    const garage = await Garage.findById(req.params.id);

    if (!garage || garage.isDeleted) {
      return res.status(404).json({ 
        success: false,
        message: 'Garage not found' 
      });
    }

    garage.isVerified = verified === true || verified === 'true';
    await garage.save();

    res.status(200).json({
      success: true,
      message: `Garage ${garage.isVerified ? 'verified' : 'unverified'} successfully`,
      isVerified: garage.isVerified
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/*
=====================================
SEARCH GARAGES BY LOCATION
=====================================
*/
exports.searchGaragesByLocation = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // radius in km

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Please provide latitude and longitude'
      });
    }

    const garages = await populateGarageData(
      Garage.find({
        isDeleted: false,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: radius * 1000 // Convert km to meters
          }
        }
      })
    );

    // Filter active services for each garage
    const garagesWithActiveServices = garages.map(garage => {
      const garageObj = garage.toObject();
      garageObj.services = garage.services.filter(s => s.isActive !== false);
      return garageObj;
    });

    res.status(200).json({
      success: true,
      count: garagesWithActiveServices.length,
      garages: garagesWithActiveServices
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};