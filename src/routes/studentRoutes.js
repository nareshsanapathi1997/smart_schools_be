const express = require('express');
const studentController = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/stats', protect, authorize('admin', 'super_admin'), studentController.getStudentStats);
router.get('/template', protect, authorize('admin', 'super_admin'), studentController.downloadTemplate);
router.get('/export', protect, authorize('admin', 'super_admin'), studentController.exportStudents);
router.get('/', protect, authorize('admin', 'super_admin'), studentController.getStudents);
router.post('/', protect, authorize('admin', 'super_admin'), studentController.studentValidation, validate, studentController.createStudent);
router.post('/bulk', protect, authorize('admin', 'super_admin'), studentController.bulkImportStudents);
router.put('/:id', protect, authorize('admin', 'super_admin'), studentController.updateStudent);
router.delete('/:id', protect, authorize('admin', 'super_admin'), studentController.deleteStudent);

module.exports = router;
