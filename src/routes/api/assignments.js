// src/routes/api/assignments.js
import express from 'express';
import { auth, requireRole } from '../../middleware/auth.js';
import Classroom from '../../models/Classroom.js';
import Assignment from '../../models/Assignment.js';
import StudentAssignment from '../../models/StudentAssignment.js';
import { groqService } from '../../services/groq.js';

const router = express.Router();

// Rest of the code remains the same...
// Create a new assignment (Teacher only)

// In src/routes/api/assignments.js
router.get('/:id/questions/:questionId/report', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { id: assignmentId, questionId } = req.params;
        console.log("Starting report generation for:", { assignmentId, questionId });

        // First, verify the assignment exists and belongs to this teacher
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            console.log("Assignment not found");
            return res.status(404).json({ error: 'Assignment not found' });
        }

        // Get the specific question
        const question = assignment.questions.id(questionId);
        if (!question) {
            console.log("Question not found");
            return res.status(404).json({ error: 'Question not found' });
        }

        // Get all student submissions
        const studentSubmissions = await StudentAssignment.find({
            assignmentId: assignmentId
        }).populate('studentId', 'name');

        console.log(`Found ${studentSubmissions.length} student submissions`);

        // Process submissions for this specific question
        const questionSubmissions = studentSubmissions
            .map(submission => {
                const questionSubmission = submission.submissions.find(s => 
                    s.questionId.toString() === questionId
                );
                
                if (!questionSubmission) return null;

                return {
                    studentName: submission.studentId.name,
                    work: questionSubmission.work,
                    hintsUsed: questionSubmission.hints?.length || 0,
                    status: questionSubmission.isComplete ? 'completed' : 'in_progress',
                    submittedAt: questionSubmission.submittedAt
                };
            })
            .filter(Boolean);

        console.log(`Processed ${questionSubmissions.length} submissions for this question`);

        // Calculate stats
        const stats = {
            totalSubmissions: questionSubmissions.length,
            completed: questionSubmissions.filter(s => s.status === 'completed').length,
            inProgress: questionSubmissions.filter(s => s.status === 'in_progress').length,
            averageHints: questionSubmissions.reduce((acc, s) => acc + s.hintsUsed, 0) / questionSubmissions.length || 0
        };

        // Generate report
        const report = await groqService.generateClassReport(
            question.question,
            questionSubmissions,
            stats
        );

        console.log("Successfully generated report");
        
        res.json({
            success: true,
            report,
            stats
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Add question to assignment (Teacher only)
router.post('/:id/questions', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        // Verify teacher owns the classroom
        const classroom = await Classroom.findOne({
            _id: assignment.classroomId,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const question = await assignment.addQuestion(req.body);
        res.status(201).json(question);
    } catch (error) {
        console.error('Error adding question:', error);
        res.status(400).json({ error: error.message });
    }
});

export default router;