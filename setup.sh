#!/bin/bash
# Setup script for Rooster AI Project Management

echo "Setting up Rooster AI Project Management..."
echo ""

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1)
echo "✓ Found $PYTHON_VERSION"

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -q -r requirements.txt

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully"
else
    echo "✗ Failed to install dependencies"
    exit 1
fi

# Initialize the system
echo ""
echo "Initializing system..."
./rooster init

echo ""
echo "✓ Setup complete!"
echo ""
echo "Try these commands to get started:"
echo "  ./rooster project create --name 'My Project' --description 'My first project'"
echo "  ./rooster agent list"
echo "  ./rooster --help"
echo ""
echo "Or run the demo:"
echo "  ./demo.sh"
