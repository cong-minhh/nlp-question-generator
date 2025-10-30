# Test script for NLP Question Generator API (PowerShell)
# Usage: .\test-api.ps1

$API_URL = "http://localhost:3000"

Write-Host "Testing NLP Question Generator API" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing Health Check Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/health" -Method Get
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: API Documentation
Write-Host "2. Testing API Documentation Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/" -Method Get
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Generate Questions
Write-Host "3. Testing Question Generation..." -ForegroundColor Yellow
try {
    $body = @{
        text = "Photosynthesis is the process by which plants use sunlight, water and carbon dioxide to create oxygen and energy in the form of sugar. This process is fundamental to life on Earth as it provides oxygen for animals and removes carbon dioxide from the atmosphere. Chlorophyll, the green pigment in plants, plays a crucial role in capturing light energy."
        num_questions = 3
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$API_URL/generate" -Method Post -Body $body -ContentType "application/json"
    $response | ConvertTo-Json -Depth 10
    
    Write-Host "`nGenerated $($response.questions.Count) questions:" -ForegroundColor Green
    $i = 1
    foreach ($q in $response.questions) {
        Write-Host "`nQuestion $i [$($q.difficulty)]:" -ForegroundColor Cyan
        Write-Host "  $($q.questiontext)"
        Write-Host "  A) $($q.optiona)"
        Write-Host "  B) $($q.optionb)"
        Write-Host "  C) $($q.optionc)"
        Write-Host "  D) $($q.optiond)"
        Write-Host "  Correct: $($q.correctanswer)" -ForegroundColor Green
        $i++
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "Tests completed!" -ForegroundColor Green

