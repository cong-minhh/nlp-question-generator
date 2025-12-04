const express = require('express');
const router = express.Router();

/**
 * Cache Management Routes
 */

/**
 * GET /cache/stats
 * Get cache statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const generator = req.app.locals.questionGenerator;
        
        if (!generator) {
            return res.status(500).json({
                success: false,
                error: 'Question generator not initialized'
            });
        }

        const stats = await generator.getCacheStats();
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Cache stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /cache
 * Clear all cache
 */
router.delete('/', async (req, res) => {
    try {
        const generator = req.app.locals.questionGenerator;
        
        if (!generator) {
            return res.status(500).json({
                success: false,
                error: 'Question generator not initialized'
            });
        }

        await generator.clearCache();
        
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        console.error('Cache clear error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
