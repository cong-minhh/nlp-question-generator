const ContentFilter = require('../utils/ContentFilter');
const TextSimilarity = require('../utils/textSimilarity');

console.log('🧪 Starting Content Utility Tests...\n');

// --- Content Filter Tests ---
console.log('1. Testing ContentFilter...');
try {
    const mockData = {
        pages: [
            { page: 1, text: "Page 1 Content", images: [{ source: "img1" }] },
            { page: 2, text: "Page 2 Content", images: [{ source: "img2" }] },
            { page: 3, text: "Page 3 Content", images: [{ source: "img3" }] }
        ]
    };

    // Case 1: Filter by slides
    const res1 = ContentFilter.apply(mockData, { includeSlides: [1, 3] });
    if (res1.text.includes("Page 1") && res1.text.includes("Page 3") && !res1.text.includes("Page 2")) {
        console.log('✅ Slide filtering success');
    } else {
        console.error('❌ Slide filtering failed');
    }

    // Case 2: Filter by images
    const res2 = ContentFilter.apply(mockData, { includeImages: ['img2'] });
    if (res2.images.length === 1 && res2.images[0].source === 'img2') {
        console.log('✅ Image filtering success');
    } else {
        console.error('❌ Image filtering failed');
    }

} catch (e) {
    console.error('❌ ContentFilter test failed:', e);
}

// --- Text Similarity Tests ---
console.log('\n2. Testing TextSimilarity...');
try {
    const t1 = "The quick brown fox jumps over the dog";
    const t2 = "The quick brown fox jumps over the lazy dog";
    const t3 = "Completely different text content here";

    // High similarity
    const scoreHigh = TextSimilarity.combinedSimilarity(t1, t2);
    if (scoreHigh > 80) {
        console.log(`✅ High similarity detection success (${scoreHigh.toFixed(2)}%)`);
    } else {
        console.error(`❌ High similarity detection failed (${scoreHigh.toFixed(2)}%)`);
    }

    // Low similarity
    const scoreLow = TextSimilarity.combinedSimilarity(t1, t3);
    if (scoreLow < 30) {
        console.log(`✅ Low similarity detection success (${scoreLow.toFixed(2)}%)`);
    } else {
        console.error(`❌ Low similarity detection failed (${scoreLow.toFixed(2)}%)`);
    }

} catch (e) {
    console.error('❌ TextSimilarity test failed:', e);
}

console.log('\n---------------------------------------------------');
