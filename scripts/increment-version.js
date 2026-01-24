import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function incrementVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  
  // If patch < 9, increment patch
  if (patch < 9) {
    return `${major}.${minor}.${patch + 1}`;
  }
  
  // If patch is 9 and minor < 9, increment minor and reset patch
  if (patch === 9 && minor < 9) {
    return `${major}.${minor + 1}.0`;
  }
  
  // If patch is 9 and minor is 9, increment major and reset both
  if (patch === 9 && minor === 9) {
    return `${major + 1}.0.0`;
  }
  
  return version;
}

function updatePackageJson(filePath, newVersion) {
  const content = readFileSync(filePath, 'utf-8');
  const packageJson = JSON.parse(content);
  packageJson.version = newVersion;
  writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
}

function updatePackageLockJson(filePath, newVersion) {
  const content = readFileSync(filePath, 'utf-8');
  const packageLock = JSON.parse(content);
  packageLock.version = newVersion;
  
  // Also update the version in the packages[""] section if it exists
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = newVersion;
  }
  
  writeFileSync(filePath, JSON.stringify(packageLock, null, 2) + '\n', 'utf-8');
}

try {
  // Read current version from package.json
  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const currentVersion = packageJson.version;
  
  // Increment version
  const newVersion = incrementVersion(currentVersion);
  
  console.log(`Incrementing version: ${currentVersion} -> ${newVersion}`);
  
  // Update package.json
  updatePackageJson(packageJsonPath, newVersion);
  
  // Update package-lock.json
  const packageLockPath = join(rootDir, 'package-lock.json');
  updatePackageLockJson(packageLockPath, newVersion);
  
  console.log(`Version updated successfully to ${newVersion}`);
  
  // Stage the updated files
  process.exit(0);
} catch (error) {
  console.error('Error incrementing version:', error);
  process.exit(1);
}
