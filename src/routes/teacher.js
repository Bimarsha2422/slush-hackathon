// src/routes/teacher.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';

const router = express.Router();

// Teacher dashboard - now using authPage middleware
router.get('/dashboard', authPage(['teacher']), async (req, res) => {
    try {
        // Get classroom statistics
        const classrooms = await Classroom.find({ 
            teacherId: req.user._id,
            active: true
        });

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
            message: `New assignment "${assignment.title}" created in ${assignment.classroomId.name}`,
            timestamp: assignment.createdAt
        }));

        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            stats: {
                classroomCount: classrooms.length,
                studentCount: totalStudents,
                assignmentCount: assignments.length
            },
            classrooms,
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

export default router;