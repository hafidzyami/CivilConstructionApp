"""Device detection utilities for GPU/CPU selection"""

def check_cuda_available():
    """Check if CUDA GPU is available for PyTorch"""
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            print(f"[GPU] CUDA available: {device_name}")
            return True
        else:
            print("[CPU] CUDA not available, using CPU")
            return False
    except ImportError:
        print("[CPU] PyTorch not installed, using CPU")
        return False


def check_paddle_gpu_available():
    """Check if CUDA GPU is available for PaddlePaddle"""
    try:
        import paddle
        if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0:
            return True
        return False
    except:
        return False


def get_device(prefer_cuda=True):
    """Get the best available device"""
    if prefer_cuda and check_cuda_available():
        return 'cuda'
    return 'cpu'
