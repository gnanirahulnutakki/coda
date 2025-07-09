#!/bin/bash

echo "=== Coda Demo ==="
echo ""
echo "1. Showing help menu:"
echo "-------------------"
coda --help 2>&1 | head -30

echo ""
echo "2. Checking version:"
echo "-------------------"
coda --version 2>&1 | head -5

echo ""
echo "3. Stats command help:"
echo "--------------------"
coda stats --help 2>&1

echo ""
echo "4. Showing initialization help:"
echo "------------------------------"
coda cc-init --help 2>&1

echo ""
echo "5. Current config directory structure:"
echo "------------------------------------"
ls -la ~/.coda/ 2>/dev/null || echo "Config directory doesn't exist yet"