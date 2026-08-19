# Render CLI Deployment Script for Windows
$renderExe = "C:\Users\sushi\.gemini\antigravity-ide\brain\fc96c9f6-4152-4d2f-a0d5-420ca5f883ef\scratch\render-cli\render.exe"

Write-Host "=== Render CLI Deployment tool ===" -ForegroundColor Cyan

# 1. Check Authentication
Write-Host "Checking Render authentication status..."
$authCheck = & $renderExe whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "You are not logged in. Running 'render login' to authenticate..." -ForegroundColor Yellow
    & $renderExe login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Authentication failed. Exiting." -ForegroundColor Red
        Exit
    }
} else {
    Write-Host "Authenticated successfully: $authCheck" -ForegroundColor Green
}

# 2. Parse Environment Variables from .env
$envVars = @{}
if (Test-Path ".env") {
    Write-Host "Parsing .env file for credentials..."
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            $envVars[$key] = $value
        }
    }
} else {
    Write-Host ".env file not found. Make sure credentials are set in .env before running." -ForegroundColor Red
    Exit
}

# Check required backend keys
$requiredKeys = @("MONGODB_URI", "GEMINI_API_KEY", "PINECONE_API_KEY", "PINECONE_ENVIRONMENT", "PINECONE_INDEX_NAME")
foreach ($key in $requiredKeys) {
    if (-not $envVars.ContainsKey($key)) {
        Write-Host "Error: Required environment variable '$key' is missing from .env file." -ForegroundColor Red
        Exit
    }
}

# 3. Create Backend Web Service
Write-Host "`nCreating Backend Service: chat-with-pdf-backend..." -ForegroundColor Cyan
$backendArgs = @(
    "services", "create",
    "--name", "chat-with-pdf-backend",
    "--type", "web_service",
    "--repo", "https://github.com/UmaSahni/chat-with-pdf",
    "--runtime", "node",
    "--build-command", "npm install",
    "--start-command", "node server.js",
    "--plan", "free",
    "--env-var", "PORT=5001",
    "--output", "json",
    "--confirm"
)

foreach ($key in $requiredKeys) {
    $backendArgs += "--env-var"
    $backendArgs += "$key=$($envVars[$key])"
}

$backendJsonStr = & $renderExe $backendArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create backend service. Error output:" -ForegroundColor Red
    Write-Host $backendJsonStr -ForegroundColor DarkRed
    Exit
}

$backendUrl = ""
try {
    $backendObj = ConvertFrom-Json $backendJsonStr
    $backendUrl = $backendObj.service.url
    if (-not $backendUrl) { $backendUrl = $backendObj.url }
} catch {}

if (-not $backendUrl) {
    $backendUrl = "https://chat-with-pdf-backend.onrender.com"
}
Write-Host "Backend Service Created! URL: $backendUrl" -ForegroundColor Green

# 4. Create Frontend Web Service
Write-Host "`nCreating Frontend Service: chat-with-pdf-frontend..." -ForegroundColor Cyan
$frontendArgs = @(
    "services", "create",
    "--name", "chat-with-pdf-frontend",
    "--type", "web_service",
    "--repo", "https://github.com/UmaSahni/chat-with-pdf",
    "--runtime", "node",
    "--root-directory", "frontend",
    "--build-command", "npm install && npm run build",
    "--start-command", "npm run start",
    "--plan", "free",
    "--env-var", "NEXT_PUBLIC_API_URL=$backendUrl",
    "--output", "json",
    "--confirm"
)

$frontendJsonStr = & $renderExe $frontendArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create frontend service. Error output:" -ForegroundColor Red
    Write-Host $frontendJsonStr -ForegroundColor DarkRed
    Exit
}

$frontendUrl = ""
try {
    $frontendObj = ConvertFrom-Json $frontendJsonStr
    $frontendUrl = $frontendObj.service.url
    if (-not $frontendUrl) { $frontendUrl = $frontendObj.url }
} catch {}

if (-not $frontendUrl) {
    $frontendUrl = "https://chat-with-pdf-frontend.onrender.com"
}

Write-Host "`n=== Deployment Successful! ===" -ForegroundColor Green
Write-Host "Backend URL:  $backendUrl" -ForegroundColor Green
Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Green
Write-Host "Services will start building on your Render account shortly." -ForegroundColor Cyan
