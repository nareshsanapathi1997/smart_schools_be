const express = require('express');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/login', authController.loginValidation, validate, authController.login);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.me);
router.post('/forgot-password', authController.forgotPasswordValidation, validate, authController.forgotPassword);
router.post('/reset-password', authController.resetPasswordValidation, validate, authController.resetPassword);
router.get('/users', protect, authorize('super_admin', 'admin'), authController.getUsers);
router.post('/users', protect, authorize('super_admin'), authController.createUserValidation, validate, authController.createUser);
router.put('/users/:id', protect, authorize('super_admin'), authController.updateUserValidation, validate, authController.updateUser);
router.delete('/users/:id', protect, authorize('super_admin'), authController.deactivateUser);
router.post('/users/:id/reset-password', protect, authorize('super_admin'), authController.adminResetPasswordValidation, validate, authController.adminResetPassword);

module.exports = router;
