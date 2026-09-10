# Preserve small Sales JPEG sources

The original QM630S image passed the number OCR regression, but re-encoding it at JPEG quality 88 reproduced a blank bill number. The shared uploader currently re-encodes even small JPEGs.

Sales now opts into preserving original JPEG bytes after successful image decoding, provided the original is at most 3 MiB and its longest edge is at most 2200 pixels. Larger files and other formats retain existing compression, limits and camera/gallery behavior. Other proof entry points retain their existing behavior. Original EXIF orientation remains available to preview; Sales OCR retains quarter-turn detection.

This removes a demonstrated source of degradation. It is not proof of success with the actual phone source, and does not guarantee recognition of all photos. The user must select the original photo again; retrying an already compressed pending upload cannot recover detail.

Schema 60 unchanged. Deploy with apply-sales-photo-source-production.sh and EXPECTED_COMMIT.
