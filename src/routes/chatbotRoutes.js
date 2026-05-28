const express = require('express');
const chatbotController = require('../controllers/chatbotController');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/chat', chatbotController.chatValidation, validate, chatbotController.chat);
router.get('/faqs', chatbotController.getFAQs);
router.get('/logs', protect, authorize('admin', 'super_admin'), chatbotController.getChatLogs);
router.get('/analytics', protect, authorize('admin', 'super_admin'), chatbotController.getChatAnalytics);
router.post('/faqs', protect, authorize('admin', 'super_admin'), chatbotController.createFAQValidation, validate, chatbotController.createFAQ);
router.put('/faqs/:id', protect, authorize('admin', 'super_admin'), chatbotController.updateFAQ);
router.delete('/faqs/:id', protect, authorize('admin', 'super_admin'), chatbotController.deleteFAQ);

module.exports = router;
