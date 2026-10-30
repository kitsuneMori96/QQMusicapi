/**
 * pm2 常驻部署: pm2 start ecosystem.config.cjs
 * 常用命令: pm2 logs qqmusic-api / pm2 reload qqmusic-api / pm2 save
 */
module.exports = {
  apps: [
    {
      name: "qqmusic-api",
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
        PORT: 3300,
        HOST: "0.0.0.0",
        PLATFORM: "android",
      },
    },
  ],
};
