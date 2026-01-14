const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000/api';
const TEST_FILE_PATH = path.join(__dirname, 'test-doc.txt');

// Create a dummy file for testing if real ones aren't available
if (!fs.existsSync(TEST_FILE_PATH)) {
    fs.writeFileSync(TEST_FILE_PATH, '--- Page 1 ---\nThis is a test document about Artificial Intelligence.\n\n--- Page 2 ---\nAI can process images and text.');
}

async function runTest() {
    try {
        console.log('--- Starting Moodle Integration Test ---');

        // 1. INSPECT
        console.log('\n[1] Testing /documents/inspect...');
        const formData = new FormData();
        // Use a real file if possible, else dummy
        // Assuming we have a PPTX from earlier debug sessions, let's look for one.
        // If not, fall back to text, but text processor might not have "pages".
        // Let's create a dummy docx or just use the txt and expect basic "page 1".
        // Actually, the txt processor likely returns one blob. The new processors are ONLY for pdf/docx/pptx.
        // The old `textExtractor` works for others. 
        // My `documentRoutes` ONLY handles pdf/docx/pptx:
        // `switch (ext.toLowerCase()) { case '.pdf': ... }`
        // So I MUST use a supported file.
        
        // I'll search for a .pptx or .pdf file in the dir to use.
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.pptx') || f.endsWith('.pdf'));
        const targetFile = files.length > 0 ? path.join(__dirname, files[0]) : null;

        if (!targetFile) {
            console.error('No PPTX/DOCX/PDF found for testing. Please place one in root.');
            // Skip test
            return;
        }

        console.log(`Using file: ${targetFile}`);
        formData.append('file', fs.createReadStream(targetFile));

        const inspectRes = await axios.post(`${BASE_URL}/documents/inspect`, formData, {
            headers: { ...formData.getHeaders() }
        });

        if (!inspectRes.data.success) throw new Error('Inspect failed');
        
        const docId = inspectRes.data.docId;
        const pages = inspectRes.data.pages;
        console.log(`✓ Inspect successful. DocID: ${docId}`);
        console.log(`✓ Found ${pages.length} pages/slides.`);

        if (pages.length === 0) {
            console.warn('Warning: No pages found. Cannot test filtering effectively.');
        }

        // 2. GENERATE (Filter Scope)
        console.log('\n[2] Testing /documents/generate (with filter)...');
        
        // Filter: First slide only
        const targetPage = pages[0]?.page || 1;
        
        const generateRes = await axios.post(`${BASE_URL}/documents/generate`, {
            docId: docId,
            options: {
                numQuestions: 2,
                includeSlides: [targetPage], // Only first slide
                difficulty: 'easy'
            }
        });

        if (!generateRes.data.success) throw new Error('Generate failed');

        console.log('✓ Generation successful.');
        console.log(`✓ Generated ${generateRes.data.questions?.length} questions.`);
        console.log('Questions:', JSON.stringify(generateRes.data.questions, null, 2));

        console.log('\n--- Test Passed ---');

    } catch (error) {
        console.error('\n❌ Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

runTest();
