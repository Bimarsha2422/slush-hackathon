// src/routes/api/classroom.js
import express from 'express';
import { auth, requireRole } from '../../middleware/auth.js';
import Classroom from '../../models/Classroom.js';
import Assignment from '../../models/Assignment.js';
import StudentAssignment from '../../models/StudentAssignment.js';

const router = express.Router();

// Create a new classroom (Teachers only)
router.post('/', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { name, description } = req.body;
        
        const classroom = new Classroom({
            name,
            description,
            teacherId: req.user._id
        });

        await classroom.save();
        
        res.status(201).json(classroom);
    } catch (error) {
        console.error('Error creating classroom:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get all classrooms for a teacher
router.get('/teaching', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const classrooms = await Classroom.find({ 
            teacherId: req.user._id,
            active: true 
        }).populate('students', 'name email');
        
        res.json(classrooms);
    } catch (error) {
        console.error('Error fetching classrooms:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all classrooms a student is enrolled in
router.get('/enrolled', auth, requireRole(['student']), async (req, res) => {
    try {
        const classrooms = await Classroom.find({
            students: req.user._id,
            active: true
        }).populate('teacherId', 'name');
        
        res.json(classrooms);
    } catch (error) {
        console.error('Error fetching enrolled classrooms:', error);
        res.status(500).json({ error: error.message });
    }
});

// Join a classroom using code
router.post('/join', auth, requireRole(['student']), async (req, res) => {
    try {
        const { code } = req.body;
        
        const classroom = await Classroom.findOne({ 
            code: code.toUpperCase(),
            active: true
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Invalid classroom code' });
        }
        
        if (classroom.students.includes(req.user._id)) {
            return res.status(400).json({ error: 'Already enrolled in this classroom' });
        }
        
        await classroom.addStudent(req.user._id);
        
        res.json({ message: 'Successfully joined classroom', classroom });
    } catch (error) {
        console.error('Error joining classroom:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get classroom details
router.get('/:id', auth, async (req, res) => {
    try {
        const classroom = await Classroom.findById(req.params.id)
            .populate('teacherId', 'name email')
            .populate('students', 'name email');
            
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        // Check if user has access to this classroom
        const isTeacher = classroom.teacherId._id.equals(req.user._id);
        const isStudent = classroom.students.some(s => s._id.equals(req.user._id));
        
        if (!isTeacher && !isStudent) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json(classroom);
    } catch (error) {
        console.error('Error fetching classroom:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update classroom details (Teacher only)
router.patch('/:id', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const classroom = await Classroom.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        const allowedUpdates = ['name', 'description', 'active'];
        const updates = Object.keys(req.body);
        
        updates.forEach(update => {
            if (allowedUpdates.includes(update)) {
                classroom[update] = req.body[update];
            }
        });
        
        await classroom.save();
        res.json(classroom);
    } catch (error) {
        console.error('Error updating classroom:', error);
        res.status(400).json({ error: error.message });
    }
});

// Remove student from classroom (Teacher only)
router.delete('/:id/students/:studentId', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const classroom = await Classroom.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        await classroom.removeStudent(req.params.studentId);
        res.json({ message: 'Student removed successfully' });
    } catch (error) {
        console.error('Error removing student:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate new join code (Teacher only)
router.post('/:id/new-code', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const classroom = await Classroom.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        
        const newCode = await classroom.generateNewCode();
        res.json({ code: newCode });
    } catch (error) {
        console.error('Error generating new code:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;