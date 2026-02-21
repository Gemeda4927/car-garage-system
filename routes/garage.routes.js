const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../controllers/auth.controller');
const garageController = require('../controllers/garage.controller');

router.use(protect);


router.route('/')
  .post(garageController.createGarage)
  .get(garageController.getGarages);

router.route('/:id')
  .get(garageController.getGarage)
  .put(garageController.updateGarage)
  .delete(garageController.softDeleteGarage);


router.route('/:id/services')
  .post(garageController.addService);

router.route('/:id/services/:serviceId')
  .put(garageController.updateService)
  .delete(garageController.deleteService);

// Garage bookings route
router.get('/:id/bookings', garageController.getGarageBookings);

// Location search route
router.get('/search/location', garageController.searchGaragesByLocation);

// Admin only routes
router.get('/all/include-deleted', 
  authorize('admin'), 
  garageController.getAllGaragesWithDeleted
);

router.put('/:id/restore', 
  authorize('admin'), 
  garageController.restoreGarage
);

router.delete('/:id/hard', 
  authorize('admin'), 
  garageController.hardDeleteGarage
);

router.put('/:id/verify', 
  authorize('admin'), 
  garageController.verifyGarage
);

module.exports = router;