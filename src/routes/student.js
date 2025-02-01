// src/routes/student.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';
import User from '../models/User.js';

const router = express.Router();

// Student dashboard
router.get('/dashboard', authPage(['student']), async (req, res) => {
    try {
        // Get all classrooms where student is enrolled
        const classrooms = await Classroom.find({ 
            students: req.user._id,
            active: true 
        }).populate('teacherId', 'name');

        // Get all assignments for these classrooms
        const assignments = await Assignment.find({
            classroomId: { $in: classrooms.map(c => c._id) },
            active: true
        }).populate('classroomId', 'name');

        // Get student's assignment progress
        const studentAssignments = await StudentAssignment.find({
            studentId: req.user._id,
            assignmentId: { $in: assignments.map(a => a._id) }
        });

        // Calculate statistics
        const stats = {
            classCount: classrooms.length,
            totalAssignments: assignments.length,
            completedAssignments: studentAssignments.filter(sa => sa.status === 'completed').length,
            pendingAssignments: assignments.length - studentAssignments.filter(sa => sa.status === 'completed').length
        };

        // Get recent activity (last 5 assignments)
        const recentActivity = assignments
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5)
            .map(assignment => ({
                type: 'assignment',
                message: `New assignment "${assignment.title}" in ${assignment.classroomId.name}`,
                timestamp: assignment.createdAt
            }));

        // Prepare classroom data with assignment counts
        const classroomsData = classrooms.map(c => ({
            _id: c._id,
            name: c.name,
            teacherName: c.teacherId.name,
            assignmentCount: assignments.filter(a => 
                a.classroomId._id.toString() === c._id.toString()
            ).length
        }));

        res.render('student/dashboard', {
            title: 'Student Dashboard',
            stats,
            classrooms: classroomsData,
            recentActivity
        });
    } catch (error) {
        console.error('Error loading student dashboard:', error);
        res.status(500).render('error', {
            message: 'Error loading dashboard'
        });
    }
});

// View specific classroom
router.get('/classroom/:id', authPage(['student']), async (req, res) => {
    try {
        // Find classroom and verify student is enrolled
        const classroom = await Classroom.findOne({
            _id: req.params.id,
            students: req.user._id,
            active: true
        }).populate('teacherId', 'name');

        if (!classroom) {
            return res.status(404).render('error', {
                message: 'Classroom not found'
            });
        }

        // Get assignments for this classroom
        const assignments = await Assignment.find({
            classroomId: classroom._id,
            active: true
        }).lean();

        // Get student's progress for these assignments
        const studentAssignments = await StudentAssignment.find({
            studentId: req.user._id,
            assignmentId: { $in: assignments.map(a => a._id) }
        });

        // Combine assignments with progress
        const assignmentsWithProgress = assignments.map(assignment => ({
            ...assignment,
            status: studentAssignments.find(sa => 
                sa.assignmentId.toString() === assignment._id.toString()
            )?.status || 'not_started'
        }));

        res.render('student/classroom', {
            title: classroom.name,
            classroom: classroom.toObject(),
            assignments: assignmentsWithProgress
        });
    } catch (error) {
        console.error('Error loading classroom:', error);
        res.status(500).render('error', {
            message: 'Error loading classroom'
        });
    }
});

// View/start assignment
// router.get('/assignment/:id', authPage(['student']), async (req, res) => {
//     try {
//         // Get assignment and verify student has access
//         const assignment = await Assignment.findById(req.params.id)
//             .populate('classroomId');

//         if (!assignment) {
//             return res.status(404).render('error', {
//                 message: 'Assignment not found'
//             });
//         }

//         // Get student's progress
//         const studentAssignment = await StudentAssignment.findOne({
//             studentId: req.user._id,
//             assignmentId: assignment._id
//         });

//         // Format assignment for display
//         const problemData = {
//             problem: `<strong>${assignment.title}</strong><br/><br/>${assignment.description}`,
//             type: 'Assignment',
//             level: 'Assignment Question',
//             topic: assignment.classroomId.name
//         };

//         res.render('problem', {
//             title: assignment.title,
//             problem: problemData,
//             assignmentContext: {
//                 assignmentId: assignment._id,
//                 classroomId: assignment.classroomId._id,
//                 status: studentAssignment?.status || 'not_started',
//                 totalQuestions: assignment.questions.length
//             },
//             isAssignmentQuestion: true
//         });
//     } catch (error) {
//         console.error('Error loading assignment:', error);
//         res.status(500).render('error', {
//             message: 'Error loading assignment'
//         });
//     }
// });

router.get('/assignment/:id', authPage(['student']), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        // Get student's progress for this assignment
        const studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId: assignment._id
        });

        // Format questions with progress
        const questionsWithProgress = assignment.questions.map((question, index) => {
            const submission = studentAssignment?.submissions?.find(s => 
                s.questionId.toString() === question._id.toString()
            );
            
            return {
                ...question.toObject(),
                number: index + 1,
                status: submission?.isComplete ? 'completed' : 
                        submission ? 'in_progress' : 'not_started'
            };
        });

        res.render('student/assignment', {
            title: assignment.title,
            assignment: {
                ...assignment.toObject(),
                questions: questionsWithProgress
            },
            classroom: assignment.classroomId,
            overallStatus: studentAssignment?.status || 'not_started',
            dueDate: assignment.dueDate
        });
    } catch (error) {
        console.error('Error loading assignment:', error);
        res.status(500).render('error', {
            message: 'Error loading assignment'
        });
    }
});

// View specific assignment question
router.get('/assignment/:assignmentId/question/:questionId', authPage(['student']), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.assignmentId)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        // Find the specific question
        const question = assignment.questions.find(q => 
            q._id.toString() === req.params.questionId
        );

        if (!question) {
            return res.status(404).render('error', {
                message: 'Question not found'
            });
        }

        // Get student's progress for this question
        const studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId: assignment._id
        });

        const submission = studentAssignment?.submissions?.find(s => 
            s.questionId.toString() === question._id.toString()
        );

        // Format question for the problem interface
        const problemData = {
            problem: question.question,
            solution: question.solution,
            type: question.type || 'math',
            level: 'Assignment Question',
            topic: assignment.classroomId.name
        };

        res.render('problem', {
            title: `${assignment.title} - Question ${assignment.questions.indexOf(question) + 1}`,
            problem: problemData,
            assignmentContext: {
                assignmentId: assignment._id,
                questionId: question._id,
                classroomId: assignment.classroomId._id,
                questionNumber: assignment.questions.indexOf(question) + 1,
                totalQuestions: assignment.questions.length,
                previousWork: submission?.work,
                isComplete: submission?.isComplete || false
            },
            isAssignmentQuestion: true
        });
    } catch (error) {
        console.error('Error loading assignment question:', error);
        res.status(500).render('error', {
            message: 'Error loading question'
        });
    }
});

// Join classroom route
router.post('/join-classroom', authPage(['student']), async (req, res) => {
    try {
        console.log('Request Body:', req.body); // Log the body to check for 'code'
        const { code } = req.body;
        const classroom = await Classroom.findOne({ 
            code: code.toUpperCase(),
            active: true 
        });

        if (!classroom) {
            return res.status(404).render('error', {
                message: 'Invalid classroom code'
            });
        }

        if (classroom.students.includes(req.user._id)) {
            return res.status(400).render('error', {
                message: 'Already enrolled in this classroom'
            });
        }

        await classroom.addStudent(req.user._id);
        
        // Create StudentAssignment records for existing assignments
        const assignments = await Assignment.find({
            classroomId: classroom._id,
            active: true
        });

        const studentAssignments = assignments.map(assignment => ({
            studentId: req.user._id,
            assignmentId: assignment._id,
            classroomId: classroom._id,
            status: 'not_started'
        }));

        if (studentAssignments.length > 0) {
            await StudentAssignment.insertMany(studentAssignments);
        }

        res.redirect('/student/dashboard');
    } catch (error) {
        console.error('Error joining classroom:', error);
        res.status(500).render('error', {
            message: 'Error joining classroom'
        });
    }
});

// Updated join classroom route
// router.post('/join-classroom', authPage(['student']), async (req, res) => {
//     try {
//         console.log('Join classroom request body:', req.body);  // Debug log
        
//         const { code } = req.body;
        
//         if (!code) {
//             console.log('No code provided in request');  // Debug log
//             return res.status(400).render('error', {
//                 message: 'Please provide a class code'
//             });
//         }

//         console.log('Looking for classroom with code:', code.toUpperCase());  // Debug log
        
//         const classroom = await Classroom.findOne({ 
//             code: code.toUpperCase(),
//             active: true 
//         });

//         if (!classroom) {
//             console.log('No classroom found with code:', code);  // Debug log
//             return res.status(404).render('error', {
//                 message: 'Invalid classroom code'
//             });
//         }

//         console.log('Found classroom:', classroom._id);  // Debug log

//         // Check if already enrolled
//         if (classroom.students.includes(req.user._id)) {
//             console.log('Student already enrolled');  // Debug log
//             return res.status(400).render('error', {
//                 message: 'You are already enrolled in this classroom'
//             });
//         }

//         // Add student to classroom
//         await classroom.addStudent(req.user._id);
//         console.log('Successfully added student to classroom');  // Debug log

//         res.redirect('/student/dashboard');
//     } catch (error) {
//         console.error('Error joining classroom:', error);
//         res.status(500).render('error', {
//             message: 'Error joining classroom'
//         });
//     }
// });


export default router;