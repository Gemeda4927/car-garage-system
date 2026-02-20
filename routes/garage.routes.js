const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../controllers/auth.controller');
const garageController = require('../controllers/garage.controller');


router.use(protect);

// Routes accessible by authenticated users
router.route('/')
  .post(garageController.createGarage)
  .get(garageController.getGarages);

router.route('/:id')
  .get(garageController.getGarage)
  .put(garageController.updateGarage)
  .delete(garageController.softDeleteGarage);

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

module.exports = router;