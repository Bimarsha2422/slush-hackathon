// src/routes/api/assignments.js
import express from 'express';
import { auth, requireRole } from '../../middleware/auth.js';
import Classroom from '../../models/Classroom.js';
import Assignment from '../../models/Assignment.js';
import StudentAssignment from '../../models/StudentAssignment.js';

const router = express.Router();

// Rest of the code remains the same...
// Create a new assignment (Teacher only)
// In src/routes/api/assignments.js

router.post('/', auth, requireRole(['teacher']), async (req, res) => {
    try {
        const { classroomId, title, description, dueDate, questions } = req.body;
        
        console.log('Creating assignment with data:', {
            classroomId,
            title,
            description,
            dueDate,
            questionCount: questions?.length || 0
        });
        
        // Verify teacher owns this classroom
        const classroom = await Classroom.findOne({
            _id: classroomId,
            teacherId: req.user._id
        });
        
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }

        // Make sure we have at least one question
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Assignment must have at least one question' });
        }

        // Prepare questions with proper structure
        const formattedQuestions = questions.map(q => ({
            question: q.question,
            solution: q.solution || '',
            type: q.type || 'math'
        }));
        
        const assignment = new Assignment({
            classroomId,
            title,
            description,
            dueDate: dueDate || null,
            questions: formattedQuestions,
            active: true
        });
        
        await assignment.save();
        
        // Create StudentAssignment records for all students
        const studentAssignments = classroom.students.map(studentId => ({
            studentId,
            assignmentId: assignment._id,
            classroomId,
            status: 'not_started',
            submissions: []
        }));
        
        await StudentAssignment.insertMany(studentAssignments);
        
        console.log('Created assignment:', {
            id: assignment._id,
            questionCount: assignment.questions.length
        });
        
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