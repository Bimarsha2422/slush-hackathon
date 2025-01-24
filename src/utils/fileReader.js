// src/utils/fileReader.js
const fs = require('fs').promises;
const path = require('path');

// src/utils/fileReader.js
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
                    return {
                        ...JSON.parse(content),
                        id: path.basename(file, '.json')
                    };
                })
        );

        // Group by level
        const problemsByLevel = {};
        problems.forEach(problem => {
            const level = problem.level.replace('Level ', '');
            if (!problemsByLevel[level]) {
                problemsByLevel[level] = [];
            }
            problemsByLevel[level].push({
                ...problem,
                id: problem.id
            });
        });

        return problemsByLevel;
    } catch (error) {
        console.error(`Error reading problems for topic ${topicName}:`, error);
        return {};
    }
}

module.exports = {
    getTopicProblems
};