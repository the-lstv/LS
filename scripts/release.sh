# !/bin/bash

VERSION="$1"
VERSION_PATH="misc/backend/akeno-cdn-api-addon/versions/$VERSION"

echo "Releasing as $VERSION"

mkdir -p $VERSION_PATH
cp -rL dist/* $VERSION_PATH

