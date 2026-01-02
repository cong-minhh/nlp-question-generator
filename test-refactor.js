const { processPdf } = require('./utils/processors/PdfProcessor');
const { processDocx } = require('./utils/processors/DocxProcessor');
const { processPptx } = require('./utils/processors/PptxProcessor');
const { processFiles } = require('./services/textExtractor');

console.log('Testing module imports...');

if (typeof processPdf !== 'function') throw new Error('processPdf is not a function');
console.log('✓ PdfProcessor loaded correctly');

if (typeof processDocx !== 'function') throw new Error('processDocx is not a function');
console.log('✓ DocxProcessor loaded correctly');

if (typeof processPptx !== 'function') throw new Error('processPptx is not a function');
console.log('✓ PptxProcessor loaded correctly');

if (typeof processFiles !== 'function') throw new Error('processFiles is not a function');
console.log('✓ services/textExtractor loaded correctly');

console.log('All modules loaded successfully. Refactor syntax check passed.');
