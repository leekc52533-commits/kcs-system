# Sales OCR orientation and retry fix

The phone screenshot showed a settlement rotated by a quarter turn. Previous preprocessing used deskew (small angles only), and re-reading only filled blanks, leaving wrong machine-filled values unchanged.

Try quarter-turn orientations when initial OCR has little usable content, select by recognized headers/slips and line arithmetic, then deskew the chosen direction. Request work has a 45-second overall budget. Return an upright preview while retaining the submitted original as proof. Show whether factory text was recognized but unmatched versus unreadable. Retry refreshes previous OCR values, preserving reviewer edits.

Schema stays 60. Twelve targeted tests pass including actual Tesseract/convert tests for 90/180/270-degree fixtures, retry preservation, save/export and three-language review. The earlier real tilted sample also now produces an upright draft, but some digits/weights still require review; this fix does not guarantee perfect OCR. Production/phone validation follows deployment.
