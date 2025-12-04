/**
 * Scoring Prompt Templates
 * Prompts for evaluating question quality
 */

class ScoringPrompts {
    /**
     * Get prompt for scoring a single question
     * @param {Object} question - Question to score
     * @returns {string} - Scoring prompt
     */
    static getSingleQuestionPrompt(question) {
        return `You are an expert educational assessment evaluator. Score this multiple-choice question on a scale of 0-10.

QUESTION TO EVALUATE:
Question: ${question.questiontext}
A) ${question.optiona}
B) ${question.optionb}
C) ${question.optionc}
D) ${question.optiond}
Correct Answer: ${question.correctanswer}
Difficulty: ${question.difficulty}

SCORING CRITERIA (0-10 scale):

1. CLARITY (0-3 points)
   - Is the question clear and unambiguous?
   - Is the language appropriate for the difficulty level?
   - Are there any confusing or misleading elements?

2. DISTRACTOR QUALITY (0-3 points)
   - Are wrong answers plausible and tempting?
   - Do distractors represent common misconceptions?
   - Are distractors clearly wrong to someone who understands?

3. RELEVANCE (0-2 points)
   - Does the question test important concepts?
   - Is it aligned with the stated difficulty level?

4. CORRECTNESS (0-2 points)
   - Is there exactly one clearly correct answer?
   - Are all options grammatically consistent?
   - No ambiguity in the correct answer?

RESPONSE FORMAT (JSON only, no markdown):
{
  "score": 8,
  "clarity": 3,
  "distractors": 2,
  "relevance": 2,
  "correctness": 1,
  "issues": ["Minor issue description"],
  "strengths": ["What makes this question good"],
  "recommendation": "accept"
}

Recommendation must be one of: "accept", "revise", "reject"
- accept: score >= 7
- revise: score 5-6
- reject: score < 5

Provide your evaluation now:`;
    }

    /**
     * Get prompt for batch scoring multiple questions
     * @param {Array} questions - Questions to score
     * @returns {string} - Batch scoring prompt
     */
    static getBatchScoringPrompt(questions) {
        const questionsText = questions.map((q, idx) => `
QUESTION ${idx + 1}:
${q.questiontext}
A) ${q.optiona}
B) ${q.optionb}
C) ${q.optionc}
D) ${q.optiond}
Correct: ${q.correctanswer}
Difficulty: ${q.difficulty}
`).join('\n---\n');

        return `You are an expert educational assessment evaluator. Score these ${questions.length} multiple-choice questions.

${questionsText}

For each question, evaluate on these criteria (0-10 scale):
1. Clarity (0-3): Clear, unambiguous, appropriate language
2. Distractors (0-3): Plausible wrong answers based on misconceptions
3. Relevance (0-2): Tests important concepts, aligned with difficulty
4. Correctness (0-2): One clear correct answer, no ambiguity

RESPONSE FORMAT (JSON only, no markdown):
{
  "scores": [
    {
      "questionIndex": 0,
      "score": 8,
      "clarity": 3,
      "distractors": 2,
      "relevance": 2,
      "correctness": 1,
      "recommendation": "accept",
      "issues": ["Any issues"],
      "strengths": ["What's good"]
    }
  ],
  "summary": {
    "averageScore": 7.5,
    "acceptCount": 8,
    "reviseCount": 2,
    "rejectCount": 0
  }
}

Recommendation: "accept" (>=7), "revise" (5-6), "reject" (<5)

Provide your evaluation now:`;
    }

    /**
     * Get quick scoring prompt (faster, less detailed)
     * @param {Object} question - Question to score
     * @returns {string} - Quick scoring prompt
     */
    static getQuickScorePrompt(question) {
        return `Rate this question 0-10 based on clarity, distractor quality, and correctness.

Question: ${question.questiontext}
A) ${question.optiona}
B) ${question.optionb}
C) ${question.optionc}
D) ${question.optiond}
Correct: ${question.correctanswer}

Respond with JSON only:
{
  "score": 8,
  "recommendation": "accept",
  "mainIssue": "Brief issue or 'none'"
}

Recommendation: "accept" (>=7), "revise" (5-6), "reject" (<5)`;
    }
}

module.exports = ScoringPrompts;
