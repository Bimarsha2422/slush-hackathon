// src/routes/student.js
import express from 'express';
import { auth, requireRole, authPage } from '../middleware/auth.js';
import Classroom from '../models/Classroom.js';
import Assignment from '../models/Assignment.js';
import StudentAssignment from '../models/StudentAssignment.js';
import User from '../models/User.js';
import { groqService } from '../services/groq.js';

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


router.get('/assignment/:assignmentId/question/:questionId', authPage(['student']), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.assignmentId)
            .populate('classroomId');

        if (!assignment) {
            return res.status(404).render('error', {
                message: 'Assignment not found'
            });
        }

        const question = assignment.questions.id(req.params.questionId);
        if (!question) {
            return res.status(404).render('error', {
                message: 'Question not found'
            });
        }

        // Get student's progress
        const studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId: assignment._id
        });

        // Find submission and feedback for this question
        const submission = studentAssignment?.submissions?.find(s => 
            s.questionId.toString() === question._id.toString()
        );

        // Format problem data
        const problemData = {
            problem: question.question,
            solution: question.solution,
            type: question.type || 'math',
            level: 'Assignment Question'
        };

        res.render('problem', {
            title: `${assignment.title} - Question ${assignment.questions.indexOf(question) + 1}`,
            problem: problemData,
            savedWork: submission?.work || '',
            workMode: submission?.mode || 'text',
            feedback: submission?.feedback || null, // Pass feedback to template
            assignmentContext: {
                assignmentId: assignment._id,
                questionId: question._id,
                classroomId: assignment.classroomId._id,
                questionNumber: assignment.questions.indexOf(question) + 1,
                totalQuestions: assignment.questions.length,
                status: submission?.isComplete ? 'completed' : (submission ? 'in_progress' : 'not_started')
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

router.post('/assignment/:assignmentId/question/:questionId/save', authPage(['student']), async (req, res) => {
    try {
        const { assignmentId, questionId } = req.params;
        const { work, mode } = req.body;

        // Input validation
        if (!work && mode !== 'canvas') {
            return res.status(400).json({ error: 'No work provided' });
        }

        let studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId
        });

        if (!studentAssignment) {
            return res.status(404).json({ error: 'Assignment progress not found' });
        }

        // Find or initialize submission
        let submission = studentAssignment.submissions.find(s => 
            s.questionId.toString() === questionId
        );

        if (submission) {
            // Update existing submission
            submission.work = work;
            submission.mode = mode;
            submission.lastUpdated = new Date();
            if (submission.status === 'not_started') {
                submission.status = 'in_progress';
            }
        } else {
            // Create new submission
            studentAssignment.submissions.push({
                questionId,
                work,
                mode,
                status: 'in_progress',
                lastUpdated: new Date()
            });
        }

        // Update overall assignment status
        if (studentAssignment.status === 'not_started') {
            studentAssignment.status = 'in_progress';
        }

        await studentAssignment.save();

        res.json({ 
            status: 'success',
            message: 'Progress saved successfully'
        });
    } catch (error) {
        console.error('Error saving progress:', error);
        res.status(500).json({ 
            error: 'Failed to save progress',
            details: error.message 
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


router.post('/assignment/:assignmentId/question/:questionId/complete', authPage(['student']), async (req, res) => {
    try {
        const { assignmentId, questionId } = req.params;
        const { work, mode } = req.body;

        // Find student's assignment
        let studentAssignment = await StudentAssignment.findOne({
            studentId: req.user._id,
            assignmentId
        });

        if (!studentAssignment) {
            return res.status(404).json({ error: 'Assignment progress not found' });
        }

        // Get the submission including hints
        const submission = studentAssignment.submissions.find(s => 
            s.questionId.toString() === questionId
        );

        if (!submission) {
            return res.status(404).json({ error: 'No work found for this question' });
        }

        // Use groqService to analyze work
        const aiAnalysis = await groqService.analyzeStudentWork(
            work,
            submission.hints || [],
            mode
        );

        // Use markQuestionComplete method from StudentAssignment model
        await studentAssignment.markQuestionComplete(questionId, {
            strengths: aiAnalysis.strengths,
            improvements: aiAnalysis.improvements,
            aiAnalysis: aiAnalysis.analysis,
            hintsUsed: submission.hints.length,
            submissionTime: new Date()
        });

        const updatedAssignment = await StudentAssignment.findById(studentAssignment._id);
        const isComplete = updatedAssignment.status === 'completed';

        res.json({ 
            status: 'success',
            feedback: aiAnalysis,
            isAssignmentComplete: isComplete
        });

    } catch (error) {
        console.error('Error completing question:', error);
        res.status(500).json({ 
            error: 'Failed to complete question',
            details: error.message 
        });
    }
});


function extractPoints(feedback, type) {
    // Simple extraction - can be made more sophisticated
    const points = feedback.toLowerCase().includes(type) 
        ? feedback.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^[•\-\d.]+\s*/, '').trim())
            .filter(line => line.length > 0)
        : [];
    return points.slice(0, 3); // Return top 3 points
}

// AI Analysis Helper Function
async function generateAIAnalysis(work, hints) {
    try {
        const analysis = await client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analyze this student's work and provide feedback. Consider:
                        1. What they did well (strengths)
                        2. Areas for improvement
                        3. How they used hints (${hints.length} hints used)
                        Format your response as specific, actionable points.`
                },
                {
                    role: "user",
                    content: `Student's work: ${work}\n\nHints used: ${hints.map(h => h.content).join('\n')}`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3
        });

        const feedback = analysis.choices[0].message.content;
        
        // Parse the feedback into structured format
        const strengths = extractPoints(feedback, 'strengths');
        const improvements = extractPoints(feedback, 'improvements');

        return {
            strengths,
            improvements,
            feedback
        };
    } catch (error) {
        console.error('Error generating AI analysis:', error);
        return {
            strengths: [],
            improvements: [],
            feedback: 'Unable to generate detailed feedback at this time.'
        };
    }
}

export default router;