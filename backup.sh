#!/bin/bash

# VARIABLES

# Define a prefix for the backup filename
prefix="backup"

# Get the current date in YYYY-MM-DD format
date=$(date +%F)

# Compose the full filename with prefix and date
filename="${prefix}_${date}.tar.gz"

# Specify the local folder to compress
localFolder="/devenv/data"

# Target folder on the remote server to copy the file into
targetFolder="/path/to/remote/folder"

# Shut down the databus, adjust for stack
docker compose stop

# Create a tar.gz archive of the local folder with the composed filename
tar -czf "$filename" "$localFolder"

# Securely copy the archive to the remote server's target folder
scp "$filename" "$targetFolder"

# Remove the local tar.gz archive to clean up
rm "$filename"

# Restart the databus, adjust for stack
docker compose up -d