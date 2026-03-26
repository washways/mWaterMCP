$ErrorActionPreference = "Stop"

if (-Not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}

Write-Host "Enter your mWater username:"
$mwUser = Read-Host

Write-Host "Enter your mWater password (input hidden):"
$securePass = Read-Host -AsSecureString
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
$mwPass = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) | Out-Null

$envLines = @(
  "MWATER_USERNAME=$mwUser",
  "MWATER_PASSWORD=$mwPass",
  "MWATER_BASE_URL=https://api.mwater.co/v3",
  "PORT=3001"
)
Set-Content -Path ".env" -Value $envLines

Write-Host "`nSaved .env. Starting quickstart (install + run)...`n"
npm run quickstart
