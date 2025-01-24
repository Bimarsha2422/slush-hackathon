// src/routes/topics.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

async function getTopicProblems(topicName) {
    const topicPath = path.join(__dirname, '../../MATH/train', topicName);
    try {
        const files = await fs.readdir(topicPath);
        const problems = await Promise.all(
            files
                .filter(file => file.endsWith('.json'))
                .map(async (file) => {
                    const filePath = path.join(topicPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const problem = JSON.parse(content);
                    return {
                        ...problem,
                        id: path.basename(file, '.json')
                    };
                })
        );
        return problems;
    } catch (error) {
        console.error(`Error reading problems for topic ${topicName}:`, error);
        return [];
    }
}

router.get('/:topicName', async (req, res) => {
    const { topicName } = req.params;
    try {
        const problems = await getTopicProblems(topicName);
        res.render('topic', {
            title: topicName.replace(/_/g, ' ').split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
            topicName,
            problems
        });
    } catch (error) {
        res.status(500).render('error', {
            message: 'Error loading topic'
        });
    }
});

export default router;