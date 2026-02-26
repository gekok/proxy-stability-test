#!/bin/sh
set -e

CERT_DIR="$(dirname "$0")"

if [ ! -f "$CERT_DIR/server.key" ] || [ ! -f "$CERT_DIR/server.crt" ]; then
  echo "Generating self-signed TLS certificate..."
  openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -days 3650 -nodes \
    -subj '/CN=target'
  echo "Certificate generated successfully."
else
  echo "Certificate already exists, skipping generation."
fi
