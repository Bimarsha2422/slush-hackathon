// src/routes/topics.js
import express from 'express';
import Problem from '../../models/Problem.js';

const router = express.Router();

router.get('/:topicName', async (req, res) => {
    const { topicName } = req.params;
    const { level = 'all', page = 1, sort = 'level' } = req.query;
    const limit = 10; // Problems per page

    try {
        // Get available levels for this topic
        const levels = await Problem.distinct('level', { topic: topicName });
        const numericLevels = levels.map(l => parseInt(l)).sort((a, b) => a - b);

        // Build query
        const query = { topic: topicName };
        if (level !== 'all') {
            query.level = parseInt(level);
        }

        // Get total count for pagination
        const totalItems = await Problem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / limit);
        const currentPage = parseInt(page);

        // Set up sort (default to originalId)
        const sortQuery = {};
        if (sort === 'level') {
            sortQuery.level = 1;
            sortQuery.originalId = 1;  // Secondary sort by problem number
        } else {
            // Default sort by problem number
            sortQuery.originalId = 1;
        }
        
        // Convert originalId to number for proper numeric sorting
        const problems = await Problem.aggregate([
            { $match: query },
            { 
                $addFields: {
                    numericId: { $toInt: "$originalId" }  // Convert string ID to number
                }
            },
            { 
                $sort: sort === 'level' 
                    ? { level: 1, numericId: 1 }
                    : { numericId: 1 }
            },
            { $skip: (currentPage - 1) * limit },
            { $limit: limit }
        ]);

        // Map problems to match your template's expectations
        const mappedProblems = problems.map(p => ({
            ...p,
            id: p.originalId,
            displayNumber: p.originalId,
            numericLevel: parseInt(p.level),
            type: p.type || 'Practice'
        }));

        // Prepare pagination data
        const pagination = {
            currentPage,
            totalPages,
            totalItems,
            hasPrevPage: currentPage > 1,
            hasNextPage: currentPage < totalPages
        };

        // Prepare filter data
        const filters = {
            availableLevels: numericLevels,
            currentLevel: level,
            currentSort: sort
        };

        res.render('topic', {
            title: topicName.replace(/_/g, ' ').split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
            topicName,
            problems: mappedProblems,
            pagination,
            filters,
            currentUrl: req.originalUrl.split('?')[0]  // Base URL without query params
        });
    } catch (error) {
        console.error('Error loading topic:', error);
        res.status(500).render('error', {
            message: 'Error loading topic'
        });
    }
});

export default router;