# Simple test for file upload API
# Usage: .\test-upload-simple.ps1

Write-Host "`n=== Testing File Upload API ===" -ForegroundColor Cyan
Write-Host ""

# Create a test text file
$testContent = @"
Machine Learning Fundamentals

Machine Learning is a subset of Artificial Intelligence that enables computers to learn from data.

Key Concepts:
1. Supervised Learning - Uses labeled data for training
2. Unsupervised Learning - Finds patterns in unlabeled data
3. Reinforcement Learning - Learns through trial and error

Applications include image recognition, natural language processing, and recommendation systems.
"@

$testFile = "test-ml.txt"
$testContent | Out-File -FilePath $testFile -Encoding UTF8 -NoNewline

Write-Host "Created test file: $testFile" -ForegroundColor Green
Write-Host "File size: $((Get-Item $testFile).Length) bytes" -ForegroundColor Gray
Write-Host ""
Write-Host "Uploading file and generating questions..." -ForegroundColor Yellow
Write-Host "(This may take 10-30 seconds)" -ForegroundColor Gray
Write-Host ""

try {
    # Use curl (which is aliased to Invoke-WebRequest in PowerShell)
    $uri = "http://localhost:3000/generate-from-files"
    
    # Create form data
    $formData = @{
        files = Get-Item -Path $testFile
        num_questions = "3"
    }
    
    # Send request
    $response = Invoke-WebRequest -Uri $uri -Method Post -Form $formData
    $result = $response.Content | ConvertFrom-Json
    
    Write-Host "✓ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    
    # Display metadata
    if ($result.metadata) {
        Write-Host "=== Processing Results ===" -ForegroundColor Cyan
        Write-Host "Files Processed: $($result.metadata.filesProcessed)"
        Write-Host "Text Extracted: $($result.metadata.totalTextLength) characters"
        Write-Host ""
    }
    
    # Display questions
    Write-Host "=== Generated Questions ===" -ForegroundColor Cyan
    $qNum = 1
    foreach ($q in $result.questions) {
        Write-Host "`nQuestion $qNum [$($q.difficulty.ToUpper())]:" -ForegroundColor Cyan
        Write-Host $q.questiontext -ForegroundColor White
        Write-Host "  A) $($q.optiona)" -ForegroundColor Gray
        Write-Host "  B) $($q.optionb)" -ForegroundColor Gray
        Write-Host "  C) $($q.optionc)" -ForegroundColor Gray
        Write-Host "  D) $($q.optiond)" -ForegroundColor Gray
        Write-Host "  ✓ Correct: $($q.correctanswer)" -ForegroundColor Green
        $qNum++
    }
    
    Write-Host "`n=== Test Completed! ===" -ForegroundColor Green
    
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Clean up test file
    if (Test-Path $testFile) {
        Start-Sleep -Milliseconds 500
        Remove-Item $testFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""



