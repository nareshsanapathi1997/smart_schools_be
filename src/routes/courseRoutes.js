const express = require('express');
const courseController = require('../controllers/courseController');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', courseController.getCourses);
router.get('/:slug', courseController.getCourse);
router.post('/', protect, authorize('admin', 'super_admin'), upload.single('image'), courseController.createCourseValidation, validate, courseController.createCourse);
router.put('/:id', protect, authorize('admin', 'super_admin'), upload.single('image'), courseController.updateCourse);
router.delete('/:id', protect, authorize('admin', 'super_admin'), courseController.deleteCourse);

module.exports = router;
