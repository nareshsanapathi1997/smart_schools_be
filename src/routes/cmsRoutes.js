const express = require('express');
const cmsController = require('../controllers/cmsController');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/announcements', cmsController.getAnnouncements);
router.post('/announcements', protect, authorize('admin', 'super_admin', 'editor'), cmsController.createAnnouncement);
router.put('/announcements/:id', protect, authorize('admin', 'super_admin', 'editor'), cmsController.updateAnnouncement);
router.get('/events', cmsController.getEvents);
router.get('/events/:slug', cmsController.getEvent);
router.post('/events', protect, authorize('admin', 'super_admin', 'editor'), upload.single('image'), cmsController.createEvent);
router.put('/events/:id', protect, authorize('admin', 'super_admin', 'editor'), upload.single('image'), cmsController.updateEvent);
router.get('/testimonials', cmsController.getTestimonials);
router.post('/testimonials', protect, authorize('admin', 'super_admin', 'editor'), cmsController.createTestimonial);
router.put('/testimonials/:id', protect, authorize('admin', 'super_admin', 'editor'), cmsController.updateTestimonial);
router.get('/achievements', cmsController.getAchievements);
router.post('/achievements', protect, authorize('admin', 'super_admin', 'editor'), upload.single('image'), cmsController.createAchievement);
router.put('/achievements/:id', protect, authorize('admin', 'super_admin', 'editor'), upload.single('image'), cmsController.updateAchievement);
router.post('/contact', cmsController.contactValidation, validate, cmsController.createContact);
router.get('/contacts', protect, authorize('admin', 'super_admin', 'editor'), cmsController.getContacts);
router.get('/contacts/export', protect, authorize('admin', 'super_admin', 'editor'), cmsController.exportContacts);
router.patch('/contacts/:id', protect, authorize('admin', 'super_admin', 'editor'), cmsController.markContactRead);
router.post('/newsletter', cmsController.newsletterValidation, validate, cmsController.subscribeNewsletter);
router.post('/newsletter/unsubscribe', cmsController.newsletterValidation, validate, cmsController.unsubscribeNewsletter);
router.get('/newsletter/subscribers', protect, authorize('admin', 'super_admin', 'editor'), cmsController.getNewsletterSubscribers);
router.patch('/newsletter/subscribers/:id', protect, authorize('admin', 'super_admin', 'editor'), cmsController.patchNewsletterSubscriber);
router.get('/newsletter/export', protect, authorize('admin', 'super_admin', 'editor'), cmsController.exportNewsletter);
router.get('/sitemap-urls', cmsController.getSitemapUrls);
router.get('/activity-logs', protect, authorize('super_admin', 'admin'), cmsController.getActivityLogs);
router.get('/settings/integrations', protect, authorize('admin', 'super_admin'), cmsController.getIntegrations);
router.get('/settings', cmsController.getSettings);
router.put('/settings/:key', protect, authorize('super_admin', 'admin'), cmsController.updateSetting);
router.get('/analytics', protect, authorize('admin', 'super_admin', 'editor'), cmsController.getDashboardAnalytics);
router.delete('/:table/:id', protect, authorize('admin', 'super_admin'), cmsController.deleteRecord);

module.exports = router;
