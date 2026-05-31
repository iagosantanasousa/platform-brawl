#!/bin/bash
# Start development servers

PNPM=/Users/iagosantanasousa/Library/pnpm/bin/pnpm

echo "Starting Platform Brawl..."
echo ""

# Start server in background
echo "[SERVER] Starting on port 4000..."
(cd server && node_modules/.bin/tsx watch src/index.ts) &
SERVER_PID=$!

sleep 1

# Start client
echo "[CLIENT] Starting on port 3000..."
(cd client && node_modules/.bin/vite) &
CLIENT_PID=$!

echo ""
echo "Game running at http://localhost:3000"
echo "Server running at http://localhost:4000"
echo ""
echo "Press Ctrl+C to stop"

# Wait and cleanup
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
