// src/routes/api/progress.js
import express from 'express';
import { auth, requireRole } from '../../middleware/auth.js';
import Assignment from '../../models/Assignment.js';
import StudentAssignment from '../../models/StudentAssignment.js';

const router = express.Router();

// Rest of the code remains the same...
// Submit work for a question
router.post('/submit/:assignmentId/:questionId', auth, requireRole(['student']), async (req, res) => {
    try {
        const { work, mode } = req.body;
        
        const studentAssignment = await StudentAssignment.findOne({
            assignmentId: req.params.assignmentId,
            studentId: req.user._id
        });
        
        if (!studentAssignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        await studentAssignment.addSubmission(
            req.params.questionId,
            work,
            mode
        );
        
        res.json(studentAssignment);
    } catch (error) {
        console.error('Error submitting work:', error);
        res.status(400).json({ error: error.message });
    }
});

// Mark question as complete
router.post('/complete/:assignmentId/:questionId', auth, requireRole(['student']), async (req, res) => {
    try {
        const studentAssignment = await StudentAssignment.findOne({
            assignmentId: req.params.assignmentId,
            studentId: req.user._id
        });
        
        if (!studentAssignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        await studentAssignment.markQuestionComplete(req.params.questionId);
        res.json(studentAssignment);
    } catch (error) {
        console.error('Error marking complete:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get progress for specific assignment
router.get('/:assignmentId', auth, async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.assignmentId);
        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        if (req.user.role === 'student') {
            // Get student's own progress
            const progress = await StudentAssignment.findOne({
                assignmentId: req.params.assignmentId,
                studentId: req.user._id
            });
            
            res.json(progress);
        } else {
            // Teacher gets all students' progress
            const progress = await StudentAssignment.find({
                assignmentId: req.params.assignmentId
            }).populate('studentId', 'name email');
            
            res.json(progress);
        }
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;