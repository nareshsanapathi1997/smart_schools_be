const express = require('express');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

router.get('/webhook', whatsappController.verifyWebhook);
router.post('/webhook', whatsappController.handleWebhook);

module.exports = router;
