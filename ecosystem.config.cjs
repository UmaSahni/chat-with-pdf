module.exports = {
  apps: [
    {
      name: 'rag-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      }
    },
    {
      name: 'rag-frontend',
      script: 'npm',
      args: 'run start -- -H 0.0.0.0 -p 3000',
      cwd: `${__dirname}/frontend`,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

