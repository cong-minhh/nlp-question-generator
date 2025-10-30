<?php
/**
 * NLP question generation class with enhanced debugging
 *
 * Copy the call_nlp_service method from this file into your actual nlp_generator.php
 * to get better error messages
 *
 * @package    mod_classengage
 * @copyright  2025 Your Name
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_classengage;

defined('MOODLE_INTERNAL') || die();

/**
 * NLP question generator class with debugging
 */
class nlp_generator_debug extends nlp_generator {
    
    /**
     * Call external NLP service with enhanced debugging
     *
     * @param string $text
     * @param int $classengageid
     * @param int $slideid
     * @param int $numquestions
     * @return array
     */
    protected function call_nlp_service($text, $classengageid, $slideid, $numquestions) {
        global $DB;
        
        $nlpendpoint = get_config('mod_classengage', 'nlpendpoint');
        $apikey = get_config('mod_classengage', 'nlpapikey');
        
        debugging("NLP Endpoint: $nlpendpoint", DEBUG_DEVELOPER);
        debugging("Number of questions requested: $numquestions", DEBUG_DEVELOPER);
        debugging("Text length: " . strlen($text) . " characters", DEBUG_DEVELOPER);
        
        // Prepare request
        $data = array(
            'text' => $text,
            'num_questions' => $numquestions
        );
        
        $jsondata = json_encode($data);
        debugging("Request JSON: " . substr($jsondata, 0, 200) . "...", DEBUG_DEVELOPER);
        
        // Set up curl options
        $options = array(
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_TIMEOUT' => 60,
            'CURLOPT_HTTPHEADER' => array(
                'Content-Type: application/json',
            ),
        );
        
        // Only add Authorization header if API key is configured
        if (!empty($apikey)) {
            $options['CURLOPT_HTTPHEADER'][] = 'Authorization: Bearer ' . $apikey;
        }
        
        try {
            // Make HTTP request
            $curl = new \curl();
            debugging("Sending POST request to: $nlpendpoint", DEBUG_DEVELOPER);
            
            $response = $curl->post($nlpendpoint, $jsondata, $options);
            
            // Check for CURL errors
            if ($curl->get_errno()) {
                $error = $curl->error;
                debugging("CURL Error: $error", DEBUG_DEVELOPER);
                throw new \Exception('HTTP request failed: ' . $error);
            }
            
            // Get HTTP info
            $info = $curl->get_info();
            $httpcode = isset($info['http_code']) ? $info['http_code'] : 0;
            debugging("HTTP Status Code: $httpcode", DEBUG_DEVELOPER);
            debugging("Response length: " . strlen($response) . " bytes", DEBUG_DEVELOPER);
            debugging("Raw response (first 500 chars): " . substr($response, 0, 500), DEBUG_DEVELOPER);
            
            // Check HTTP status
            if ($httpcode >= 400) {
                debugging("HTTP Error Response: $response", DEBUG_DEVELOPER);
                if ($httpcode == 400) {
                    throw new \Exception('Bad request - check text input and num_questions parameter');
                } else if ($httpcode == 429) {
                    throw new \Exception('Rate limit exceeded - please wait and try again');
                } else if ($httpcode >= 500) {
                    throw new \Exception('NLP service error - the service may be down or misconfigured');
                }
                throw new \Exception("HTTP error $httpcode: $response");
            }
            
            // Trim response (sometimes there's whitespace)
            $response = trim($response);
            
            // Try to decode JSON
            $result = json_decode($response, true);
            $jsonerror = json_last_error();
            
            if ($jsonerror !== JSON_ERROR_NONE) {
                $jsonerrmsg = json_last_error_msg();
                debugging("JSON decode failed: $jsonerrmsg", DEBUG_DEVELOPER);
                debugging("JSON error code: $jsonerror", DEBUG_DEVELOPER);
                debugging("Response was: $response", DEBUG_DEVELOPER);
                throw new \Exception("Invalid JSON response: $jsonerrmsg. Response: " . substr($response, 0, 200));
            }
            
            debugging("JSON decoded successfully", DEBUG_DEVELOPER);
            debugging("Response keys: " . implode(', ', array_keys($result)), DEBUG_DEVELOPER);
            
            // Check for error in response
            if (isset($result['error'])) {
                debugging("API returned error: " . $result['error'], DEBUG_DEVELOPER);
                if (isset($result['message'])) {
                    debugging("Error message: " . $result['message'], DEBUG_DEVELOPER);
                }
                throw new \Exception('NLP service error: ' . $result['error']);
            }
            
            // Validate structure
            if (!isset($result['questions'])) {
                debugging("Response missing 'questions' key", DEBUG_DEVELOPER);
                debugging("Full response: " . print_r($result, true), DEBUG_DEVELOPER);
                throw new \Exception('Invalid response from NLP service: missing questions array');
            }
            
            if (!is_array($result['questions'])) {
                debugging("'questions' is not an array", DEBUG_DEVELOPER);
                throw new \Exception('Invalid response from NLP service: questions is not an array');
            }
            
            $questioncount = count($result['questions']);
            debugging("Received $questioncount questions", DEBUG_DEVELOPER);
            
            if ($questioncount == 0) {
                throw new \Exception('No questions generated by NLP service');
            }
            
            // Validate each question
            $requiredfields = array('questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer', 'difficulty');
            foreach ($result['questions'] as $index => $q) {
                $qnum = $index + 1;
                debugging("Validating question $qnum", DEBUG_DEVELOPER);
                
                foreach ($requiredfields as $field) {
                    if (!isset($q[$field]) || empty($q[$field])) {
                        debugging("Question $qnum missing or empty field: $field", DEBUG_DEVELOPER);
                        throw new \Exception("Question $qnum is missing required field: $field");
                    }
                }
                
                // Validate correct answer
                if (!in_array(strtoupper($q['correctanswer']), array('A', 'B', 'C', 'D'))) {
                    debugging("Question $qnum has invalid correct answer: {$q['correctanswer']}", DEBUG_DEVELOPER);
                    throw new \Exception("Question $qnum has invalid correct answer");
                }
            }
            
            debugging("All questions validated successfully", DEBUG_DEVELOPER);
            
            // Store questions
            $questionids = $this->store_questions($result['questions'], $classengageid, $slideid);
            
            debugging("Stored " . count($questionids) . " questions in database", DEBUG_DEVELOPER);
            
            return $questionids;
            
        } catch (\Exception $e) {
            debugging("Exception caught: " . $e->getMessage(), DEBUG_DEVELOPER);
            debugging("Stack trace: " . $e->getTraceAsString(), DEBUG_DEVELOPER);
            throw $e;
        }
    }
}


