// src/routes/problems.js - Handles UI routes for individual problems
import express from 'express';
import Problem from '../models/Problem.js';

const router = express.Router();

router.get('/:topicName/:problemId', async (req, res) => {
    const { topicName, problemId } = req.params;
    console.log('Route params:', { topicName, problemId });
    
    try {
        const problem = await Problem.findOne({ 
            topic: topicName,
            originalId: problemId
        });
        
        console.log('Problem data:', problem);
        
        if (!problem) {
            return res.status(404).render('error', {
                message: 'Problem not found'
            });
        }
        
        res.render('problem', {
            title: `${topicName} - Problem ${problemId}`,
            problem: problem.toObject(),  // Convert to plain object for template
            topicName,
            problemId
        });
    } catch (error) {
        console.error('Error loading problem:', error);
        res.status(500).render('error', {
            message: 'Error loading problem'
        });
    }
});

export default router;