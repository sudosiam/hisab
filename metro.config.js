const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /node_modules[/\\]canvas[/\\].*/,
];

// Exclude Android/iOS build output dirs from file watching to avoid EPERM on Windows
config.watchFolders = (config.watchFolders || []).filter(Boolean);
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /.*[/\\]android[/\\]build[/\\].*/,
  /.*[/\\]android[/\\]\.cxx[/\\].*/,
  /.*[/\\]ios[/\\]build[/\\].*/,
];

module.exports = config;
