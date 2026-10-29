# RELLZ STORE — Dashboard Admin + QRIS

Starter project: Cloudflare Workers + D1 Database + Midtrans Snap.

## Yang sudah tersedia
- Toko publik untuk layanan JASA JOKI KONTAK.
- Tombol WhatsApp admin 08818375778.
- Checkout QRIS melalui Midtrans Snap.
- Verifikasi status pembayaran dari server ke Midtrans.
- Notifikasi Midtrans dengan pemeriksaan signature dan konfirmasi status server-to-server.
- Database D1 untuk menyimpan pesanan.
- Dashboard admin di `/admin.html`: login, daftar pesanan, status pembayaran, nomor pelanggan, ubah pengerjaan menjadi processing/completed.
- Status pengerjaan hanya dapat diubah bila pembayaran berstatus paid.

## Pengaturan sebelum dipakai
1. Ubah `PRICE_IDR` di `src/index.js` ke harga layanan yang benar.
2. Ganti `CLIENT_KEY` di `public/index.html` dengan Client Key Sandbox saat uji coba.
3. Jangan pernah masukkan Server Key ke HTML atau GitHub.
4. Proses "joki kontak" hanya boleh dilakukan dengan izin pemilik data/kontak dan tidak untuk spam, scraping, doxxing, mengambil alih akun, atau mengirim pesan tanpa persetujuan.

## Deploy dari HP menggunakan GitHub Codespaces
1. Buat akun GitHub dan Cloudflare.
2. Ekstrak ZIP dan upload seluruh isi folder ini ke root repository GitHub.
3. Buka repository GitHub → Code → Codespaces → Create codespace (jika tersedia pada akun).
4. Di terminal Codespaces jalankan:
   `npm install -g wrangler`
   `npx wrangler login`
5. Buat database:
   `npx wrangler d1 create rellz-store-orders`
   Salin `database_id` hasilnya dan ganti nilai `GANTI_DENGAN_DATABASE_ID_D1` di `wrangler.jsonc`.
6. Jalankan migrasi:
   `npx wrangler d1 migrations apply rellz-store-orders --remote`
7. Set secret satu per satu:
   `npx wrangler secret put MIDTRANS_SERVER_KEY`
   Tempel Server Key Midtrans Sandbox saat diminta.
   `npx wrangler secret put MIDTRANS_IS_PRODUCTION`
   Isi `false` untuk Sandbox.
   `npx wrangler secret put ADMIN_PASSWORD`
   Isi password admin yang kuat dan unik (minimal 16 karakter disarankan).
8. Ganti `CLIENT_KEY` di `public/index.html` dengan Client Key Sandbox.
9. Deploy:
   `npx wrangler deploy`
10. Buka URL Worker. Toko ada di `/`, dashboard admin di `/admin.html`.
11. Di Midtrans Sandbox, atur Payment Notification URL ke `https://NAMA-WORKER.workers.dev/api/notification`.
12. Tes pembayaran Sandbox sampai status di dashboard berubah menjadi paid.
13. Setelah merchant dan QRIS Production diaktifkan oleh Midtrans, ubah Client Key dan Server Key ke Production, lalu set `MIDTRANS_IS_PRODUCTION` menjadi `true` dan deploy ulang.

## Perhatian
- D1 menyimpan maksimal 200 pesanan terakhir yang ditampilkan dashboard; data tetap tersimpan di database.
- Starter ini belum memiliki refund, ekspor laporan, pengaturan harga dari dashboard, pembatasan percobaan login, audit log lengkap, atau backup otomatis. Tambahkan sebelum skala operasional besar.
- Harga contoh Rp25.000, jangan publikasikan sebelum diganti.
- Untuk production, gunakan custom domain dan periksa kuota serta ketentuan Cloudflare terbaru. Paket gratis tidak menjamin SLA bisnis.
- Cloudflare Worker secrets aman untuk menyimpan Server Key dan password admin. Jangan membagikan secrets tersebut.
