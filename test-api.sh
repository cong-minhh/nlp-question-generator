#!/bin/bash

# Test script for NLP Question Generator API
# Usage: ./test-api.sh

API_URL="http://localhost:3000"

echo "Testing NLP Question Generator API"
echo "==================================="
echo ""

# Test 1: Health Check
echo "1. Testing Health Check Endpoint..."
curl -s "${API_URL}/health" | json_pp 2>/dev/null || curl -s "${API_URL}/health"
echo ""
echo ""

# Test 2: API Documentation
echo "2. Testing API Documentation Endpoint..."
curl -s "${API_URL}/" | json_pp 2>/dev/null || curl -s "${API_URL}/"
echo ""
echo ""

# Test 3: Generate Questions
echo "3. Testing Question Generation..."
curl -X POST "${API_URL}/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Photosynthesis is the process by which plants use sunlight, water and carbon dioxide to create oxygen and energy in the form of sugar. This process is fundamental to life on Earth as it provides oxygen for animals and removes carbon dioxide from the atmosphere. Chlorophyll, the green pigment in plants, plays a crucial role in capturing light energy.",
    "num_questions": 3
  }' | json_pp 2>/dev/null || curl -X POST "${API_URL}/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Photosynthesis is the process by which plants use sunlight, water and carbon dioxide to create oxygen and energy in the form of sugar.",
    "num_questions": 3
  }'
echo ""
echo ""

echo "Tests completed!"

