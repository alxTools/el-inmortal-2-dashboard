#!/bin/bash

# Deploy script for El Inmortal 2 Dashboard on Ubuntu/Debian

set -e

echo "🎵🎤👑 EL INMORTAL 2 LAUNCH DASHBOARD - Deploy Script 👑🎤🎵"
echo ""

# Update system
echo "🔄 Updating system packages..."
sudo apt-get update

# Install Node.js 18.x
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install MySQL client (for database connection)
echo "📦 Installing MySQL client..."
sudo apt-get install -y mysql-client

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/el-inmortal-2-dashboard
sudo chown $USER:$USER /var/www/el-inmortal-2-dashboard

# Clone the repository (you'll need to add your SSH key or use HTTPS)
echo "📥 Cloning repository..."
cd /var/www/el-inmortal-2-dashboard
# git clone https://github.com/alxTools/el-inmortal-2-dashboard.git .
# OR if you already have the files, just copy them here

echo ""
echo "✅ Base system ready!"
echo ""
echo "Next steps:"
echo "1. Copy your application files to /var/www/el-inmortal-2-dashboard/"
echo "2. Run: cd /var/www/el-inmortal-2-dashboard && npm install"
echo "3. Create .env file with your environment variables"
echo "4. Run: pm2 start ecosystem.config.js"
echo ""
echo "🚀 Ready to deploy!"
