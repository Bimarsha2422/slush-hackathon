// src/routes/problems.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Groq from 'groq-sdk';
import { isAuthenticated } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Add authentication middleware
router.use(isAuthenticated);

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function getProblem(topicName, problemId) {
    try {
        const filePath = path.join(__dirname, `../../MATH/train/${topicName}/${problemId}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading problem:', error);
        return null;
    }
}

router.get('/:topicName/:problemId', async (req, res) => {
    const { topicName, problemId } = req.params;
    console.log('Route params:', { topicName, problemId });
    
    try {
        const problem = await getProblem(topicName, problemId);
        console.log('Problem data:', problem);
        
        if (!problem) {
            return res.status(404).render('error', {
                message: 'Problem not found'
            });
        }
        
        res.render('problem', {
            title: `${topicName} - Problem ${problemId}`,
            problem,
            topicName,
            problemId,
            user: req.user // Add user data for the template
        });
    } catch (error) {
        console.error('Error loading problem:', error);
        res.status(500).render('error', {
            message: 'Error loading problem'
        });
    }
});

export default router;