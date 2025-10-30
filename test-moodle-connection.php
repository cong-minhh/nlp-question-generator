<?php
/**
 * Standalone test script to debug Moodle NLP service connection
 * 
 * Run this script directly from command line or browser to test the connection
 * Usage: php test-moodle-connection.php
 */

// Configuration
$nlpendpoint = 'http://localhost:3000/generate';
$testtext = 'Photosynthesis is the process by which plants use sunlight, water and carbon dioxide to create oxygen and energy.';
$numquestions = 2;

echo "=== Testing NLP Service Connection ===\n\n";

// Test 1: Check if curl extension is available
echo "1. Checking PHP curl extension...\n";
if (!function_exists('curl_init')) {
    die("ERROR: PHP curl extension is not installed!\n");
}
echo "   ✓ curl extension is available\n\n";

// Test 2: Try to connect to the service
echo "2. Testing connection to: $nlpendpoint\n";

$data = array(
    'text' => $testtext,
    'num_questions' => $numquestions
);

$ch = curl_init($nlpendpoint);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'Content-Type: application/json'
));
curl_setopt($ch, CURLOPT_TIMEOUT, 60);

// Execute request
$response = curl_exec($ch);
$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
$errno = curl_errno($ch);
curl_close($ch);

// Display results
echo "   HTTP Status Code: $httpcode\n";
echo "   CURL Error Number: $errno\n";
echo "   CURL Error Message: " . ($error ? $error : "None") . "\n\n";

if ($errno) {
    die("ERROR: CURL request failed!\n");
}

echo "3. Raw Response:\n";
echo "----------------------------------------\n";
echo $response;
echo "\n----------------------------------------\n\n";

// Test 3: Try to parse JSON
echo "4. Parsing JSON response...\n";
$result = json_decode($response, true);

if (!$result) {
    echo "   ✗ JSON decode failed!\n";
    echo "   JSON Error: " . json_last_error_msg() . "\n";
    echo "   This usually means the response is not valid JSON.\n\n";
    die("ERROR: Invalid JSON response!\n");
}
echo "   ✓ JSON parsed successfully\n\n";

// Test 4: Validate structure
echo "5. Validating response structure...\n";
if (!isset($result['questions'])) {
    echo "   ✗ Missing 'questions' key in response\n";
    echo "   Available keys: " . implode(', ', array_keys($result)) . "\n\n";
    die("ERROR: Invalid response structure!\n");
}
echo "   ✓ 'questions' key found\n";

if (!is_array($result['questions'])) {
    echo "   ✗ 'questions' is not an array\n\n";
    die("ERROR: Invalid questions format!\n");
}
echo "   ✓ 'questions' is an array\n";

$questionCount = count($result['questions']);
echo "   ✓ Found $questionCount questions\n\n";

// Test 5: Validate question format
echo "6. Validating question format...\n";
$requiredFields = array('questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer', 'difficulty');

foreach ($result['questions'] as $index => $question) {
    $qnum = $index + 1;
    echo "   Question $qnum:\n";
    
    foreach ($requiredFields as $field) {
        if (!isset($question[$field])) {
            echo "      ✗ Missing field: $field\n";
            die("ERROR: Question $qnum is missing required field!\n");
        }
        echo "      ✓ $field: " . substr($question[$field], 0, 50) . (strlen($question[$field]) > 50 ? '...' : '') . "\n";
    }
    echo "\n";
}

// Test 6: Display formatted output
echo "7. Full Response (formatted):\n";
echo "========================================\n";
foreach ($result['questions'] as $index => $q) {
    $qnum = $index + 1;
    echo "\nQuestion $qnum [{$q['difficulty']}]:\n";
    echo $q['questiontext'] . "\n";
    echo "  A) {$q['optiona']}\n";
    echo "  B) {$q['optionb']}\n";
    echo "  C) {$q['optionc']}\n";
    echo "  D) {$q['optiond']}\n";
    echo "  Correct: {$q['correctanswer']}\n";
}
echo "\n========================================\n\n";

echo "✓✓✓ ALL TESTS PASSED! ✓✓✓\n";
echo "The NLP service is working correctly.\n";
echo "If Moodle still shows errors, check:\n";
echo "1. Moodle's curl settings and timeout values\n";
echo "2. Firewall or network restrictions\n";
echo "3. PHP error logs in Moodle\n";
echo "4. Ensure Moodle can access localhost:3000\n";


