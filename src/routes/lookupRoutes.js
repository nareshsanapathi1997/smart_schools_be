const express = require('express');
const lookupController = require('../controllers/lookupController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', lookupController.getLookups);
router.post('/', protect, authorize('admin', 'super_admin'), lookupController.lookupValidation, validate, lookupController.createLookup);
router.put('/:id', protect, authorize('admin', 'super_admin'), lookupController.updateLookup);
router.delete('/:id', protect, authorize('admin', 'super_admin'), lookupController.deleteLookup);

module.exports = router;
