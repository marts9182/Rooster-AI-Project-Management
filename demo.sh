#!/bin/bash
# Demo script for Rooster AI Project Management

echo "=== Rooster AI Project Management Demo ==="
echo ""

echo "Step 1: Initialize the system"
echo "$ ./rooster init"
./rooster init
echo ""

echo "Press Enter to continue..."
read

echo "Step 2: View our AI agent team"
echo "$ ./rooster agent list"
./rooster agent list
echo ""

echo "Press Enter to continue..."
read

echo "Step 3: Create a project"
echo '$ ./rooster project create --name "Todo App" --description "A simple todo list application"'
PROJECT_ID=$(./rooster project create --name "Todo App" --description "A simple todo list application" | grep -oP 'proj-[a-z0-9]+')
echo ""

echo "Press Enter to continue..."
read

echo "Step 4: Create tasks with automatic agent assignment"
echo '$ ./rooster task create --project '$PROJECT_ID' --title "Add user authentication" --description "Implement secure login and registration" --auto-assign'
./rooster task create --project $PROJECT_ID --title "Add user authentication" --description "Implement secure login and registration" --auto-assign
echo ""

echo "Press Enter to continue..."
read

echo '$ ./rooster task create --project '$PROJECT_ID' --title "Ensure forms are accessible" --description "Add ARIA labels and keyboard navigation to all forms" --auto-assign'
./rooster task create --project $PROJECT_ID --title "Ensure forms are accessible" --description "Add ARIA labels and keyboard navigation to all forms" --auto-assign
echo ""

echo "Press Enter to continue..."
read

echo "Step 5: View the task board"
echo "$ ./rooster task list"
./rooster task list
echo ""

echo "Demo complete! You can now explore the system with:"
echo "  - ./rooster project list"
echo "  - ./rooster task list"
echo "  - ./rooster agent list"
echo ""
echo "Create your own tasks and watch the agents collaborate!"
