module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-tvos|react-native-video|@react-native/.*)/)',
  ],
};
