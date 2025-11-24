# 🚀 Step-by-Step Deployment Guide

Panduan lengkap untuk deploy dari awal (VM belum ada repo).

---

## 📋 Prerequisites

### 1. Akses ke VM
- IP address / hostname VM
- Username dengan sudo access
- SSH key atau password

### 2. GitHub Repository
- Repository sudah dibuat
- Code sudah ter-commit di local

---

## 🔧 Part 1: Setup VM (Pertama Kali)

### Step 1: SSH ke VM
```bash
ssh username@your_vm_ip
```

### Step 2: Update System
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Step 3: Install Docker
```bash
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

# Apply group changes (atau logout/login)
newgrp docker

# Verify installation
docker --version
docker compose version
```

### Step 4: Setup Firewall
```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow application ports
sudo ufw allow 6968/tcp  # Frontend
sudo ufw allow 6969/tcp  # Backend
sudo ufw allow 6967/tcp  # PostgreSQL (optional, hanya jika butuh akses eksternal)

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### Step 5: Create Application Directory
```bash
sudo mkdir -p /opt/civilconstruction
sudo chown $USER:$USER /opt/civilconstruction
cd /opt/civilconstruction
```

---

## 🔑 Part 2: Setup SSH Keys untuk GitHub Actions

### Step 1: Generate SSH Key (di VM)
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_key -N ""
```

### Step 2: Add Public Key ke authorized_keys (di VM)
```bash
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Step 3: Copy Private Key (di VM)
```bash
cat ~/.ssh/github_actions_key
```

Copy output private key (dari `-----BEGIN OPENSSH PRIVATE KEY-----` sampai `-----END OPENSSH PRIVATE KEY-----`)

### Step 4: Test SSH Connection (di VM, test ke diri sendiri)
```bash
ssh -i ~/.ssh/github_actions_key $USER@localhost
# Ketik 'yes' jika muncul prompt, lalu exit
exit
```

---

## 🔐 Part 3: Setup GitHub Secrets

Buka repository di GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Tambahkan secrets berikut:

1. **VM_HOST**
   - Value: IP address VM Anda (contoh: `192.168.1.100`)

2. **VM_USERNAME**
   - Value: Username SSH Anda (contoh: `ubuntu`)

3. **VM_SSH_KEY**
   - Value: Private key yang di-copy dari Step 2.3 di atas
   - Paste seluruh isi termasuk header dan footer

4. **POSTGRES_PASSWORD**
   - Value: Password yang kuat untuk PostgreSQL (contoh: `MySecureP@ssw0rd123`)

5. **VM_PORT** (Optional)
   - Value: `22` (default SSH port)
   - Hanya perlu jika SSH port berbeda

6. **POSTGRES_USER** (Optional)
   - Value: `postgres` (sudah default)

7. **POSTGRES_DB** (Optional)
   - Value: `civilconstruction` (sudah default)

---

## 📦 Part 4: Deploy dari Local ke GitHub

### Step 1: Pastikan Code Sudah Ready (di Local)
```bash
cd C:\CivilConstructionApp

# Check status
git status

# Add semua perubahan
git add .

# Commit
git commit -m "Initial setup for deployment"
```

### Step 2: Setup Remote (jika belum)
```bash
# Check remote
git remote -v

# Jika belum ada, tambahkan:
git remote add origin https://github.com/hafidzyami/CivilConstructionApp.git

# Atau jika sudah ada tapi salah URL:
git remote set-url origin https://github.com/hafidzyami/CivilConstructionApp.git
```

### Step 3: Push ke GitHub
```bash
# Push ke main branch
git push -u origin main
```

**✅ Selesai!** GitHub Actions akan otomatis:
1. Build Docker images
2. Push ke GitHub Container Registry
3. Deploy ke VM Anda
4. Verify deployment

---

## 👀 Part 5: Monitor Deployment

### Cara 1: Via GitHub UI
1. Buka repository di GitHub
2. Klik tab **Actions**
3. Lihat workflow "Deploy to VM" yang sedang running
4. Klik untuk melihat detail logs

### Cara 2: Via SSH ke VM
```bash
# SSH ke VM
ssh username@your_vm_ip

# Masuk ke directory aplikasi
cd /opt/civilconstruction

# Tunggu beberapa menit untuk deployment selesai, lalu cek:
docker compose ps

# Lihat logs real-time
docker compose logs -f

# Atau logs per service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

---

## ✅ Part 6: Verify Deployment

### Check dari Browser
- **Frontend**: http://your_vm_ip:6968
- **Backend API Docs**: http://your_vm_ip:6969/api-docs
- **Backend Health**: http://your_vm_ip:6969/health

### Check dari VM (via SSH)
```bash
# Check backend health
curl http://localhost:6969/health

# Should return: {"status":"ok","timestamp":"..."}

# Check frontend
curl -I http://localhost:6968

# Should return: HTTP/1.1 200 OK

# Check running containers
docker compose ps

# Should show 3 containers running (postgres, backend, frontend)
```

---

## 🔄 Part 7: Update Aplikasi (Deployment Selanjutnya)

Setelah setup awal selesai, untuk update selanjutnya tinggal:

```bash
# Di local machine
cd C:\CivilConstructionApp

# Edit code Anda
# ... make changes ...

# Commit dan push
git add .
git commit -m "Update feature XYZ"
git push origin main
```

**Otomatis deploy!** GitHub Actions akan handle sisanya.

---

## 🐛 Troubleshooting

### Deployment Gagal

**1. Check GitHub Actions Logs**
- Buka Actions tab di GitHub
- Lihat error message

**2. Check VM Logs**
```bash
ssh username@your_vm_ip
cd /opt/civilconstruction
docker compose logs
```

**3. Common Issues:**

**Issue: Port already in use**
```bash
# Check what's using the port
sudo lsof -i :6969
sudo lsof -i :6968
sudo lsof -i :6967

# Kill process jika ada
sudo kill -9 <PID>
```

**Issue: Permission denied**
```bash
# Fix docker permissions
sudo usermod -aG docker $USER
newgrp docker

# Fix directory permissions
sudo chown -R $USER:$USER /opt/civilconstruction
```

**Issue: Container tidak start**
```bash
# Rebuild from scratch
cd /opt/civilconstruction
docker compose down -v
docker compose pull
docker compose up -d

# Check logs
docker compose logs -f
```

**Issue: Database connection error**
```bash
# Check postgres container
docker compose ps postgres

# Check postgres logs
docker compose logs postgres

# Verify .env file
cat .env
# Pastikan POSTGRES_PASSWORD terisi dengan benar
```

---

## 🔄 Rollback (Jika Deployment Bermasalah)

```bash
# SSH ke VM
ssh username@your_vm_ip
cd /opt/civilconstruction

# Stop current deployment
docker compose down

# Pull specific version (ganti 'sha-xxx' dengan commit hash sebelumnya)
sed -i 's/:latest/:sha-xxx/g' docker-compose.yml
docker compose pull
docker compose up -d

# Atau rollback ke previous image
docker images | grep civilconstruction
# Cari image sebelumnya, lalu:
# Edit docker-compose.yml manual, ganti tag
docker compose up -d
```

---

## 📊 Monitoring & Maintenance

### View Logs
```bash
# All services
docker compose logs -f --tail=100

# Specific service
docker compose logs -f backend --tail=50
```

### Resource Usage
```bash
# Check container stats
docker stats

# Check disk usage
docker system df

# Clean up unused resources
docker system prune -af --volumes
```

### Backup Database
```bash
# Create backup
docker compose exec postgres pg_dump -U postgres civilconstruction > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose exec -T postgres psql -U postgres civilconstruction < backup_file.sql
```

### Update Secrets
Jika perlu update password/secrets:
1. Update di GitHub Secrets
2. SSH ke VM:
   ```bash
   cd /opt/civilconstruction
   nano .env  # Edit manual
   docker compose restart
   ```

---

## 🎯 Quick Reference

### Useful Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Restart specific service
docker compose restart backend

# View logs
docker compose logs -f

# Check status
docker compose ps

# Execute command in container
docker compose exec backend sh

# Clean everything
docker compose down -v
docker system prune -af

# Update and redeploy
git pull
docker compose pull
docker compose up -d
```

---

## 📞 Need Help?

- Check GitHub Actions logs
- Check VM container logs: `docker compose logs`
- Verify secrets di GitHub Settings
- Pastikan firewall ports sudah dibuka
- Test SSH connection ke VM
- Check Docker service: `sudo systemctl status docker`

---

**Happy Deploying! 🚀**
