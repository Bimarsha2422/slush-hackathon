// src/routes/teacher.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';
import { groqService } from '../services/groq.js';

const router = express.Router();

// Teacher dashboard
router.get('/dashboard', authPage(['teacher']), async (req, res) => {
    try {
        console.log('Loading dashboard for teacher:', req.user._id);
        
        // Get all classrooms for this teacher
        const classrooms = await Classroom.find({ 
            teacherId: req.user._id,
            active: true 
        });

        // Calculate total students
        let totalStudents = 0;
        classrooms.forEach(classroom => {
            totalStudents += classroom.students.length;
        });

        // Get active assignments
        const assignments = await Assignment.find({
            classroomId: { $in: classrooms.map(c => c._id) },
            active: true
        });

        // Get recent activity
        const recentAssignments = await Assignment.find({
            classroomId: { $in: classrooms.map(c => c._id) }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('classroomId', 'name');

        const recentActivity = recentAssignments.map(assignment => ({
            type: 'assignment',
            message: `New assignment "${assignment.title}" created in ${assignment.classroomId?.name || 'Unknown Class'}`,
            timestamp: assignment.createdAt
        }));

        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            stats: {
                classroomCount: classrooms.length,
                studentCount: totalStudents,
                assignmentCount: assignments.length
            },
            classrooms: classrooms.map(c => ({
                _id: c._id.toString(),
                name: c.name
            })),
            recentActivity
        });
    } catch (error) {
        console.error('Error loading teacher dashboard:', error);
        res.status(500).render('error', {
            message: 'Error loading dashboard'
        });
    }
});

// View specific assignment with submissions
router.get('/assignments/:id', authPage(['teacher']), async (req, res) => {
    try {
        // Get assignment details
        const assignment = await Assignment.findById(req.params.id)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        // Verify teacher owns this classroom
        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).render('error', {
                message: 'Access denied'
            });
        }

        // Get all student submissions for this assignment
        const studentSubmissions = await StudentAssignment.find({
            assignmentId: assignment._id
        }).populate('studentId', 'name email');

        // Format questions with submission stats
        const questionsWithStats = assignment.questions.map((question) => {
            const questionSubmissions = studentSubmissions.map(sa => {
                const submission = sa.submissions.find(s => 
                    s.questionId.equals(question._id)
                );
                
                if (!submission) return null;
                
                return {
                    studentId: sa.studentId._id,
                    studentName: sa.studentId.name,
                    status: submission.isComplete ? 'completed' :
                            submission.work ? 'in_progress' : 'not_started',
                    mode: submission.mode,
                    hintsUsed: submission.hints?.length || 0,
                    submissionTime: submission.submittedAt,
                    questionId: question._id.toString(),
                    assignmentId: assignment._id.toString()
                };
            }).filter(Boolean);

            return {
                ...question.toObject(),
                questionId: question._id.toString(),
                _id: question._id.toString(),
                questionNumber: assignment.questions.indexOf(question) + 1,
                submissions: questionSubmissions,
                assignmentId: assignment._id.toString(),
                stats: {
                    totalSubmissions: questionSubmissions.length,
                    completed: questionSubmissions.filter(s => s.status === 'completed').length,
                    inProgress: questionSubmissions.filter(s => s.status === 'in_progress').length,
                    averageHints: (questionSubmissions.reduce((acc, s) => acc + s.hintsUsed, 0) /
                                questionSubmissions.length || 0).toFixed(1)
                }
            };
        });

        // Format data for the template
        const viewData = {
            title: `${assignment.title} - Details`,
            assignment: {
                ...assignment.toObject(),
                _id: assignment._id.toString(),
                questions: questionsWithStats
            },
            classroom: assignment.classroomId,
            studentCount: assignment.classroomId.students.length,
            classroomId: assignment.classroomId._id.toString()
        };

        res.render('teacher/assignment-details', viewData);
    } catch (error) {
        console.error('Error loading assignment details:', error);
        res.status(500).render('error', {
            message: 'Error loading assignment details'
        });
    }
});

// View individual student submission
router.get('/assignments/:assignmentId/questions/:questionId/submissions/:studentId', authPage(['teacher']), async (req, res) => {
    try {
        const { assignmentId, questionId, studentId } = req.params;
        console.log('Loading submission:', { assignmentId, questionId, studentId });

        // Get assignment with classroom info
        const assignment = await Assignment.findById(assignmentId)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', { message: 'Assignment not found' });
        }

        // Verify teacher ownership
        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).render('error', { message: 'Access denied' });
        }

        // Get student submission
        const studentAssignment = await StudentAssignment.findOne({
            assignmentId,
            studentId
        }).populate('studentId', 'name email');

        if (!studentAssignment) {
            return res.status(404).render('error', { message: 'Submission not found' });
        }

        const question = assignment.questions.id(questionId);
        if (!question) {
            return res.status(404).render('error', { message: 'Question not found' });
        }

        const submission = studentAssignment.submissions.find(s =>
            s.questionId.toString() === questionId
        );

        if (!submission) {
            return res.status(404).render('error', { message: 'No work found for this question' });
        }

        // Format canvas submissions
        if (submission.mode === 'canvas' && !submission.work.startsWith('data:image')) {
            submission.work = `data:image/png;base64,${submission.work}`;
        }

        res.render('teacher/student-submission', {
            title: `${studentAssignment.studentId.name}'s Work - ${assignment.title}`,
            assignment: {
                _id: assignment._id.toString(),
                title: assignment.title
            },
            student: studentAssignment.studentId,
            question: {
                content: question.question,
                number: assignment.questions.indexOf(question) + 1
            },
            questionNumber: assignment.questions.indexOf(question) + 1,
            totalQuestions: assignment.questions.length,
            submission: {
                work: submission.work,
                mode: submission.mode,
                status: submission.isComplete ? 'completed' : 'in_progress',
                submissionTime: submission.submittedAt,
                hints: submission.hints || [],
                feedback: submission.feedback
            }
        });

    } catch (error) {
        console.error('Error loading submission:', error);
        res.status(500).render('error', {
            message: 'Error loading submission'
        });
    }
});

// Generate AI report for a question
router.get('/assignments/:id/questions/:questionId/report', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { id: assignmentId, questionId } = req.params;
        console.log('Generating report for:', { assignmentId, questionId });

        // Get assignment and verify teacher ownership
        const assignment = await Assignment.findById(assignmentId)
            .populate({
                path: 'classroomId',
                select: 'teacherId name'
            });

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get question
        const question = assignment.questions.id(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Get student submissions
        const studentAssignments = await StudentAssignment.find({
            assignmentId,
            'submissions.questionId': questionId
        }).populate('studentId', 'name');

        // Process submissions for analysis
        const submissions = studentAssignments
            .map(sa => {
                const submission = sa.submissions.find(s =>
                    s.questionId.toString() === questionId
                );

                if (!submission) return null;

                return {
                    studentName: sa.studentId.name,
                    work: submission.work,
                    mode: submission.mode,
                    hintsUsed: submission.hints?.length || 0,
                    status: submission.isComplete ? 'completed' : 'in_progress',
                    feedback: submission.feedback,
                    submissionTime: submission.submittedAt
                };
            })
            .filter(Boolean);

        // Calculate stats
        const stats = {
            totalSubmissions: submissions.length,
            completed: submissions.filter(s => s.status === 'completed').length,
            inProgress: submissions.filter(s => s.status === 'in_progress').length,
            averageHints: (submissions.reduce((acc, s) => acc + s.hintsUsed, 0) / submissions.length || 0).toFixed(1)
        };

        // Generate report
        const report = await groqService.generateClassReport(
            question.question,
            submissions,
            stats
        );

        res.json({
            success: true,
            report,
            stats
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate report',
            details: error.message
        });
    }
});

// View specific classroom
router.get('/classroom/:id', authPage(['teacher']), async (req, res) => {
    try {
        const classroom = await Classroom.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        }).populate('students', 'name email');

        if (!classroom) {
            return res.status(404).render('error', {
                message: 'Classroom not found'
            });
        }

        // Get assignments for this classroom
        const assignments = await Assignment.find({
            classroomId: classroom._id
        }).sort({ createdAt: -1 });

        // Get submission counts for assignments
        const submissionCounts = await Promise.all(
            assignments.map(async assignment => {
                const count = await StudentAssignment.countDocuments({
                    assignmentId: assignment._id,
                    status: 'completed'
                });
                return {
                    assignmentId: assignment._id,
                    count
                };
            })
        );

        // Add submission counts to assignments
        const assignmentsWithCounts = assignments.map(assignment => ({
            ...assignment.toObject(),
            submissionCount: submissionCounts.find(
                sc => sc.assignmentId.equals(assignment._id)
            )?.count || 0
        }));

        res.render('teacher/classroom', {
            title: classroom.name,
            classroom: classroom.toObject(),
            assignments: assignmentsWithCounts,
            helpers: {
                initials: function(name) {
                    return name.split(' ')
                        .map(part => part[0])
                        .join('')
                        .toUpperCase();
                },
                formatDate: function(date) {
                    return new Date(date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error loading classroom:', error);
        res.status(500).render('error', {
            message: 'Error loading classroom'
        });
    }
});

// Create assignment form route
router.get('/assignments/create/:classroomId', authPage(['teacher']), async (req, res) => {
    try {
        // Verify teacher owns this classroom
        const classroom = await Classroom.findOne({
            _id: req.params.classroomId,
            teacherId: req.user._id
        }).populate('students', 'name email');

        if (!classroom) {
            return res.status(404).render('error', {
                message: 'Classroom not found'
            });
        }

        res.render('teacher/create-assignment', {
            title: 'Create Assignment',
            classroom: classroom.toObject()
        });
    } catch (error) {
        console.error('Error loading create assignment page:', error);
        res.status(500).render('error', {
            message: 'Error loading create assignment page'
        });
    }
});

// Handle assignment creation
router.post('/assignments/create', authPage(['teacher']), async (req, res) => {
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

        // Input validation
        if (!title || !questions || !Array.isArray(questions)) {
            return res.status(400).json({ error: 'Invalid input data' });
        }

        // Create the assignment
        const assignment = new Assignment({
            classroomId,
            title,
            description,
            dueDate: dueDate || undefined,
            questions: questions.map(q => ({
                question: q.question,
                solution: q.solution,
                type: 'math'
            })),
            active: true
        });

        await assignment.save();

        // Create StudentAssignment records for all students
        if (classroom.students.length > 0) {
            const studentAssignments = classroom.students.map(studentId => ({
                studentId,
                assignmentId: assignment._id,
                classroomId,
                status: 'not_started',
                submissions: []
            }));

            await StudentAssignment.insertMany(studentAssignments);
        }

        res.redirect(`/teacher/classroom/${classroomId}`);
    } catch (error) {
        console.error('Error creating assignment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update assignment status
router.patch('/assignments/:id/status', authPage(['teacher']), async (req, res) => {
    try {
        const { active } = req.body;
        const assignment = await Assignment.findOne({
            _id: req.params.id
        }).populate('classroomId');

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        // Verify ownership
        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        assignment.active = active;
        await assignment.save();

        res.json({ message: 'Assignment status updated successfully' });
    } catch (error) {
        console.error('Error updating assignment status:', error);
        res.status(500).json({ error: 'Failed to update assignment status' });
    }
});

// Delete assignment
router.delete('/assignments/:id', authPage(['teacher']), async (req, res) => {
    try {
        const assignment = await Assignment.findOne({
            _id: req.params.id
        }).populate('classroomId');

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        // Verify ownership
        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete all related student assignments
        await StudentAssignment.deleteMany({
            assignmentId: assignment._id
        });

        // Delete the assignment
        await Assignment.deleteOne({ _id: assignment._id });

        res.json({ message: 'Assignment deleted successfully' });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        res.status(500).json({ error: 'Failed to delete assignment' });
    }
});

// Helper function to validate assignment input
function validateAssignmentInput(data) {
    const { title, questions } = data;
    
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Valid title is required');
    }
    
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('At least one question is required');
    }
    
    questions.forEach((q, index) => {
        if (!q.question || typeof q.question !== 'string' || q.question.trim().length === 0) {
            throw new Error(`Question ${index + 1} is missing content`);
        }
    });

    return true;
}

// Error handling middleware
router.use((err, req, res, next) => {
    console.error('Teacher route error:', err);
    if (req.xhr || req.headers.accept.includes('json')) {
        res.status(500).json({ 
            error: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } else {
        res.status(500).render('error', {
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

export default router;

