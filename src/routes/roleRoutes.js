const express = require('express');
const roleController = require('../controllers/roleController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', protect, authorize('super_admin', 'admin'), roleController.getRoles);
router.post('/', protect, authorize('super_admin'), roleController.roleValidation, validate, roleController.createRole);
router.put('/:id', protect, authorize('super_admin'), roleController.roleValidation, validate, roleController.updateRole);
router.delete('/:id', protect, authorize('super_admin'), roleController.deleteRole);

module.exports = router;
