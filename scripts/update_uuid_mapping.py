import json
import urllib.parse
import os

# Read the existing UUID mapping
with open('data/uuid_file_mapping.json', 'r') as f:
    uuid_mapping = json.load(f)

# Function to convert local file path to URL format
def convert_to_url(file_path):
    # Remove the base path prefix
    base_path = "/Users/rsaran/cc_sde/data/complete_library/"
    if file_path.startswith(base_path):
        # Get the relative path
        relative_path = file_path[len(base_path):]
        # URL encode the path
        url_encoded_path = urllib.parse.quote(relative_path)
        # Construct the new URL
        return f"https://vader.tail96aa.ts.net/{url_encoded_path}"
    return file_path  # Return unchanged if it doesn't match the pattern

# Convert all paths in the mapping
updated_mapping = {}
for uuid, file_path in uuid_mapping.items():
    updated_mapping[uuid] = convert_to_url(file_path)

# Write the updated mapping back to the file
with open('data/uuid_file_mapping.json', 'w') as f:
    json.dump(updated_mapping, f, indent=2)

print("UUID mapping updated successfully!")
print(f"Processed {len(updated_mapping)} entries.")