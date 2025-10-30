<?php
/**
 * Example integration with Moodle nlp_generator class
 * 
 * This file shows how to integrate the Node.js NLP service
 * with your existing Moodle plugin.
 * 
 * @package    mod_classengage
 * @copyright  2025 Your Name
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_classengage;

defined('MOODLE_INTERNAL') || die();

/**
 * Example implementation of call_nlp_service method with enhanced error handling
 */
class nlp_generator_enhanced extends nlp_generator {
    
    /**
     * Call external NLP service with retry logic
     *
     * @param string $text
     * @param int $classengageid
     * @param int $slideid
     * @param int $numquestions
     * @return array
     */
    protected function call_nlp_service($text, $classengageid, $slideid, $numquestions) {
        $nlpendpoint = get_config('mod_classengage', 'nlpendpoint');
        
        // For the Node.js service, API key is not required
        // It's stored in the .env file on the Node.js server
        
        // Prepare request
        $data = array(
            'text' => $text,
            'num_questions' => $numquestions
        );
        
        $options = array(
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_TIMEOUT' => 60,  // Increased timeout for AI generation
            'CURLOPT_HTTPHEADER' => array(
                'Content-Type: application/json'
            ),
        );
        
        // Retry logic for rate limiting
        $maxretries = 3;
        $retrydelay = 2; // seconds
        $lasterror = null;
        
        for ($attempt = 1; $attempt <= $maxretries; $attempt++) {
            try {
                // Make HTTP request
                $curl = new \curl();
                $response = $curl->post($nlpendpoint, json_encode($data), $options);
                
                if ($curl->get_errno()) {
                    throw new \Exception('HTTP request failed: ' . $curl->error);
                }
                
                // Get HTTP status code
                $info = $curl->get_info();
                $httpcode = $info['http_code'];
                
                // Handle rate limiting (429 status)
                if ($httpcode == 429) {
                    if ($attempt < $maxretries) {
                        debugging("Rate limit hit, retrying in {$retrydelay} seconds (attempt {$attempt}/{$maxretries})", DEBUG_DEVELOPER);
                        sleep($retrydelay);
                        $retrydelay *= 2; // Exponential backoff
                        continue;
                    }
                    throw new \Exception('Rate limit exceeded, please try again later');
                }
                
                // Handle server errors (5xx status)
                if ($httpcode >= 500) {
                    if ($attempt < $maxretries) {
                        debugging("Server error, retrying in {$retrydelay} seconds (attempt {$attempt}/{$maxretries})", DEBUG_DEVELOPER);
                        sleep($retrydelay);
                        continue;
                    }
                    throw new \Exception('NLP service is temporarily unavailable');
                }
                
                // Handle client errors (4xx status)
                if ($httpcode >= 400 && $httpcode < 500) {
                    throw new \Exception("Invalid request (HTTP {$httpcode}): " . $response);
                }
                
                // Parse response
                $result = json_decode($response, true);
                
                if (!$result) {
                    throw new \Exception('Invalid JSON response from NLP service');
                }
                
                // Check for error in response
                if (isset($result['error'])) {
                    throw new \Exception('NLP service error: ' . $result['error']);
                }
                
                if (!isset($result['questions']) || !is_array($result['questions'])) {
                    throw new \Exception('Invalid response format: missing questions array');
                }
                
                if (empty($result['questions'])) {
                    throw new \Exception('No questions generated');
                }
                
                // Validate question format
                foreach ($result['questions'] as $i => $q) {
                    $requiredfields = array('questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer', 'difficulty');
                    foreach ($requiredfields as $field) {
                        if (!isset($q[$field]) || empty($q[$field])) {
                            throw new \Exception("Question " . ($i + 1) . " missing field: {$field}");
                        }
                    }
                }
                
                // Success! Store and return questions
                debugging("Successfully generated {count($result['questions'])} questions", DEBUG_DEVELOPER);
                return $this->store_questions($result['questions'], $classengageid, $slideid);
                
            } catch (\Exception $e) {
                $lasterror = $e->getMessage();
                debugging("NLP service attempt {$attempt} failed: {$lasterror}", DEBUG_DEVELOPER);
                
                if ($attempt < $maxretries) {
                    sleep($retrydelay);
                }
            }
        }
        
        // All retries failed
        throw new \Exception("NLP service failed after {$maxretries} attempts. Last error: {$lasterror}");
    }
}

/**
 * Configuration example for Moodle admin settings
 * Add these to your settings.php file
 */
/*

// NLP Service Configuration
$settings->add(new admin_setting_configtext(
    'mod_classengage/nlpendpoint',
    get_string('nlpendpoint', 'mod_classengage'),
    get_string('nlpendpoint_desc', 'mod_classengage'),
    'http://localhost:3000/generate',  // Default endpoint
    PARAM_URL
));

$settings->add(new admin_setting_configtext(
    'mod_classengage/defaultquestions',
    get_string('defaultquestions', 'mod_classengage'),
    get_string('defaultquestions_desc', 'mod_classengage'),
    10,
    PARAM_INT
));

// Test connection button
$settings->add(new admin_setting_heading(
    'mod_classengage/nlptest',
    get_string('nlptest', 'mod_classengage'),
    '<button onclick="testNLPConnection()">Test Connection</button>
     <script>
     function testNLPConnection() {
         fetch("' . (new moodle_url('/mod/classengage/test_nlp.php'))->out(false) . '")
             .then(r => r.json())
             .then(d => alert(d.status === "healthy" ? "Connection successful!" : "Connection failed: " + JSON.stringify(d)))
             .catch(e => alert("Connection failed: " + e));
     }
     </script>'
));

*/

/**
 * Language strings to add to your lang/en/mod_classengage.php
 */
/*

$string['nlpendpoint'] = 'NLP Service Endpoint';
$string['nlpendpoint_desc'] = 'URL of the NLP question generation service (e.g., http://localhost:3000/generate)';
$string['defaultquestions'] = 'Default Number of Questions';
$string['defaultquestions_desc'] = 'Default number of questions to generate per slide';
$string['nlptest'] = 'Test NLP Connection';

*/

/**
 * Example test script: test_nlp.php
 * Place in your module root directory
 */
/*

<?php
require_once('../../config.php');
require_once($CFG->dirroot . '/mod/classengage/classes/nlp_generator.php');

require_login();
require_capability('moodle/site:config', context_system::instance());

header('Content-Type: application/json');

try {
    $endpoint = get_config('mod_classengage', 'nlpendpoint');
    
    if (empty($endpoint)) {
        throw new Exception('NLP endpoint not configured');
    }
    
    // Test with sample text
    $testtext = 'This is a test. The quick brown fox jumps over the lazy dog.';
    
    $curl = new curl();
    $response = $curl->post($endpoint, json_encode([
        'text' => $testtext,
        'num_questions' => 1
    ]), [
        'CURLOPT_RETURNTRANSFER' => true,
        'CURLOPT_TIMEOUT' => 30,
        'CURLOPT_HTTPHEADER' => ['Content-Type: application/json']
    ]);
    
    $result = json_decode($response, true);
    
    if ($result && isset($result['questions'])) {
        echo json_encode(['status' => 'healthy', 'message' => 'Connection successful', 'questions' => count($result['questions'])]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid response format']);
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}

*/

