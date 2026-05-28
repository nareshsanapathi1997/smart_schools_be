const express = require('express');
const erp = require('../controllers/erpController');
const ext = require('../controllers/erpExtendedController');
const { protect, authorize } = require('../middleware/auth');
const { protectPortal } = require('../middleware/portalAuth');
const { protectTeacher } = require('../middleware/teacherAuth');
const validate = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const admin = [protect, authorize('admin', 'super_admin')];
const portalLoginLimiter = rateLimit({ windowMs: 60 * 1000, max: 15 });

router.get('/attendance', ...admin, erp.getAttendance);
router.get('/attendance/report', ...admin, erp.getAttendanceReport);
router.post('/attendance/bulk', ...admin, erp.markAttendanceBulk);

router.get('/timetable', ...admin, erp.getTimetable);
router.post('/timetable', ...admin, erp.createTimetable);
router.put('/timetable/:id', ...admin, erp.updateTimetable);
router.delete('/timetable/:id', ...admin, erp.deleteTimetable);

router.get('/homework', ...admin, erp.getHomework);
router.post('/homework', ...admin, erp.createHomework);
router.put('/homework/:id', ...admin, erp.updateHomework);
router.delete('/homework/:id', ...admin, erp.deleteHomework);

router.get('/exam-terms', ...admin, erp.getExamTerms);
router.post('/exam-terms', ...admin, erp.createExamTerm);
router.put('/exam-terms/:id', ...admin, erp.updateExamTerm);
router.delete('/exam-terms/:id', ...admin, erp.deleteExamTerm);
router.get('/exams', ...admin, erp.getExams);
router.post('/exams', ...admin, erp.createExam);
router.put('/exams/:id', ...admin, erp.updateExam);
router.delete('/exams/:id', ...admin, erp.deleteExam);
router.post('/exams/:id/publish', ...admin, ext.publishExamResults);
router.get('/exams/:examId/marks', ...admin, erp.getExamMarks);
router.post('/exams/:examId/marks', ...admin, erp.saveExamMarks);
router.get('/report-cards/:studentId/:termId?', ...admin, erp.getReportCard);

router.get('/fee-heads', ...admin, erp.getFeeHeads);
router.post('/fee-heads', ...admin, erp.createFeeHead);
router.put('/fee-heads/:id', ...admin, erp.updateFeeHead);
router.delete('/fee-heads/:id', ...admin, erp.deleteFeeHead);
router.get('/fee-invoices/stats', ...admin, erp.getFeeStats);
router.post('/fee-invoices/bulk-generate', ...admin, erp.bulkGenerateFeeInvoices);
router.post('/fee-invoices/send-reminders', ...admin, ext.sendFeeReminders);
router.get('/fee-invoices', ...admin, erp.getFeeInvoices);
router.post('/fee-invoices', ...admin, erp.createFeeInvoice);
router.put('/fee-invoices/:id', ...admin, erp.updateFeeInvoice);
router.delete('/fee-invoices/:id', ...admin, erp.deleteFeeInvoice);
router.patch('/fee-invoices/:id/pay', ...admin, erp.payFeeInvoice);

router.get('/transport', ...admin, erp.getTransportRoutes);
router.post('/transport/routes', ...admin, erp.createTransportRoute);
router.put('/transport/routes/:id', ...admin, erp.updateTransportRoute);
router.delete('/transport/routes/:id', ...admin, erp.deleteTransportRoute);
router.post('/transport/stops', ...admin, erp.createTransportStop);
router.put('/transport/stops/:id', ...admin, erp.updateTransportStop);
router.delete('/transport/stops/:id', ...admin, erp.deleteTransportStop);
router.post('/transport/assign', ...admin, erp.assignTransport);
router.delete('/transport/assignments/:id', ...admin, erp.deleteTransportAssignment);
router.get('/transport/assignments', ...admin, erp.getStudentTransport);

router.get('/library/books', ...admin, erp.getLibraryBooks);
router.post('/library/books', ...admin, erp.createLibraryBook);
router.put('/library/books/:id', ...admin, erp.updateLibraryBook);
router.delete('/library/books/:id', ...admin, erp.deleteLibraryBook);
router.get('/library/issues', ...admin, erp.getLibraryIssues);
router.post('/library/issues', ...admin, erp.issueBook);
router.patch('/library/issues/:id/return', ...admin, erp.returnBook);

router.get('/payroll/staff', ...admin, erp.getPayrollStaff);
router.post('/payroll/staff', ...admin, erp.createPayrollStaff);
router.put('/payroll/staff/:id', ...admin, erp.updatePayrollStaff);
router.delete('/payroll/staff/:id', ...admin, erp.deletePayrollStaff);
router.get('/payroll/runs', ...admin, erp.getPayrollRuns);
router.post('/payroll/runs', ...admin, erp.createPayrollRun);
router.post('/payroll/runs/:id/process', ...admin, erp.processPayrollRun);
router.get('/payroll/payslips/:id', ...admin, erp.getPayrollPayslip);

router.get('/certificates/templates', ...admin, erp.getCertificateTemplates);
router.post('/certificates/templates', ...admin, erp.createCertificateTemplate);
router.put('/certificates/templates/:id', ...admin, erp.updateCertificateTemplate);
router.delete('/certificates/templates/:id', ...admin, erp.deleteCertificateTemplate);
router.get('/certificates', ...admin, erp.getCertificates);
router.post('/certificates', ...admin, erp.createCertificate);
router.put('/certificates/:id', ...admin, erp.updateCertificate);
router.delete('/certificates/:id', ...admin, erp.deleteCertificate);

router.get('/teachers', ...admin, erp.getTeachers);

router.get('/alerts/templates', ...admin, erp.getAlertTemplates);
router.post('/alerts/templates', ...admin, erp.createAlertTemplate);
router.put('/alerts/templates/:id', ...admin, erp.updateAlertTemplate);
router.delete('/alerts/templates/:id', ...admin, erp.deleteAlertTemplate);
router.get('/alerts/logs', ...admin, erp.getAlertLogs);
router.post('/alerts/send', ...admin, erp.sendAlert);

router.get('/analytics/dashboard', ...admin, ext.getErpAnalytics);
router.get('/academic-years', ...admin, ext.getAcademicYears);
router.post('/academic-years', ...admin, ext.createAcademicYear);
router.put('/academic-years/:id', ...admin, ext.updateAcademicYear);
router.delete('/academic-years/:id', ...admin, ext.deleteAcademicYear);
router.patch('/academic-years/:id/current', ...admin, ext.setCurrentAcademicYear);

router.get('/portal/accounts', ...admin, ext.getPortalAccounts);
router.patch('/portal/accounts/:id/reset-password', ...admin, ext.resetPortalPassword);
router.patch('/portal/accounts/:id/toggle', ...admin, ext.togglePortalAccount);
router.post('/portal/provision', ...admin, erp.provisionPortalAccounts);
router.post('/portal/provision/student/:studentId', ...admin, ext.provisionStudentPortal);
router.post('/portal/login', portalLoginLimiter, erp.portalLoginValidation, validate, erp.portalLogin);
router.get('/portal/me', protectPortal, erp.portalMe);
router.get('/portal/dashboard', protectPortal, erp.getPortalDashboard);
router.post('/portal/payments/invoices/:invoiceId/order', protectPortal, ext.createPaymentOrder);
router.post('/portal/payments/verify', protectPortal, ext.verifyPayment);

router.get('/teacher/accounts', ...admin, ext.getTeacherAccounts);
router.post('/teacher/accounts', ...admin, ext.createTeacherAccount);
router.post('/teacher/provision', ...admin, ext.provisionTeacherAccounts);
router.patch('/teacher/accounts/:id/reset-password', ...admin, ext.resetTeacherPassword);
router.patch('/teacher/accounts/:id/toggle', ...admin, ext.toggleTeacherAccount);
router.post('/teacher/login', portalLoginLimiter, ext.teacherLoginValidation, validate, ext.teacherLogin);
router.get('/teacher/dashboard', protectTeacher, ext.getTeacherDashboard);

module.exports = router;
