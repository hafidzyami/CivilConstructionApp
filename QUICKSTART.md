# 🎯 Quick Start - Deployment ke VM

## Port Configuration
- **Frontend**: 6968
- **Backend**: 6969  
- **PostgreSQL**: 6967

---

## ⚡ Step-by-Step Cepat

### 1️⃣ Setup VM (Sekali Saja)
```bash
# SSH ke VM
ssh username@your_vm_ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Setup directory
sudo mkdir -p /opt/civilconstruction
sudo chown $USER:$USER /opt/civilconstruction

# Setup firewall
sudo ufw allow 22,6968,6969/tcp
sudo ufw --force enable
```

### 2️⃣ Setup SSH Key untuk GitHub Actions
```bash
# Di VM
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_key -N ""
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Copy private key ini untuk GitHub Secrets
cat ~/.ssh/github_actions_key
```

### 3️⃣ Setup GitHub Secrets
Buka: **GitHub Repository → Settings → Secrets and variables → Actions**

Tambahkan:
- `VM_HOST` → IP VM Anda (contoh: `192.168.1.100`)
- `VM_USERNAME` → Username SSH (contoh: `ubuntu`)
- `VM_SSH_KEY` → Private key dari step 2
- `POSTGRES_PASSWORD` → Password kuat untuk database

### 4️⃣ Push ke GitHub
```bash
# Di local machine (C:\CivilConstructionApp)
git add .
git commit -m "Initial deployment setup"
git push origin main
```

**✅ SELESAI!** GitHub Actions akan auto-deploy ke VM.

---

## 🔍 Check Deployment

### Via Browser
- Frontend: http://your_vm_ip:6968
- Backend Docs: http://your_vm_ip:6969/api-docs
- Health Check: http://your_vm_ip:6969/health

### Via SSH
```bash
ssh username@your_vm_ip
cd /opt/civilconstruction
docker compose ps
docker compose logs -f
```

---

## 🔄 Update Selanjutnya

Tinggal push aja:
```bash
git add .
git commit -m "Update feature"
git push origin main
```

Otomatis deploy! 🚀

---

**Detail lengkap ada di DEPLOYMENT.md**
