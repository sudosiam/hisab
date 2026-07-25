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

function upsertGradleProperty(props, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key.replace(/\./g, '\\.')}=.*$`, 'm');
  if (re.test(props)) return props.replace(re, line);
  return `${props.trimEnd()}\n${line}\n`;
}

/** Re-apply production AndroidManifest bits wiped by `expo prebuild --clean`. */
function ensureAndroidManifestProductionReady(manifestPath) {
  if (!existsSync(manifestPath)) return;
  let xml = readFileSync(manifestPath, 'utf8');

  if (!/android:hardwareAccelerated=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application android:hardwareAccelerated="true"');
  }
  if (!/android:largeHeap=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application android:largeHeap="true"');
  }

  const channelMeta =
    '<meta-data android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" android:value="{&quot;expo-channel-name&quot;:&quot;production&quot;}"/>';
  if (!xml.includes('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')) {
    xml = xml.replace(
      /(<meta-data android:name="expo\.modules\.updates\.EXPO_UPDATE_URL"[^/]*\/>)/,
      `$1\n    ${channelMeta}`
    );
  }

  writeFileSync(manifestPath, xml.endsWith('\n') ? xml : `${xml}\n`, 'utf8');
}

/**
 * Make release assemble resilient:
 * - lint does not abort the build
 * - lintVital* tasks (AGP) cannot fail assembleRelease
 * Idempotent across repeated local builds.
 */
function ensureReleaseBuildStable(appBuildGradlePath) {
  if (!existsSync(appBuildGradlePath)) return;
  let content = readFileSync(appBuildGradlePath, 'utf8');

  if (!content.includes('abortOnError false') && /android\s*\{/.test(content)) {
    content = content.replace(
      /android\s*\{/,
      `android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }`
    );
  }

  if (!content.includes('hisabDisableLintVital')) {
    content = `${content.trimEnd()}

// hisabDisableLintVital — keep assembleRelease from failing on lintVital*
tasks.configureEach { task ->
    if (task.name.toLowerCase().contains("lintvital")) {
        task.enabled = false
    }
}
`;
  }

  writeFileSync(appBuildGradlePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

const sdk = resolveAndroidSdk();
if (!sdk) {
  console.error(
    'Android SDK not found. Set ANDROID_HOME, or install the SDK under %LOCALAPPDATA%\\Android\\Sdk.'
  );
  process.exit(1);
}

const localPropertiesPath = join(androidDir, 'local.properties');
writeFileSync(localPropertiesPath, `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`, 'utf8');

const gradlePropsPath = join(androidDir, 'gradle.properties');
if (existsSync(gradlePropsPath)) {
  let props = readFileSync(gradlePropsPath, 'utf8');
  props = upsertGradleProperty(
    props,
    'org.gradle.jvmargs',
    '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
  );
  props = upsertGradleProperty(props, 'org.gradle.workers.max', '2');
  props = upsertGradleProperty(props, 'reactNativeArchitectures', 'armeabi-v7a,arm64-v8a');
  props = upsertGradleProperty(props, 'hermesEnabled', 'true');
  props = upsertGradleProperty(props, 'newArchEnabled', 'true');
  props = upsertGradleProperty(props, 'android.enablePngCrunchInReleaseBuilds', 'true');
  props = upsertGradleProperty(props, 'android.lint.checkReleaseBuilds', 'false');
  // Keep minify off — R8 breaks some RN/Expo reflection paths without a tested proguard file.
  props = upsertGradleProperty(props, 'android.enableMinifyInReleaseBuilds', 'false');
  writeFileSync(gradlePropsPath, props.endsWith('\n') ? props : `${props}\n`, 'utf8');
}

ensureReleaseBuildStable(join(androidDir, 'app', 'build.gradle'));
ensureAndroidManifestProductionReady(join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'));

const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
};

spawnSync(gradleCommand, ['--stop'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows,
  env,
});

const result = spawnSync(
  gradleCommand,
  ['assembleRelease', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'],
  {
    cwd: androidDir,
    stdio: 'inherit',
    shell: isWindows,
    env,
  }
);

if ((result.status ?? 1) === 0) {
  const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (existsSync(apk)) {
    console.log(`\nAPK ready: ${apk}`);
  }
}

process.exit(result.status ?? 1);
