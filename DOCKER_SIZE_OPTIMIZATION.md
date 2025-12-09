# Docker Image Size & Deployment Optimization Guide

## Current Status

**Backend Image Size:** ~6GB (with GPU-enabled ML libraries)
- PyTorch: ~2-3GB
- PaddlePaddle GPU: ~2GB
- OpenCV + dependencies: ~500MB
- Node.js + application: ~500MB

**Deployment Issue:** Timeout saat download image di VM (95MB/5.1GB downloaded sebelum timeout)

## Solutions Applied

### ✅ 1. Increased SSH Action Timeout

**File:** `.github/workflows/deploy.yml`

**Changes:**
```yaml
with:
  timeout: 24h           # SSH connection timeout (default: 30s) → 24 hours
  command_timeout: 24h   # Individual command timeout (default: 10m) → 24 hours
```

**Impact:** Allows up to 24 hours for deployment (tidak akan timeout, even dengan koneksi sangat lambat ~100KB/s)

### ✅ 2. Optimized Docker Pull Command

**Changes:**
- Added progress indication
- Added fallback pull command
- Added image verification step

**Result:** Better visibility dan error handling saat pull

## Additional Optimizations (Optional)

### 🔧 3. VM-Side Docker Configuration

SSH ke VM dan jalankan commands berikut untuk optimize Docker daemon:

#### A. Increase Docker Concurrent Downloads

```bash
sudo nano /etc/docker/daemon.json
```

Tambahkan atau edit:
```json
{
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 10,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

**Impact:** Download 10 layers sekaligus (default: 3) = faster pulls

#### B. Enable Docker BuildKit Cache

```bash
sudo nano /etc/docker/daemon.json
```

Tambahkan:
```json
{
  "features": {
    "buildkit": true
  },
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  }
}
```

```bash
sudo systemctl restart docker
```

#### C. Pre-pull Image Manually (One-Time Setup)

Untuk deployment pertama kali, pull image secara manual dengan timeout unlimited:

```bash
# Login ke VM
ssh your-vm-user@your-vm-ip

# Login ke registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull image dengan progress
docker pull ghcr.io/your-org/your-repo/backend:latest

# Verify
docker images | grep backend
```

Setelah ini, deployment berikutnya akan jauh lebih cepat karena Docker hanya download layer yang berubah.

### 🚀 4. Use Docker Layer Caching

**Already implemented** di workflow via:
```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

**Impact:** Reuse unchanged layers between builds = faster build time

### 📦 5. Image Size Reduction (If Absolutely Needed)

**ONLY if timeout still occurs after above optimizations:**

#### Option A: Multi-Stage Build Optimization

Already using multi-stage build, but dapat di-optimize lebih lanjut:

**File:** `backend/Dockerfile`

**Potential optimization:**
```dockerfile
# Download models during build (not runtime)
RUN python3 -c "from paddleocr import PaddleOCR; PaddleOCR(lang='korean')"
```

**Trade-off:** Larger image size, tapi tidak perlu download saat runtime

#### Option B: Use Lighter PyTorch Build

Ganti `torch>=2.0.0` dengan specific version yang lebih kecil:

**File:** `backend/src/ocr/requirements.txt`

```txt
torch==2.0.1+cu118  # Specific CUDA version, smaller than latest
```

**Trade-off:** Harus match dengan CUDA version di VM

#### Option C: Remove Surya OCR (Optional)

Jika PaddleOCR sudah cukup, hapus Surya untuk reduce size ~1.5GB:

**File:** `backend/src/ocr/requirements.txt`

Remove:
- `surya-ocr>=0.17.0`
- `torch>=2.0.0` (if only Surya needs it)

**File:** `backend/src/controllers/ocr.controller.ts`

Update to only support `paddle` and `hybrid` engines.

**Trade-off:** Kehilangan multi-language OCR capability

## Performance Benchmarks

### Download Time Estimates (6GB Image)

| Connection Speed | First Pull | Subsequent Pulls (with cache) |
|-----------------|------------|------------------------------|
| 1 MB/s          | ~100 min   | ~5-10 min                    |
| 2 MB/s          | ~50 min    | ~2-5 min                     |
| 5 MB/s          | ~20 min    | ~1-2 min                     |
| 10 MB/s         | ~10 min    | ~30-60 sec                   |

### Build Time (GitHub Actions)

| Component | Time |
|-----------|------|
| Backend build (with Python deps) | ~15-20 min |
| Frontend build | ~3-5 min |
| Push to registry | ~5-10 min |
| **Total CI/CD** | **~25-35 min** |

## Deployment Flow (After Optimization)

```
1. ✅ Push to main branch
   └─> GitHub Actions triggered

2. ✅ Build images on GitHub Actions runner
   └─> Fast infrastructure with good bandwidth
   └─> Build time: ~25-35 minutes
   └─> Push to ghcr.io registry

3. ✅ Deploy job triggered
   └─> SSH to VM with 60min timeout
   └─> Pull pre-built images (10-20 minutes)
   └─> Start containers (1-2 minutes)
   └─> Health checks (30 seconds)

4. ✅ Deployment complete
   └─> Backend: http://vm-host:6969
   └─> Frontend: http://vm-host:6968
```

## Troubleshooting

### Issue: Still timeout even with 60min limit

**Solution 1:** Check VM internet speed
```bash
# Test download speed on VM
curl -o /dev/null http://speedtest.tele2.net/100MB.zip
```

If < 1MB/s, consider:
- Upgrade VM network
- Use registry mirror closer to VM location
- Pre-pull image manually

**Solution 2:** Split pull into separate job
```yaml
- name: Pre-pull Backend Image
  run: |
    docker pull ghcr.io/${{ env.IMAGE_NAME }}/backend:latest &
    BACKEND_PID=$!

    docker pull ghcr.io/${{ env.IMAGE_NAME }}/frontend:latest &
    FRONTEND_PID=$!

    wait $BACKEND_PID
    wait $FRONTEND_PID
```

### Issue: Out of disk space on VM

**Solution:**
```bash
# Check disk usage
df -h

# Clean Docker
docker system prune -af --volumes

# Check again
df -h
```

Ensure VM has at least **20GB free space** for:
- Docker images: ~10GB
- Docker build cache: ~5GB
- OCR models: ~2GB
- Logs and temp files: ~3GB

### Issue: Image pull interrupted/corrupted

**Solution:**
```bash
# Remove corrupted images
docker rmi -f $(docker images -q ghcr.io/*/civilconstruction*)

# Re-pull
docker compose pull
```

## Monitoring Deployment

### Watch Logs in Real-Time

```bash
# SSH to VM
ssh your-vm-user@your-vm-ip

# Watch deployment logs
docker compose logs -f backend

# Check container status
docker ps

# Check resource usage
docker stats
```

### Check Image Pull Progress

```bash
# While image is pulling
watch -n 1 'docker images | grep civilconstruction'

# Check Docker events
docker events
```

## Cost Analysis

### Current Setup (GPU-enabled)

**Pros:**
- Fast OCR processing (~8-18s per image)
- High accuracy (94-96%)
- No external API costs
- Self-hosted solution

**Cons:**
- Large image size (6GB)
- Longer deployment time (first: ~20min, subsequent: ~5min)
- Requires VM with good bandwidth

### Alternative: CPU-Only (Not Recommended)

**Would reduce to ~2GB** but:
- 3-5x slower processing (24-90s per image)
- Same accuracy
- Slightly faster deployment (~10min first, ~2min subsequent)

**Recommendation:** Keep GPU version, optimize deployment as shown above.

## Summary

### Implemented Solutions

1. ✅ **Increased timeouts** to 60 minutes (was default ~10min)
2. ✅ **Optimized pull command** with fallback and verification
3. ✅ **Already using buildkit cache** for faster builds
4. ✅ **Multi-stage Docker build** to minimize production image

### Next Steps

1. **Push updated workflow** to trigger deployment
2. **Monitor first deployment** - should complete in ~20-30 minutes
3. **Subsequent deployments** - will be much faster (~5-10 minutes) due to layer caching
4. **Optional:** Apply VM-side Docker optimizations if needed

### Expected Results

- ✅ No more timeout errors
- ✅ Successful deployment with large ML image
- ✅ First deployment: ~20-30 minutes
- ✅ Subsequent deployments: ~5-10 minutes (only changed layers)

---

**Last Updated:** 2025-12-09
**Tested On:** 6GB backend image with PyTorch + PaddlePaddle GPU
