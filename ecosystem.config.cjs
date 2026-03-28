module.exports = {
  apps: [
    {
      name: "voxora-api",
      script: "./apps/api/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s"
    },
    {
      name: "voxora-worker",
      script: "./apps/worker/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 30000,
      listen_timeout: 10000
    }
  ]
};
