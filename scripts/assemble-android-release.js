const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const androidDir = join(__dirname, '..', 'android');
const isWindows = process.platform === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';
const gradlePath = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');

if (!existsSync(gradlePath)) {
  console.error('Android Gradle wrapper was not found. Run Expo prebuild before assembling.');
  process.exit(1);
}

const result = spawnSync(gradleCommand, ['assembleRelease'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows,
});

process.exit(result.status ?? 1);
