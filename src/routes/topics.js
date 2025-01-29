// src/routes/topics.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const ITEMS_PER_PAGE = 10;

async function getTopicProblems(topicName, options = {}) {
    const { page = 1, level = 'all', sort = 'level' } = options;
    const topicPath = path.join(__dirname, '../../MATH/train', topicName);
    
    try {
        const files = await fs.readdir(topicPath);
        let allProblems = await Promise.all(
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

        // Extract numeric level for sorting for ALL problems
        allProblems = allProblems.map(p => ({
            ...p,
            numericLevel: parseInt(p.level.replace('Level ', '')) || 0
        }));

        // Get unique levels BEFORE filtering
        const uniqueLevels = [...new Set(allProblems.map(p => p.numericLevel))].sort((a, b) => a - b);

        // Filter by level if specified
        let problems = allProblems;
        if (level !== 'all') {
            problems = allProblems.filter(p => p.numericLevel === parseInt(level));
        }

        // Sort problems
        problems.sort((a, b) => {
            if (sort === 'level') {
                return a.numericLevel - b.numericLevel || parseInt(a.id) - parseInt(b.id);
            }
            return parseInt(a.id) - parseInt(b.id);
        });

        // Calculate pagination
        const totalItems = problems.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const paginatedProblems = problems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        // Calculate the starting problem number for the current page
        const startNumber = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        paginatedProblems.forEach((problem, index) => {
            problem.displayNumber = startNumber + index;
        });

        return {
            problems: paginatedProblems,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            },
            filters: {
                currentLevel: level,
                availableLevels: uniqueLevels,  // This now contains ALL levels
                currentSort: sort
            }
        };
    } catch (error) {
        console.error(`Error reading problems for topic ${topicName}:`, error);
        return {
            problems: [],
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalItems: 0,
                hasNextPage: false,
                hasPrevPage: false
            },
            filters: {
                currentLevel: level,
                availableLevels: [],
                currentSort: sort
            }
        };
    }
}

router.get('/:topicName', async (req, res) => {
    const { topicName } = req.params;
    const { page = 1, level = 'all', sort = 'level' } = req.query;

    try {
        const { problems, pagination, filters } = await getTopicProblems(topicName, {
            page: parseInt(page),
            level,
            sort
        });
        
        res.render('topic', {
            title: topicName.replace(/_/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
            topicName,
            problems,
            pagination,
            filters,
            currentUrl: `/topics/${topicName}`,
            query: req.query
        });
    } catch (error) {
        console.error('Error loading topic:', error);
        res.status(500).render('error', {
            message: 'Error loading topic'
        });
    }
});

export default router;