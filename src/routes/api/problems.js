// src/routes/api/problems.js - Handles API endpoints for problems
import express from 'express';
import Problem from '../../models/Problem.js';

const router = express.Router();

// Get all problems with pagination and filters
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, topic, level } = req.query;
        const query = {};
        
        if (topic) query.topic = topic;
        if (level) query.level = parseInt(level);

        const problems = await Problem.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ level: 1, originalId: 1 });

        const total = await Problem.countDocuments(query);

        res.json({
            problems,
            total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching problems:', error);
        res.status(500).json({ error: 'Error fetching problems' });
    }
});

// Get problems for a specific topic
router.get('/topic/:topicName', async (req, res) => {
    try {
        const { level } = req.query;
        const query = { topic: req.params.topicName };
        
        if (level) query.level = parseInt(level);

        const problems = await Problem.find(query)
            .sort({ level: 1, originalId: 1 });

        res.json(problems);
    } catch (error) {
        console.error('Error fetching problems for topic:', error);
        res.status(500).json({ error: 'Failed to fetch problems' });
    }
});

// Get a specific problem
router.get('/:problemId', async (req, res) => {
    try {
        const problem = await Problem.findOne({
            problemId: req.params.problemId
        });

        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        res.json(problem);
    } catch (error) {
        console.error('Error fetching problem:', error);
        res.status(500).json({ error: 'Failed to fetch problem' });
    }
});

export default router;