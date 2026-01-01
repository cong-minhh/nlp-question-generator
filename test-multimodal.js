const fs = require('fs');
const path = require('path');
const { MultiProviderQuestionGenerator } = require('./services/questionGenerator');
const ProviderManager = require('./providers/providerManager');

/**
 * Test script to verify that:
 * 1. textExtractor can digest image files (Base64)
 * 2. questionGenerator creates a multimodal payload ({ text, images })
 * 3. This payload is passed correctly to the provider
 */
async function runTest() {
    console.log('\n🔵 Starting Multimodal Integration Test...\n');

    // --- SETUP: Create Dummy Image ---
    const imagePath = path.join(__dirname, 'test_image.png');
    // 1x1 Transparent PNG
    const dummyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(imagePath, Buffer.from(dummyImageBase64, 'base64'));
    console.log(`✓ Created dummy image: ${imagePath}`);

    try {
        // --- STEP 1: Initialize Provider Manager with MOCK Provider ---
        // We do this to avoid needing real API keys or making costs
        const providerManager = new ProviderManager();
        
        // Mock the 'gemini' provider to intercept the call
        providerManager.providers.set('gemini', {
            name: 'gemini',
            description: 'Mock Gemini',
            isConfigured: () => true,
            generateQuestions: async (payload, options) => {
                console.log('\n🟢 [Mock Provider] generateQuestions called!');
                
                // VERIFICATION LOGIC
                if (typeof payload === 'object' && payload.images) {
                    console.log('  ✓ Payload is an object (Multimodal)');
                    console.log(`  ✓ Image Count: ${payload.images.length}`);
                    
                    const img = payload.images[0];
                    console.log(`  ✓ Image[0] Type: ${img.mediaType}`);
                    console.log(`  ✓ Image[0] Data Length: ${img.data.length} chars`);
                    
                    if (img.mediaType === 'image/png' && img.data.length > 0) {
                         console.log('  ✓ Image data appears valid');
                         return { 
                             questions: [{ questiontext: "Test Question?", correctanswer: "A" }],
                             metadata: { test_passed: true }
                         };
                    }
                } else {
                    console.error('  ❌ Payload is NOT multimodal object:', payload);
                    throw new Error('Payload format mismatch');
                }
                
                return { questions: [] };
            }
        });
        
        // Force current provider to our mock
        providerManager.currentProvider = 'gemini';
        providerManager.initialized = true;

        // --- STEP 2: Initialize Question Generator ---
        const generator = new MultiProviderQuestionGenerator(providerManager);
        // Skip standard init to allow our injected provider to stay
        generator.initialized = true; 
        // Manually injecting the provider manager because the constructor might create a new one if not passed strictly
        generator.providerManager = providerManager;

        // --- STEP 3: Run generateFromFiles ---
        console.log('\n🔵 Calling generateFromFiles with image...');
        const result = await generator.generateFromFiles([imagePath], { numQuestions: 1 });

        // --- STEP 4: Validations ---
        if (result && result.metadata && result.metadata.test_passed) {
            console.log('\n✅ TEST PASSED: Image was extracted and passed to provider successfully.');
        } else {
            console.error('\n❌ TEST FAILED: Provider did not receive expected payload.');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ TEST ERROR:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('\n✓ Cleaned up test image');
        }
    }
}

runTest();
