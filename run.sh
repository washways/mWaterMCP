#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
fi

read -p "Enter your mWater username: " MWATER_USERNAME
read -s -p "Enter your mWater password: " MWATER_PASSWORD
echo

cat > .env <<EOF
MWATER_USERNAME=$MWATER_USERNAME
MWATER_PASSWORD=$MWATER_PASSWORD
MWATER_BASE_URL=https://api.mwater.co/v3
PORT=3001
EOF

echo -e "\nSaved .env. Installing, building, and starting (prod JS)...\n"
npm install
npm run build
npm start
