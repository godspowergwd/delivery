# Installs every workspace dependency (run from the repo root).
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-deps.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Output "root: $root"

Write-Output '=== [1/6] root dev tools ==='
npm install -D concurrently
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== [2/6] shared workspace (typescript) ==='
npm install -w @delivery/shared -D typescript
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== [3/6] api runtime dependencies ==='
npm install -w @delivery/api express cors helmet express-rate-limit cookie-parser jsonwebtoken bcryptjs zod multer socket.io dotenv @prisma/client pdfkit exceljs qrcode morgan
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== [4/6] api dev dependencies ==='
npm install -w @delivery/api -D prisma typescript tsx @types/node @types/express @types/cors @types/cookie-parser @types/jsonwebtoken @types/multer @types/pdfkit @types/qrcode @types/morgan supertest @types/supertest vitest
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== [5/6] web runtime dependencies ==='
npm install -w @delivery/web react react-dom react-router-dom socket.io-client @tanstack/react-query recharts lucide-react clsx tailwind-merge date-fns
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== [6/6] web dev dependencies + PWA tooling ==='
npm install -w @delivery/web -D vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite @vitejs/plugin-basic-ssl vite-plugin-pwa workbox-window @vite-pwa/assets-generator @types/react @types/react-dom
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output '=== installing @delivery/shared links ==='
npm install
Write-Output "=== exit $LASTEXITCODE ==="

Write-Output 'INSTALL-DONE'