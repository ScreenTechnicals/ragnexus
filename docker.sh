#!/bin/bash

# Simple script to start the docker infrastructure

echo "Starting ContextKit Docker Infrastructure..."
cd docker

# Check if docker-compose or docker compose should be used
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
elif docker compose version &> /dev/null; then
    docker compose up -d
else
    echo "Error: Neither docker-compose nor docker compose are installed/available."
    exit 1
fi

echo ""
echo "Infrastructure started successfully!"
echo "Services:"
echo " - Redis: localhost:6379"
echo " - Qdrant REST API: localhost:6333"
echo " - Qdrant gRPC: localhost:6334"
echo " - Firecrawl: localhost:3002 (Optional)"
echo ""
echo "To stop the infrastructure, run: cd docker && docker-compose down"
