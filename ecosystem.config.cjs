const path = require("node:path")

const releaseDirectory = __dirname
const backendDirectory = path.join(releaseDirectory, "backend")
const frontendDirectory = path.join(releaseDirectory, "frontend")

module.exports = {
  apps: [
    {
      name: "restaurant-pos-backend",
      cwd: backendDirectory,
      script: "src/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
    {
      name: "restaurant-pos-frontend",
      cwd: frontendDirectory,
      script: path.join(frontendDirectory, "node_modules/next/dist/bin/next"),
      args: "start --hostname 0.0.0.0 --port 3000",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "700M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
}
