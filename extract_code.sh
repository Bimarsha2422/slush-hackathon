#!/bin/bash

# Define the output file
output="current.txt"

# Remove the output file if it already exists (so we start fresh)
rm -f "$output"

# Use 'find' to recursively locate files while excluding:
# - The output file itself
# - Specified configuration files (.DS_Store, package-lock.json, package.json, postcss.config.js, tailwind.config.js)
# - Files within .git, node_modules, and MATH directories
find . -type f \
  ! -name "$output" \
  ! -name "package-lock.json" \
  ! -name "postcss.config.js" \
  ! -name "tailwind.config.js" \
  ! -name ".DS_Store" \
  ! -path "*/.git/*" \
  ! -path "*/node_modules/*" \
  ! -path "*/MATH/*" \
  -print0 | while IFS= read -r -d '' file; do
    # Append the file name to the output file
    echo "$file" >> "$output"
    
    # Append a blank line for readability
    echo "" >> "$output"
    
    # Append the file's contents to the output file
    cat "$file" >> "$output"
    
    # Append another newline as a separator between files
    echo -e "\n" >> "$output"
done
