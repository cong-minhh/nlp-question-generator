# Test script for file upload functionality
# Usage: .\test-file-upload.ps1 -FilePath "path\to\file.pdf"

param(
    [Parameter(Mandatory=$false)]
    [string]$FilePath = "",
    [int]$NumQuestions = 3
)

Write-Host "`n=== Testing File Upload API ===" -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:3000/generate-from-files"

# If no file path provided, create a test text file
if ([string]::IsNullOrEmpty($FilePath)) {
    Write-Host "No file provided. Creating a test file..." -ForegroundColor Yellow
    
    $testContent = @"
Introduction to Machine Learning

Machine Learning is a subset of Artificial Intelligence that enables computers to learn from data without being explicitly programmed.

Types of Machine Learning:
1. Supervised Learning - Uses labeled data to train models
2. Unsupervised Learning - Finds patterns in unlabeled data
3. Reinforcement Learning - Learns through trial and error

Applications:
- Image Recognition
- Natural Language Processing
- Recommendation Systems
- Autonomous Vehicles

Key Concepts:
- Training Data: The dataset used to train the model
- Features: Input variables used for prediction
- Labels: Output values in supervised learning
- Model: The mathematical representation learned from data
- Overfitting: When a model performs well on training data but poorly on new data

Conclusion:
Machine learning is transforming industries by enabling computers to make intelligent decisions based on data patterns.
"@
    
    $FilePath = "test-sample.txt"
    $testContent | Out-File -FilePath $FilePath -Encoding UTF8
    Write-Host "✓ Created test file: $FilePath" -ForegroundColor Green
    Write-Host ""
}

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "✗ File not found: $FilePath" -ForegroundColor Red
    exit 1
}

$fileItem = Get-Item $FilePath
Write-Host "File Details:" -ForegroundColor Yellow
Write-Host "  Name: $($fileItem.Name)"
Write-Host "  Size: $([math]::Round($fileItem.Length / 1KB, 2)) KB"
Write-Host "  Type: $($fileItem.Extension)"
Write-Host ""

Write-Host "Uploading file and generating $NumQuestions questions..." -ForegroundColor Yellow
Write-Host "This may take 10-30 seconds depending on file size..." -ForegroundColor Gray
Write-Host ""

try {
    # PowerShell's Invoke-RestMethod doesn't handle multipart/form-data well
    # Use .NET HttpClient instead
    
    Add-Type -AssemblyName System.Net.Http
    
    $httpClient = New-Object System.Net.Http.HttpClient
    $multipartContent = New-Object System.Net.Http.MultipartFormDataContent
    
    # Add file
    $fileStream = [System.IO.File]::OpenRead($FilePath)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
    $multipartContent.Add($fileContent, "files", $fileItem.Name)
    
    # Add num_questions parameter
    $stringContent = New-Object System.Net.Http.StringContent($NumQuestions.ToString())
    $multipartContent.Add($stringContent, "num_questions")
    
    # Send request
    $response = $httpClient.PostAsync($API_URL, $multipartContent).Result
    $responseContent = $response.Content.ReadAsStringAsync().Result
    
    # Clean up
    $fileStream.Close()
    $httpClient.Dispose()
    
    if ($response.IsSuccessStatusCode) {
        $result = $responseContent | ConvertFrom-Json
        
        Write-Host "✓ SUCCESS!" -ForegroundColor Green
        Write-Host ""
        
        # Display metadata
        if ($result.metadata) {
            Write-Host "=== File Processing Results ===" -ForegroundColor Cyan
            Write-Host "Files Processed: $($result.metadata.filesProcessed)"
            Write-Host "Files with Text: $($result.metadata.filesWithText)"
            Write-Host "Total Text Length: $($result.metadata.totalTextLength) characters"
            Write-Host ""
            
            foreach ($file in $result.metadata.files) {
                $statusColor = switch ($file.status) {
                    "success" { "Green" }
                    "warning" { "Yellow" }
                    "error" { "Red" }
                    default { "White" }
                }
                Write-Host "  $($file.name): " -NoNewline
                Write-Host $file.status -ForegroundColor $statusColor
                if ($file.textLength) {
                    Write-Host "    Extracted: $($file.textLength) characters"
                }
                if ($file.message) {
                    Write-Host "    Message: $($file.message)" -ForegroundColor Yellow
                }
            }
            Write-Host ""
        }
        
        # Display questions
        Write-Host "=== Generated Questions ===" -ForegroundColor Cyan
        $questionNum = 1
        foreach ($q in $result.questions) {
            Write-Host "`nQuestion $questionNum [$($q.difficulty.ToUpper())]:" -ForegroundColor Cyan
            Write-Host $q.questiontext -ForegroundColor White
            Write-Host "  A) $($q.optiona)" -ForegroundColor Gray
            Write-Host "  B) $($q.optionb)" -ForegroundColor Gray
            Write-Host "  C) $($q.optionc)" -ForegroundColor Gray
            Write-Host "  D) $($q.optiond)" -ForegroundColor Gray
            Write-Host "  ✓ Correct Answer: $($q.correctanswer)" -ForegroundColor Green
            $questionNum++
        }
        
        Write-Host "`n=== Test Completed Successfully! ===" -ForegroundColor Green
        
    } else {
        Write-Host "✗ Request failed with status: $($response.StatusCode)" -ForegroundColor Red
        Write-Host "Response: $responseContent" -ForegroundColor Red
    }
    
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Gray
} finally {
    # Clean up test file if we created it
    if ($FilePath -eq "test-sample.txt" -and (Test-Path $FilePath)) {
        Remove-Item $FilePath -Force
        Write-Host "`n(Cleaned up test file)" -ForegroundColor Gray
    }
}

Write-Host ""



