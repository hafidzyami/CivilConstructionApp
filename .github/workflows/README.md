# GitHub Actions Deployment Guide

## Setup GitHub Secrets

Untuk menggunakan workflow ini, Anda perlu menambahkan secrets berikut di GitHub repository:

### Required Secrets

1. **VM_HOST** - IP address atau hostname dari VM Anda
   - Contoh: `192.168.1.100` atau `myvm.example.com`

2. **VM_USERNAME** - Username untuk SSH ke VM
   - Contoh: `ubuntu`, `admin`, atau `root`

3. **VM_SSH_KEY** - Private SSH key untuk akses ke VM
   - Generate dengan: `ssh-keygen -t ed25519 -C "github-actions"`
   - Copy isi file private key (contoh: `~/.ssh/id_ed25519`)
   - Public key harus ditambahkan ke `~/.ssh/authorized_keys` di VM

4. **POSTGRES_PASSWORD** - Password untuk PostgreSQL database
   - Contoh: `your_secure_password_here`

### Optional Secrets

5. **VM_PORT** - SSH port (default: 22)
   - Hanya perlu jika VM menggunakan port SSH custom

6. **POSTGRES_USER** - PostgreSQL username (default: `postgres`)

7. **POSTGRES_DB** - PostgreSQL database name (default: `civilconstruction`)

## Cara Menambahkan Secrets di GitHub

1. Buka repository di GitHub
2. Klik **Settings** → **Secrets and variables** → **Actions**
3. Klik **New repository secret**
4. Masukkan name dan value
5. Klik **Add secret**

## Setup VM

### 1. Install Docker di VM

```bash
# Update package list
sudo apt-get update

# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify installation
docker --version
docker compose version
```

### 2. Setup SSH Key Authentication

Di **local machine** Anda:

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_key

# Copy public key ke VM
ssh-copy-id -i ~/.ssh/github_actions_key.pub username@your_vm_ip

# Test connection
ssh -i ~/.ssh/github_actions_key username@your_vm_ip
```

Copy **private key** (`~/.ssh/github_actions_key`) ke GitHub Secret `VM_SSH_KEY`.

### 3. Create Application Directory di VM

```bash
sudo mkdir -p /opt/civilconstruction
sudo chown $USER:$USER /opt/civilconstruction
```

### 4. Configure Firewall (jika ada)

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow application ports
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3001/tcp  # Backend

# Enable firewall
sudo ufw enable
```

## Workflow Trigger

Workflow akan berjalan otomatis ketika:
- Ada push ke branch `main`
- Manual trigger via GitHub Actions UI

### Manual Trigger

1. Buka repository di GitHub
2. Klik **Actions** tab
3. Pilih **Deploy to VM** workflow
4. Klik **Run workflow** button
5. Select branch dan klik **Run workflow**

## Workflow Steps

### 1. Build and Push Images
- Build Docker images untuk backend dan frontend
- Push ke GitHub Container Registry (ghcr.io)
- Cache layers untuk build yang lebih cepat

### 2. Deploy to VM
- SSH ke VM
- Login ke GitHub Container Registry
- Create/update docker-compose.yml
- Pull latest images
- Stop old containers
- Start new containers
- Clean up old images

### 3. Verify Deployment
- Wait for services to be healthy
- Check backend health endpoint
- Check frontend availability
- Show deployment status

## Monitoring

### Check Deployment Status di GitHub

1. Buka **Actions** tab di repository
2. Lihat status workflow run terbaru
3. Klik workflow run untuk melihat detail logs

### Check Application di VM

```bash
# SSH ke VM
ssh username@your_vm_ip

# Navigate to app directory
cd /opt/civilconstruction

# Check running containers
docker compose ps

# Check logs
docker compose logs -f

# Check specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Check backend health
curl http://localhost:3001/health

# Check frontend
curl http://localhost:3000
```

## Troubleshooting

### Deployment Failed

1. **Check GitHub Actions logs** untuk error messages
2. **SSH ke VM** dan check logs:
   ```bash
   cd /opt/civilconstruction
   docker compose logs
   ```

### Container Not Starting

```bash
# Check container status
docker compose ps

# View specific container logs
docker compose logs backend

# Restart specific service
docker compose restart backend
```

### Database Connection Issues

```bash
# Check if postgres is running
docker compose ps postgres

# Check postgres logs
docker compose logs postgres

# Test database connection
docker compose exec postgres psql -U postgres -d civilconstruction -c "SELECT 1;"
```

### Permission Issues

```bash
# Fix directory permissions
sudo chown -R $USER:$USER /opt/civilconstruction

# Fix docker permissions
sudo usermod -aG docker $USER
newgrp docker
```

### Clean Restart

```bash
# Stop all containers
docker compose down

# Remove volumes (WARNING: deletes database data)
docker compose down -v

# Clean all images
docker system prune -af

# Start fresh
docker compose up -d
```

## Accessing the Application

After successful deployment:

- **Frontend**: http://your_vm_ip:3000
- **Backend API**: http://your_vm_ip:3001
- **API Documentation**: http://your_vm_ip:3001/api-docs
- **Health Check**: http://your_vm_ip:3001/health

## Security Recommendations

1. **Use strong passwords** untuk PostgreSQL
2. **Setup HTTPS** dengan reverse proxy (Nginx/Traefik)
3. **Use firewall** untuk restrict access
4. **Rotate SSH keys** secara berkala
5. **Enable fail2ban** untuk prevent brute force attacks
6. **Regular backups** untuk database
7. **Monitor logs** untuk suspicious activities

## Backup Database

```bash
# Create backup
docker compose exec postgres pg_dump -U postgres civilconstruction > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose exec -T postgres psql -U postgres civilconstruction < backup_file.sql
```

## Updates and Maintenance

### Update Application
Just push to `main` branch - GitHub Actions will automatically deploy.

### Manual Update
```bash
cd /opt/civilconstruction
docker compose pull
docker compose up -d
```

### View Logs
```bash
docker compose logs -f --tail=100
```

## Cost Optimization

- Images are cached in GitHub Actions untuk faster builds
- Old Docker images di-cleanup automatically di VM
- Use multi-stage builds untuk smaller image sizes

## Support

Jika ada masalah:
1. Check GitHub Actions logs
2. Check VM logs: `docker compose logs`
3. Verify secrets are configured correctly
4. Ensure VM has Docker installed
5. Check firewall rules
