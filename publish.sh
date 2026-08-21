#!/bin/bash
# Ghostly AI — One command publish script
# Usage: bash publish.sh YOUR_GITHUB_TOKEN

TOKEN=$1

if [ -z "$TOKEN" ]; then
  echo "❌ Token missing! Usage: bash publish.sh YOUR_TOKEN"
  exit 1
fi

# Get version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "🚀 Publishing Ghostly AI v$VERSION..."

# Step 1: Build + Upload to GitHub
export GH_TOKEN=$TOKEN
npm run dist -- --publish always

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ Build done! Publishing release..."

# Step 2: Find the draft release and publish it
RELEASE=$(curl -s "https://api.github.com/repos/Maheshshelke05/ghostly-releases/releases" \
  -H "Authorization: token $TOKEN" | \
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const releases = JSON.parse(d);
      const r = releases.find(r => r.tag_name === 'v$VERSION');
      if(r) console.log(r.id);
    });
  ")

if [ -z "$RELEASE" ]; then
  echo "⚠️  Release not found for v$VERSION"
  exit 1
fi

# Step 3: Publish the release (draft: false)
curl -s -X PATCH "https://api.github.com/repos/Maheshshelke05/ghostly-releases/releases/$RELEASE" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"draft":false,"name":"Ghostly v'"$VERSION"'","body":"Bug fixes, performance improvements, and stability enhancements."}' > /dev/null

echo ""
echo "✅ Ghostly AI v$VERSION published successfully!"
echo "👻 Users will see the update in their app automatically!"
