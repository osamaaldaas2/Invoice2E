#!/bin/bash
# Setup script for Invoice2E

echo "Installing dependencies..."
npm install

echo "Checking TypeScript..."
npm run type-check

echo "Running linter..."
npm run lint

echo "Setup complete!"
