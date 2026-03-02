module.exports = {
  apps: [{
    name: 'human-test',
    script: '.next/standalone/server.js',
    env: {
      PORT: 3002,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
    },
  }],
}
