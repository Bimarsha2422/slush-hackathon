#!/bin/bash

# Define the output file
output="current.txt"

# Remove the output file if it already exists (start fresh)
rm -f "$output"

# Append the directory structure to the output file using tree,
# ignoring the .git, node_modules, and MATH directories.
echo "Directory structure:" >> "$output"
tree -I '.git|node_modules|MATH' >> "$output"
echo -e "\n\n" >> "$output"

# Recursively locate files while excluding:
# - The output file itself
# - Specific configuration files: package-lock.json, package.json, postcss.config.js, tailwind.config.js, .DS_Store
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
    # Append the file name as a header
    echo "$file" >> "$output"
    echo "" >> "$output"
    
    # Append the file's content
    cat "$file" >> "$output"
    
    # Append a separator newline
    echo -e "\n" >> "$output"
done