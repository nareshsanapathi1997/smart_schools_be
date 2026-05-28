const express = require('express');
const galleryController = require('../controllers/galleryController');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', galleryController.getGallery);
router.post(
  '/',
  protect,
  authorize('admin', 'super_admin', 'editor'),
  upload.single('image'),
  galleryController.createGalleryValidation,
  validate,
  galleryController.createGallery
);
router.put(
  '/:id',
  protect,
  authorize('admin', 'super_admin', 'editor'),
  upload.single('image'),
  galleryController.updateGalleryValidation,
  validate,
  galleryController.updateGallery
);
router.delete('/:id', protect, authorize('admin', 'super_admin', 'editor'), galleryController.deleteGallery);

module.exports = router;
