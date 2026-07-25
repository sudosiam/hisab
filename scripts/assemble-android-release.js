const { existsSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const androidDir = join(__dirname, '..', 'android');
const isWindows = process.platform === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';
const gradlePath = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');

if (!existsSync(gradlePath)) {
  console.error('Android Gradle wrapper was not found. Run Expo prebuild before assembling.');
  process.exit(1);
}

function resolveAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fallback = join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (existsSync(fallback)) return fallback;
  return null;
}

const sdk = resolveAndroidSdk();
if (!sdk) {
  console.error(
    'Android SDK not found. Set ANDROID_HOME, or install the SDK under %LOCALAPPDATA%\\Android\\Sdk.'
  );
  process.exit(1);
}

const localPropertiesPath = join(androidDir, 'local.properties');
const sdkDirValue = sdk.replace(/\\/g, '\\\\');
writeFileSync(localPropertiesPath, `sdk.dir=${sdkDirValue}\n`, 'utf8');

const gradlePropsPath = join(androidDir, 'gradle.properties');
if (existsSync(gradlePropsPath)) {
  let props = readFileSync(gradlePropsPath, 'utf8');
  const jvmArgs =
    'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';
  if (/^org\.gradle\.jvmargs=/m.test(props)) {
    props = props.replace(/^org\.gradle\.jvmargs=.*$/m, jvmArgs);
  } else {
    props += `\n${jvmArgs}\n`;
  }
  writeFileSync(gradlePropsPath, props, 'utf8');
}

const result = spawnSync(
  gradleCommand,
  ['assembleRelease', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'],
  {
    cwd: androidDir,
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
    },
  }
);

process.exit(result.status ?? 1);
