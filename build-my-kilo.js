const fs = require("fs")
const { execSync } = require("child_process")
const path = require("path")

// CONFIGURATION
// Points to src/package.json as requested
const PACKAGE_PATH = path.join(__dirname, "src", "package.json")

// 1. Read the original file
let originalPackage
try {
	originalPackage = fs.readFileSync(PACKAGE_PATH, "utf8")
} catch (err) {
	console.error(`Error: Could not find file at ${PACKAGE_PATH}`)
	console.error("Are you sure you are in the project root?")
	process.exit(1)
}

const pkg = JSON.parse(originalPackage)

// 2. Modify specific fields for your custom build
pkg.displayName = "Kilo (My Version)"
// The extension ID is composed of "publisher.name", so this makes it unique
pkg.name = "kilo-custom-build"
pkg.publisher = "UzverUA" // Your GitHub username (from your git error earlier)
pkg.preview = true

// 3. Write the modified version to disk
console.log(`Modifying ${PACKAGE_PATH} for custom build...`)
fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2))

try {
	console.log("Running build...")
	// 4. Run the standard build command
	// stdio: 'inherit' lets you see the build colors and progress bar
	execSync("pnpm build", { stdio: "inherit" })
	console.log("Build successful!")
} catch (e) {
	console.error("Build failed.")
	process.exitCode = 1
} finally {
	// 5. CRITICAL: Restore the original file immediately
	// This happens even if the build fails, so Git stays clean.
	fs.writeFileSync(PACKAGE_PATH, originalPackage)
	console.log(`Start of clean up...`)
	console.log(`✨ Restored original ${PACKAGE_PATH}. Git status is clean.`)
}
