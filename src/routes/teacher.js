// src/routes/teacher.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';

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

        console.log('Found classrooms:', classrooms);

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

        // Render the dashboard with all data
        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            stats: {
                classroomCount: classrooms.length,
                studentCount: totalStudents,
                assignmentCount: assignments.length
            },
            classrooms: classrooms.map(c => ({
                _id: c._id,
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
                return submission ? {
                    studentId: sa.studentId._id,
                    studentName: sa.studentId.name,
                    status: submission.isComplete ? 'completed' : 
                            submission.work ? 'in_progress' : 'not_started',
                    mode: submission.mode,
                    hintsUsed: submission.hints?.length || 0,
                    submissionTime: submission.submittedAt,
                    questionId: question._id // Add this line to explicitly pass question ID
                } : null;
            }).filter(Boolean);
        
            return {
                ...question.toObject(),
                questionId: question._id,  // Ensure questionId is available at this level
                _id: question._id,
                questionNumber: assignment.questions.indexOf(question) + 1,
                submissions: questionSubmissions,
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
                questions: questionsWithStats
            },
            classroom: assignment.classroomId,
            studentCount: assignment.classroomId.students.length, 
            classroomId: assignment.classroomId._id, 
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
        console.log('Params:', { assignmentId, questionId, studentId }); // Debug log

        // Get assignment with classroom info
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            console.log('Assignment not found:', assignmentId);
            return res.status(404).render('error', { message: 'Assignment not found' });
        }
        console.log('Found assignment:', assignment._id); // Debug log

        await assignment.populate('classroomId');

        if (!assignment.classroomId.teacherId.equals(req.user._id)) {
            return res.status(403).render('error', { message: 'Access denied' });
        }

        // Get student info and submission with populated student data
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

        // For canvas submissions, ensure proper image data format
        if (submission.mode === 'canvas' && !submission.work.startsWith('data:image')) {
            submission.work = `data:image/png;base64,${submission.work}`;
        }

        console.log('Rendering with assignment ID:', assignment._id); // Debug log

        // Render with complete data
        res.render('teacher/student-submission', {
            title: `${studentAssignment.studentId.name}'s Work - ${assignment.title}`,
            assignment: {
                _id: assignment._id.toString(),  // Explicitly include ID as string
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
        console.error('Error loading submission page:', error);
        res.status(500).render('error', {
            message: 'Error loading submission'
        });
    }
});

// Generate AI report for a question
router.get('/:id/questions/:questionId/report', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { id: assignmentId, questionId } = req.params;

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

        // Get the specific question
        const question = assignment.questions.id(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Get all student submissions for this question
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

        // Calculate submission statistics
        const stats = {
            totalSubmissions: submissions.length,
            completed: submissions.filter(s => s.status === 'completed').length,
            inProgress: submissions.filter(s => s.status === 'in_progress').length,
            averageHints: (submissions.reduce((acc, s) => acc + s.hintsUsed, 0) / submissions.length || 0).toFixed(1)
        };

        // Generate the report using groqService
        const report = await groqService.generateClassReport(
            question.question, // Pass the question content
            submissions,
            stats
        );

        // Send the response
        res.json({
            stats,
            report: {
                ...report,
                timestamp: new Date(),
                submissionCount: submissions.length
            }
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
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

// GET route to show the create assignment form
router.get('/assignments/create/:classroomId', authPage(['teacher']), async (req, res) => {
    try {
        // First verify the teacher owns this classroom
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

// POST route to handle the assignment creation
router.post('/assignments/create', authPage(['teacher']), async (req, res) => {
    try {
        const { classroomId, title, description, dueDate, questions } = req.body;

        // Verify the teacher owns this classroom
        const classroom = await Classroom.findOne({
            _id: classroomId,
            teacherId: req.user._id
        });

        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
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
            }))
        });

        await assignment.save();

        // Create StudentAssignment records for all students
        if (classroom.students.length > 0) {
            const studentAssignments = classroom.students.map(studentId => ({
                studentId,
                assignmentId: assignment._id,
                classroomId
            }));
            await StudentAssignment.insertMany(studentAssignments);
        }

        // Redirect back to classroom page
        res.redirect(`/teacher/classroom/${classroomId}`);
    } catch (error) {
        console.error('Error creating assignment:', error);
        res.status(400).json({ error: error.message });
    }
});

export default router;