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

router.get('/:id/questions/:questionId/report', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { id: assignmentId, questionId } = req.params;

        // Get assignment and verify teacher ownership
        const assignment = await Assignment.findById(assignmentId)
            .populate({
                path: 'classroomId',
                select: 'teacherId name'
            });

        if (!assignment || !assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get all student submissions for this question
        const studentAssignments = await StudentAssignment.find({
            assignmentId,
            'submissions.questionId': questionId
        }).populate('studentId', 'name');

        // Process submissions for analysis, including feedback
        const submissions = studentAssignments
            .map(sa => {
                const submission = sa.submissions.find(s => 
                    s.questionId.toString() === questionId
                );
                if (!submission) return null;

                return {
                    studentId: sa.studentId.name,
                    work: submission.work,
                    hints: submission.hints || [],
                    mode: submission.mode,
                    feedback: submission.feedback || {},
                    status: submission.isComplete ? 'completed' : 
                            submission.work ? 'in_progress' : 'not_started',
                    submissionTime: submission.submittedAt
                };
            })
            .filter(Boolean);

        // Get the question content for context
        const question = assignment.questions.id(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Calculate submission statistics
        const stats = {
            totalSubmissions: submissions.length,
            completed: submissions.filter(s => s.status === 'completed').length,
            inProgress: submissions.filter(s => s.status === 'in_progress').length,
            averageHints: (submissions.reduce((acc, s) => acc + s.hints.length, 0) / submissions.length || 0).toFixed(1),
            submissionModes: Object.entries(
                submissions.reduce((acc, s) => {
                    acc[s.mode] = (acc[s.mode] || 0) + 1;
                    return acc;
                }, {})
            )
        };

        // Generate AI report with enhanced context
        const report = await groqService.generateClassReport(
            question.question,
            submissions,
            stats
        );

        res.json({
            stats,
            report,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Error generating assignment report:', error);
        res.status(500).json({ 
            error: 'Failed to generate report',
            details: error.message 
        });
    }
});
router.post('/', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { classroomId, title, description, dueDate, questions } = req.body;
        
        // Verify teacher owns this classroom
        const classroom = await Classroom.findOne({
            _id: classroomId,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        const assignment = new Assignment({
            classroomId,
            title,
            description,
            dueDate,
            questions: questions || []
        });
        
        await assignment.save();
        
        // Create StudentAssignment records for all students
        const studentAssignments = classroom.students.map(studentId => ({
            studentId,
            assignmentId: assignment._id,
            classroomId
        }));
        
        await StudentAssignment.insertMany(studentAssignments);
        
        res.status(201).json(assignment);
    } catch (error) {
        console.error('Error creating assignment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get assignments for a classroom
router.get('/classroom/:classroomId', auth, async (req, res) => {
    try {
        const classroom = await Classroom.findById(req.params.classroomId);
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        // Verify access
        const isTeacher = classroom.teacherId.equals(req.user._id);
        const isStudent = classroom.students.some(id => id.equals(req.user._id));
        
        if (!isTeacher && !isStudent) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const assignments = await Assignment.find({
            classroomId: req.params.classroomId,
            active: true
        });
        
        if (isStudent) {
            // Include progress for student
            const studentAssignments = await StudentAssignment.find({
                studentId: req.user._id,
                assignmentId: { $in: assignments.map(a => a._id) }
            });
            
            const assignmentsWithProgress = assignments.map(assignment => ({
                ...assignment.toObject(),
                progress: studentAssignments.find(sa => 
                    sa.assignmentId.equals(assignment._id)
                )
            }));
            
            res.json(assignmentsWithProgress);
        } else {
            res.json(assignments);
        }
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ error: error.message });
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