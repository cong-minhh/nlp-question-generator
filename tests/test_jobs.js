const JobQueue = require('../utils/jobQueue');
const ParallelProcessor = require('../utils/parallelProcessor');

console.log('🧪 Starting Job & Processing Tests...\n');

async function runTests() {
    // --- Job Queue Tests ---
    console.log('1. Testing JobQueue...');
    try {
        const queue = new JobQueue({ 
            maxConcurrent: 1,
            // Mock store to avoid DB requirement for test
            jobStore: null 
        });

        // Mock processor
        let processedCount = 0;
        queue.setProcessor(async (data, updateProgress) => {
            await new Promise(r => setTimeout(r, 50)); // Sim delay
            processedCount++;
            return { processed: true, input: data };
        });

        // Create job
        const id1 = await queue.createJob({ val: 1 });
        const id2 = await queue.createJob({ val: 2 });

        console.log('   Jobs created. Waiting for processing...');
        
        // Wait for processing
        await new Promise(r => setTimeout(r, 500));

        const job1 = await queue.getJob(id1);
        
        if (processedCount === 2 && job1.status === 'completed') {
            console.log('✅ Job queue processing success');
        } else {
            console.error(`❌ Job queue failed: count=${processedCount}, status=${job1?.status}`);
        }

    } catch (e) {
        console.error('❌ JobQueue test failed:', e);
    }

    // --- Parallel Processor Tests ---
    console.log('\n2. Testing ParallelProcessor...');
    try {
        const processor = new ParallelProcessor({ chunkSize: 2, maxWorkers: 2, threshold: 3 });

        // Mock generator
        const mockGenerate = async (text, options) => {
            const count = options.numQuestions;
            // Return dummy questions
            return {
                questions: Array(count).fill(0).map((_, i) => ({ q: `Q${i}` })),
                metadata: { provider: 'test' }
            };
        };

        const totalReq = 5;
        // Threshold is 3, so 5 should trigger parallel
        const result = await processor.generateParallel("test text", totalReq, mockGenerate);

        if (result.parallel === true && result.questions.length === 5) {
            console.log('✅ Parallel generation success');
            console.log(`   Chunks used: ${result.metadata.chunks}`);
        } else {
            console.error('❌ Parallel generation failed', result);
        }

    } catch (e) {
        console.error('❌ ParallelProcessor test failed:', e);
    }
    
    console.log('\n---------------------------------------------------');
}

runTests();
