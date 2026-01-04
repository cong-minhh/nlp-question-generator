const ProviderRouter = require('../utils/providerRouter');
const CostTracker = require('../utils/costTracker');
const DifficultyBalancer = require('../utils/difficultyBalancer');

console.log('🧪 Starting AI Logic Tests...\n');

async function runTests() {
    // --- Cost Tracker Tests ---
    console.log('1. Testing CostTracker...');
    try {
        const tracker = new CostTracker();
        const cost = tracker.calculateCost('gemini', 'Hello world', 10);
        
        if (cost.totalCost > 0 && cost.provider === 'gemini') {
            console.log(`✅ Cost calculation success ($${cost.totalCost})`);
        } else {
            console.error('❌ Cost calculation failed');
        }
    } catch (e) {
        console.error('❌ CostTracker test failed:', e);
    }

    // --- Provider Router Tests ---
    console.log('\n2. Testing ProviderRouter...');
    try {
        const tracker = new CostTracker();
        const router = new ProviderRouter(tracker);

        // Mock healthy providers
        const providers = ['gemini', 'openai', 'anthropic'];

        // Test Cost Strategy
        router.setStrategy('cost');
        const pCost = router.selectProvider(providers, { text: "test", numQuestions: 10 });
        // Gemini is usually cheapest in default config
        console.log(`   Cost strategy selected: ${pCost}`);

        // Test Speed Strategy
        router.setStrategy('speed');
        const pSpeed = router.selectProvider(providers, { text: "test" });
        console.log(`   Speed strategy selected: ${pSpeed}`);

        if (pCost && pSpeed) {
            console.log('✅ Routing logic success');
        } else {
            console.error('❌ Routing logic failed');
        }

    } catch (e) {
        console.error('❌ ProviderRouter test failed:', e);
    }

    // --- Difficulty Balancer Tests ---
    console.log('\n3. Testing DifficultyBalancer...');
    try {
        const balancer = new DifficultyBalancer();
        
        // Mock unbalanced questions (mostly easy)
        const questions = [
            { difficulty: 'easy' }, { difficulty: 'easy' }, { difficulty: 'easy' },
            { difficulty: 'easy' }, { difficulty: 'medium' }
        ];

        const distribution = balancer.calculateDistribution(questions);
        const check = balancer.isBalanced(distribution);

        if (check.isBalanced === false && distribution.easy > 0.5) {
            console.log('✅ Imbalance detection success');
        } else {
            console.error('❌ Imbalance detection failed');
        }

        // Test remove excess
        const res = await balancer.balanceByRemoval(questions);
        if (res.balanced === true || res.questions.length < questions.length) {
            console.log('✅ Balancing by removal success');
        } else {
            console.error('❌ Balancing by removal failed');
        }

    } catch (e) {
        console.error('❌ DifficultyBalancer test failed:', e);
    }

    console.log('\n---------------------------------------------------');
}

runTests();
