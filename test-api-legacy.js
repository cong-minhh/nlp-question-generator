const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000/api';

async function runTest() {
    try {
        console.log('--- Starting Legacy API Test (/generate-from-files) ---');

        // Look for PDF/PPTX
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.pptx') || f.endsWith('.pdf'));
        const targetFile = files.length > 0 ? path.join(__dirname, files[0]) : null;

        if (!targetFile) {
            console.log('No test file found.');
            return;
        }

        console.log(`Using file: ${targetFile}`);
        const formData = new FormData();
        formData.append('files', fs.createReadStream(targetFile));
        formData.append('numQuestions', 2);

        const res = await axios.post(`${BASE_URL}/generate-from-files`, formData, {
            headers: { ...formData.getHeaders() }
        });

        console.log('Response Status:', res.status);
        console.log('Response Data:', JSON.stringify(res.data, null, 2));
        
        if (!res.data.success) throw new Error('Legacy API failed');

        console.log('✓ Legacy API successful.');
        console.log(`✓ Generated ${res.data.data.questions?.length} questions.`);

    } catch (error) {
        console.error('\n❌ Legacy Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

runTest();
