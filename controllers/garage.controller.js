const Garage = require('../models/garage');

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

    res.status(201).json({ success: true, garage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET ALL GARAGES (NOT DELETED)
=====================================
*/
exports.getGarages = async (req, res) => {
  try {
    const garages = await Garage.find({ isDeleted: false }).populate(
      'owner',
      'name email phone'
    );

    res.status(200).json({ success: true, garages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET ALL GARAGES (INCLUDING DELETED)
=====================================
*/
exports.getAllGaragesWithDeleted = async (req, res) => {
  try {
    const garages = await Garage.find() // includes deleted
      .populate('owner', 'name email phone');

    res.status(200).json({
      success: true,
      count: garages.length,
      garages
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
GET SINGLE GARAGE
=====================================
*/
exports.getGarage = async (req, res) => {
  try {
    const garage = await Garage.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate('owner', 'name email phone');

    if (!garage) {
      return res.status(404).json({ message: 'Garage not found' });
    }

    res.status(200).json({ success: true, garage });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: 'Garage not found' });
    }

    if (garage.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    garage = await Garage.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, garage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
SOFT DELETE
=====================================
*/
exports.softDeleteGarage = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);

    if (!garage) {
      return res.status(404).json({ message: 'Garage not found' });
    }

    garage.isDeleted = true;
    garage.deletedAt = new Date();

    await garage.save();

    res.status(200).json({ message: 'Garage soft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: 'Garage not found' });
    }

    garage.isDeleted = false;
    garage.deletedAt = null;

    await garage.save();

    res.status(200).json({ message: 'Garage restored' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
=====================================
HARD DELETE (PERMANENT)
=====================================
*/
exports.hardDeleteGarage = async (req, res) => {
  try {
    await Garage.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: 'Garage permanently deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};