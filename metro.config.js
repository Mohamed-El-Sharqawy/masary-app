/**
 * Metro config for the Masary app.
 * Wraps the Expo default config with NativeWind v4 CSS support.
 * Used by: Metro bundler (expo start / expo export / EAS builds).
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
