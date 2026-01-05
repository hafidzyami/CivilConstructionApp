import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib.pyplot as plt
import img2pdf
import os

def export_cad_region(dxf_path, regions, output_pdf="final_submission.pdf"):
    """
    Memotong wilayah tertentu dari DXF dan menyimpannya ke PDF.
    regions: dict berisi {'Nama_Dokumen': (min_x, min_y, max_x, max_y)}
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    image_files = []

    for name, (x1, y1, x2, y2) in regions.items():
        print(f"Mengolah wilayah: {name}...")
        
        # Setup Rendering
        fig = plt.figure(figsize=(12, 12))
        ax = fig.add_axes([0, 0, 1, 1])
        ctx = RenderContext(doc)
        out = MatplotlibBackend(ax)
        Frontend(ctx, out).draw_layout(msp, finalize=True)

        # Melakukan 'Crop' dengan mengatur limit sumbu koordinat (Windowing)
        ax.set_xlim(x1, x2)
        ax.set_ylim(y1, y2)
        ax.axis('off') # Menghilangkan border angka koordinat

        # Simpan sebagai PNG sementara
        img_name = f"{name}.png"
        fig.savefig(img_name, dpi=300, bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        image_files.append(img_name)

    # Menggabungkan semua gambar menjadi satu PDF untuk VLM/Permit
    print("Membuat file PDF gabungan...")
    with open(output_pdf, "wb") as f:
        f.write(img2pdf.convert(image_files))

    # Opsional: Hapus file gambar sementara
    # for img in image_files: os.remove(img)
    print(f"Selesai! File tersedia di: {output_pdf}")

# --- KONFIGURASI KOORDINAT (Berdasarkan analisis file 50Py2F) ---
# Koordinat ini adalah estimasi di mana diagram berada dalam Model Space.
# Anda bisa menyesuaikan angka ini setelah melakukan 'Diagnostic' koordinat.
regions_to_crop = {
    "Site_Plan_Permit": (2237536, 532109, 2300000, 600000),  # Wilayah Lahan
    "Floor_Plan_1F": (2400000, 550000, 2550000, 700000),     # Denah Lantai 1
    "Floor_Plan_2F": (2600000, 550000, 2750000, 700000)      # Denah Lantai 2
}

if __name__ == "__main__":
    export_cad_region("50Py2F R.C House.dxf", regions_to_crop)