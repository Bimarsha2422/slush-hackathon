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