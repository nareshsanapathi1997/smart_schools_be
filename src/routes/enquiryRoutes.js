const express = require('express');
const enquiryController = require('../controllers/enquiryController');
const ext = require('../controllers/erpExtendedController');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

router.post('/', submitLimiter, enquiryController.enquiryValidation, validate, enquiryController.createEnquiry);
router.get('/', protect, authorize('admin', 'super_admin'), enquiryController.getEnquiries);
router.get('/export', protect, authorize('admin', 'super_admin'), enquiryController.exportEnquiries);
router.patch('/:id', protect, authorize('admin', 'super_admin'), enquiryController.updateEnquiry);
router.post('/:id/enroll', protect, authorize('admin', 'super_admin'), ext.enrollFromEnquiry);

module.exports = router;
