// src/routes/student.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
    res.send('Student routes working!');
});

// Student dashboard
router.get('/dashboard', authPage(['student']), async (req, res) => {
    console.log('Accessing student dashboard...');
    try {
        console.log('User:', req.user?._id);
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
            pendingAssignments: studentAssignments.filter(sa => sa.status !== 'completed').length
        };

        // Get recent activity
        const recentAssignments = assignments
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5)
            .map(assignment => ({
                type: 'assignment',
                message: `New assignment "${assignment.title}" in ${assignment.classroomId.name}`,
                timestamp: assignment.createdAt
            }));

        // Prepare classroom data
        const classroomsData = classrooms.map(c => ({
            _id: c._id,
            name: c.name,
            teacherName: c.teacherId.name,
            assignmentCount: assignments.filter(a => 
                a.classroomId._id.toString() === c._id.toString()
            ).length
        }));

        // Render the dashboard
        res.render('student/dashboard', {
            title: 'Student Dashboard',
            stats,
            classrooms: classroomsData,
            recentActivity: recentAssignments
        });
    } catch (error) {
        console.error('Error loading student dashboard:', error);
        res.status(500).render('error', {
            message: 'Error loading dashboard'
        });
    }
});

// Join classroom route
router.post('/join-classroom', authPage(['student']), async (req, res) => {
    try {
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
        res.redirect('/student/dashboard');
    } catch (error) {
        console.error('Error joining classroom:', error);
        res.status(500).render('error', {
            message: 'Error joining classroom'
        });
    }
});

// Add this to src/routes/student.js

// View specific classroom
// In src/routes/student.js

// Route to get classroom data with assignments
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

        // Get assignments with populated questions
        const assignments = await Assignment.find({
            classroomId: classroom._id,
            active: true
        }).lean(); // Using lean() for better performance

        console.log('Assignments found:', assignments.map(a => ({
            id: a._id,
            title: a.title,
            questionCount: a.questions?.length || 0
        })));

        // Get student's progress
        const studentAssignments = await StudentAssignment.find({
            studentId: req.user._id,
            assignmentId: { $in: assignments.map(a => a._id) }
        });

        // Combine assignment data with progress
        const assignmentsWithProgress = assignments.map(assignment => {
            const progress = studentAssignments.find(sa => 
                sa.assignmentId.toString() === assignment._id.toString()
            );
            return {
                ...assignment,
                status: progress?.status || 'not_started'
            };
        });

        console.log('Assignments with progress:', assignmentsWithProgress.map(a => ({
            id: a._id,
            title: a.title,
            questionCount: a.questions?.length || 0,
            status: a.status
        })));

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

// In src/routes/student.js - Update the assignment question route
router.get('/assignment/:assignmentId/question/:questionId', authPage(['student']), async (req, res) => {
    try {
        console.log('Assignment route params:', req.params);  // Debug log
        
        // Get assignment and verify student has access
        const assignment = await Assignment.findById(req.params.assignmentId)
            .populate('classroomId');

        if (!assignment) {
            console.log('Assignment not found:', req.params.assignmentId);  // Debug log
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        // Find the specific question
        const question = assignment.questions.find(q => 
            q._id.toString() === req.params.questionId
        );

        if (!question) {
            console.log('Question not found:', req.params.questionId);  // Debug log
            return res.status(404).render('error', {
                message: 'Question not found'
            });
        }

        // Format the question data to match the problem-solving interface
        const problemData = {
            problem: question.question,
            solution: question.solution,
            type: question.type || 'math',
            topic: assignment.classroomId.name,
            level: 'Assignment'
        };

        console.log('Rendering problem with data:', {  // Debug log
            assignmentId: assignment._id,
            questionId: question._id,
            problemData: problemData
        });

        // Render the problem view
        res.render('problem', {
            title: `${assignment.title} - Question ${assignment.questions.indexOf(question) + 1}`,
            problem: problemData,
            assignmentContext: {
                assignmentId: assignment._id,
                questionId: question._id,
                classroomId: assignment.classroomId._id
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

// In src/routes/student.js

// Handle single assignment view/start
router.get('/assignment/:id', authPage(['student']), async (req, res) => {
    try {
        // Get assignment and verify student has access
        const assignment = await Assignment.findById(req.params.id)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        // Get student's progress
        const studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId: assignment._id
        });

        // Format assignment as a problem
        const problemData = {
            problem: `<strong>${assignment.title}</strong><br/><br/>${assignment.description}`,
            type: 'Assignment',
            level: assignment.classroomId.name,
            topic: 'Class Assignment'
        };

        // Render using the same problem view
        res.render('problem', {
            title: assignment.title,
            problem: problemData,
            assignmentContext: {
                assignmentId: assignment._id,
                classroomId: assignment.classroomId._id,
                status: studentAssignment?.status || 'not_started'
            },
            isAssignmentQuestion: true
        });

    } catch (error) {
        console.error('Error loading assignment:', error);
        res.status(500).render('error', {
            message: 'Error loading assignment'
        });
    }
});
export default router;