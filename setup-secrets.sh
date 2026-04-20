#!/bin/bash
set -e

SECRETS_DIR="./secrets"

echo "Setting up HyDash Docker secrets..."

mkdir -p "$SECRETS_DIR"

# Generate JWT secret
if [ ! -f "$SECRETS_DIR/jwt_secret.txt" ]; then
  openssl rand -base64 64 | tr -d '\n' > "$SECRETS_DIR/jwt_secret.txt"
  echo "Generated JWT secret"
else
  echo "JWT secret already exists, skipping"
fi

# Generate DB password
if [ ! -f "$SECRETS_DIR/db_password.txt" ]; then
  openssl rand -base64 32 | tr -d '\n' > "$SECRETS_DIR/db_password.txt"
  echo "Generated DB password"
else
  echo "DB password already exists, skipping"
fi

chmod 600 "$SECRETS_DIR"/*.txt
echo "Secrets created in $SECRETS_DIR/"
echo "IMPORTANT: The 'secrets/' directory is in .gitignore. Never commit these files!"