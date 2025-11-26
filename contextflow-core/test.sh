#!/bin/bash
# ContextFlow Test Runner
# Runs all tests across the project

set -e  # Exit on error

echo "🧪 ContextFlow Test Suite"
echo "=================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test Python SDK
echo -e "${YELLOW}Testing Python SDK...${NC}"
cd sdk/python
if command -v pytest &> /dev/null; then
    pytest -v
    echo -e "${GREEN}✓ Python tests passed${NC}"
else
    echo -e "${RED}✗ pytest not installed. Run: pip install pytest${NC}"
    exit 1
fi
cd ../..
echo ""

# Validate examples
echo -e "${YELLOW}Validating example files...${NC}"
cd sdk/python
pytest tests/test_examples.py -v
echo -e "${GREEN}✓ All examples valid${NC}"
cd ../..
echo ""

# Test JavaScript SDK (if available)
if [ -d "sdk/javascript/tests" ]; then
    echo -e "${YELLOW}Testing JavaScript SDK...${NC}"
    cd sdk/javascript
    if [ -f "package.json" ]; then
        npm test
        echo -e "${GREEN}✓ JavaScript tests passed${NC}"
    fi
    cd ../..
    echo ""
fi

# Validate with schema directly
echo -e "${YELLOW}Validating examples with JSON Schema...${NC}"
if command -v python3 &> /dev/null; then
    for file in examples/*.contextflow; do
        if [ -f "$file" ]; then
            echo "  Checking $file..."
            python3 -c "
import json, jsonschema
schema = json.load(open('schema/v1.0.json'))
data = json.load(open('$file'))
try:
    jsonschema.validate(data, schema)
    print('    ✓ Valid')
except Exception as e:
    print(f'    ✗ Invalid: {e}')
    exit(1)
"
        fi
    done
    echo -e "${GREEN}✓ Schema validation passed${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ All tests passed!${NC}"
echo -e "${GREEN}================================${NC}"
