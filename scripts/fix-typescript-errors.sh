#!/bin/bash

# Fix all TypeScript errors in CLI files

echo "Fixing TypeScript errors..."

# Fix error handling in all CLI files
for file in src/cli/*.ts; do
  echo "Processing $file..."
  
  # Fix 'error' is of type 'unknown' - replace catch (error) with proper error handling
  sed -i.bak -E 's/} catch \(error\) \{/} catch (error) {\
  const errorMessage = error instanceof Error ? error.message : String(error)/g' "$file"
  
  # Then fix the error references to use errorMessage
  sed -i.bak -E 's/error\.message/errorMessage/g' "$file"
  sed -i.bak -E 's/\$\{error\}/\$\{errorMessage\}/g' "$file"
  sed -i.bak -E 's/: error$/: errorMessage/g' "$file"
  
  # Clean up backup files
  rm "$file.bak"
done

echo "TypeScript errors fixed!"