/**
 * Babel config for the Masary app.
 * - babel-preset-expo: Expo SDK 57 defaults (JSX, TypeScript, router support).
 * - nativewind/babel: NativeWind v4 className support.
 * - react-native-worklets/plugin: required by Reanimated 4 (SDK 57).
 * Used by: Metro bundler for every build.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-worklets/plugin'],
  };
};
