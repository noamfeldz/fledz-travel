const path = require('path');
const fs = require('fs');

// Load .env file from backend directory
const envPath = path.join(__dirname, 'backend', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        env[key] = value;
      }
    }
  });
}

module.exports = {
  apps: [{
    name: 'fledz-travel-backend',
    script: './backend/server.js',
    cwd: process.cwd(),
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3004,
      HOST: '0.0.0.0',
      ...env,
    },
    error_file: '/var/log/pm2/fledz-travel-error.log',
    out_file: '/var/log/pm2/fledz-travel-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    autorestart: true,
  }],
};
