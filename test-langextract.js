require('dotenv').config();
const structuredExtractor = require('./services/structuredExtractor');
const path = require('path');

async function test() {
    console.log('Testing Structured Separator (LangExtract Bridge)...');
    
    // Use this script file itself as a dummy input or create a small one
    const testFile = path.resolve(__dirname, 'README.md'); 
    // If README doesn't exist, we'll try a generic known file or creating one.
    // Let's create a temp file just in case.
    
    const fs = require('fs');
    const tempFile = 'temp_test_extraction.txt';
    fs.writeFileSync(tempFile, 'The quick brown fox jumps over the lazy dog. The fox is named foxy. The dog is named doggo.');
    
    try {
        console.log(`Extracting from ${tempFile}...`);
        const result = await structuredExtractor.extract(
            path.resolve(tempFile),
            'Extract animal names and their actions.'
        );
        
        console.log('Extraction Result:');
        console.log(JSON.stringify(result, null, 2));
        
    } catch (error) {
        console.error('Test Failed:', error);
    } finally {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}

test();
