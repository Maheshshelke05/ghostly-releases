import { execSync } from "child_process";
import fs from "fs";

const TOKEN = process.argv[2] || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("❌ GH_TOKEN is required! Usage: node publish.mjs <token>");
  process.exit(1);
}
const VERSION = pkg.version;

console.log(`🚀 Publishing Ghostly AI v${VERSION}...`);

process.env.GH_TOKEN = TOKEN;

try {
  console.log("📦 Building Windows Installer and uploading to GitHub Releases...");
  execSync("npm run dist -- --publish always", {
    stdio: "inherit",
    env: { ...process.env, GH_TOKEN: TOKEN },
  });
  console.log("✅ Build and upload complete!");

  console.log("🔍 Fetching GitHub draft release ID...");
  const res = await fetch(
    "https://api.github.com/repos/Maheshshelke05/ghostly-releases/releases",
    {
      headers: {
        Authorization: `token ${TOKEN}`,
        "User-Agent": "Ghostly-Publisher",
      },
    }
  );
  const releases = await res.json();
  const targetRelease = releases.find((r) => r.tag_name === `v${VERSION}`);

  if (!targetRelease) {
    console.warn(`⚠️ Release not found for v${VERSION} in API list (it might have auto-published).`);
  } else {
    console.log(`📢 Publishing release ID ${targetRelease.id}...`);
    await fetch(
      `https://api.github.com/repos/Maheshshelke05/ghostly-releases/releases/${targetRelease.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "Ghostly-Publisher",
        },
        body: JSON.stringify({
          draft: false,
          name: `Ghostly v${VERSION}`,
          body: "Bug fixes, performance improvements, and stability enhancements.",
        }),
      }
    );
  }

  console.log(`\n🎉 Ghostly AI v${VERSION} published successfully!`);
  console.log("👻 Users will see the update in their desktop app automatically!");
} catch (err) {
  console.error("❌ Publish failed:", err.message);
  process.exit(1);
}
