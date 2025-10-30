# Verification script for NLP Question Generator
# This script checks if everything is configured correctly

Write-Host "`n=== NLP Question Generator Setup Verification ===" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: .env file exists
Write-Host "1. Checking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✓ .env file exists" -ForegroundColor Green
    
    # Check if API key is set
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "GEMINI_API_KEY=AIza") {
        Write-Host "   ✓ API key appears to be set" -ForegroundColor Green
    } else {
        Write-Host "   ✗ API key not found or invalid" -ForegroundColor Red
        $allGood = $false
    }
} else {
    Write-Host "   ✗ .env file not found!" -ForegroundColor Red
    Write-Host "   Run: Copy-Item env.example .env" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check 2: node_modules installed
Write-Host "2. Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✓ node_modules folder exists" -ForegroundColor Green
} else {
    Write-Host "   ✗ Dependencies not installed" -ForegroundColor Red
    Write-Host "   Run: npm install" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check 3: Server health
Write-Host "3. Checking if server is running..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "healthy") {
        Write-Host "   ✓ Server is running and healthy" -ForegroundColor Green
        Write-Host "   ✓ Service: $($health.service)" -ForegroundColor Green
        Write-Host "   ✓ Version: $($health.version)" -ForegroundColor Green
    } else {
        Write-Host "   ? Server responded but status is: $($health.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ✗ Server is not responding" -ForegroundColor Red
    Write-Host "   Run: npm start" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check 4: Test question generation
if ($allGood) {
    Write-Host "4. Testing question generation..." -ForegroundColor Yellow
    try {
        $testBody = @{
            text = "The solar system contains eight planets orbiting the Sun. Earth is the third planet from the Sun."
            num_questions = 1
        } | ConvertTo-Json
        
        $result = Invoke-RestMethod -Uri "http://localhost:3000/generate" -Method Post -Body $testBody -ContentType "application/json" -TimeoutSec 30
        
        if ($result.questions -and $result.questions.Count -gt 0) {
            Write-Host "   ✓ Successfully generated $($result.questions.Count) question(s)" -ForegroundColor Green
            
            $q = $result.questions[0]
            Write-Host ""
            Write-Host "   Sample Question:" -ForegroundColor Cyan
            Write-Host "   Q: $($q.questiontext)" -ForegroundColor White
            Write-Host "   A) $($q.optiona)" -ForegroundColor Gray
            Write-Host "   B) $($q.optionb)" -ForegroundColor Gray
            Write-Host "   C) $($q.optionc)" -ForegroundColor Gray
            Write-Host "   D) $($q.optiond)" -ForegroundColor Gray
            Write-Host "   Correct: $($q.correctanswer) | Difficulty: $($q.difficulty)" -ForegroundColor Green
        } else {
            Write-Host "   ✗ No questions returned" -ForegroundColor Red
            $allGood = $false
        }
    } catch {
        Write-Host "   ✗ Question generation failed" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        $allGood = $false
    }
    Write-Host ""
}

# Summary
Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "✓✓✓ All checks passed! Your setup is ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Configure Moodle NLP endpoint: http://localhost:3000/generate"
    Write-Host "2. Enable debug mode in Moodle to see detailed logs"
    Write-Host "3. Try generating questions from a slide"
    Write-Host ""
    Write-Host "If Moodle shows errors, see: MOODLE-TROUBLESHOOTING.md" -ForegroundColor Cyan
} else {
    Write-Host "✗✗✗ Some checks failed. Please fix the issues above." -ForegroundColor Red
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor Yellow
    Write-Host "• Missing .env: Copy-Item env.example .env (then edit with your API key)"
    Write-Host "• Missing dependencies: npm install"
    Write-Host "• Server not running: npm start"
    Write-Host ""
    Write-Host "For detailed help, see: SETUP.md" -ForegroundColor Cyan
}
Write-Host ""


