const express = require('express');
const facultyController = require('../controllers/facultyController');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', facultyController.getFaculty);
router.get('/:slug', facultyController.getFacultyMember);
router.post('/', protect, authorize('admin', 'super_admin'), upload.single('image'), facultyController.createFacultyValidation, validate, facultyController.createFaculty);
router.put('/:id', protect, authorize('admin', 'super_admin'), upload.single('image'), facultyController.updateFaculty);
router.delete('/:id', protect, authorize('admin', 'super_admin'), facultyController.deleteFaculty);

module.exports = router;
