# 🎋 BotMint FCFS - Auto Minter

Bot auto-mint FCFS (First Come First Served) untuk koleksi **The Bamboo Order** di OpenSea.

## ⚡ Fitur

- **Base Chain** - Optimized untuk Base L2 (gas super murah!)
- **Auto-detect mint** - Monitoring otomatis kapan mint dibuka
- **FCFS Speed** - Eksekusi secepat mungkin saat mint live
- **Multi-wallet** - Support banyak wallet sekaligus (mint paralel)
- **Gas optimization** - EIP-1559 gas pricing dengan proteksi max gas
- **Auto-retry** - Retry otomatis jika transaksi gagal
- **Desktop notification** - Alert saat mint berhasil/gagal
- **Monitor mode** - Pantau status mint tanpa eksekusi

## 📋 Info Contract

- **Chain:** Base (Chain ID: 8453)
- **Contract:** `0x87ed2acc2e780fba347d67b4840f3619987bb8a5`
- **Explorer:** https://basescan.org/address/0x87ed2acc2e780fba347d67b4840f3619987bb8a5

## 📋 Prerequisite

- Node.js >= 18
- RPC Provider Base chain (publik gratis: https://mainnet.base.org)
- ETH di wallet (di Base chain) untuk gas + mint price
- Gas di Base sangat murah (<$0.01 per tx!)

## 🚀 Instalasi

```bash
# 1. Masuk ke folder bot
cd botmint

# 2. Install dependencies
npm install

# 3. Copy config
cp .env.example .env

# 4. Edit .env dengan konfigurasi kamu
nano .env
```

## ⚙️ Konfigurasi (.env)

### Wajib diisi:

| Variable | Deskripsi |
|----------|-----------|
| `RPC_URL` | URL RPC provider (Alchemy/Infura) |
| `PRIVATE_KEY` | Private key wallet kamu |
| `CONTRACT_ADDRESS` | Address contract NFT |
| `MINT_PRICE` | Harga mint dalam ETH |

### Cara mendapatkan Contract Address:

Contract sudah di-set otomatis:
- **Address:** `0x87ed2acc2e780fba347d67b4840f3619987bb8a5`
- **Chain:** Base (8453)
- **Explorer:** https://basescan.org/address/0x87ed2acc2e780fba347d67b4840f3619987bb8a5

### Cara mendapatkan Mint Function:

1. Buka contract di BaseScan: https://basescan.org/address/0x87ed2acc2e780fba347d67b4840f3619987bb8a5#writeContract
2. Tab "Contract" → "Write Contract"
3. Cari function mint (biasanya: `mint`, `publicMint`, `claim`)
4. Set di `MINT_FUNCTION` di .env

## 🎮 Penggunaan

### Test Koneksi (jalankan pertama kali):
```bash
npm run test-connection
```

### Monitor Status Mint:
```bash
npm run monitor
```

### Jalankan Bot (Auto Mint):
```bash
npm start
```

## 📖 Mode Bot

### 1. Monitor Mode (default)
```env
BOT_MODE=monitor
```
Bot akan polling contract terus-menerus dan otomatis mint saat terdeteksi mint dibuka.

### 2. Instant Mode
```env
BOT_MODE=instant
```
Bot langsung eksekusi mint tanpa cek status. Gunakan jika kamu sudah yakin mint sedang aktif.

## 🔧 Tips & Strategi FCFS

1. **Gunakan RPC premium** (Alchemy Base) untuk latency rendah
2. **Gas di Base sangat murah** - Tapi tetap naikkan `PRIORITY_FEE_GWEI` sedikit untuk prioritas
3. **Jalankan bot sebelum mint dibuka** - Gunakan mode `monitor`
4. **Multi-wallet** - Tambahkan beberapa wallet untuk peluang lebih besar
5. **Bridge ETH ke Base** - Pastikan wallet punya ETH di Base chain (bridge via https://bridge.base.org)

## 📂 Struktur File

```
botmint/
├── .env.example          # Template konfigurasi
├── .env                  # Konfigurasi kamu (JANGAN SHARE!)
├── package.json
├── README.md
└── src/
    ├── bot.js            # Script utama bot
    ├── monitor.js        # Monitor-only mode
    ├── test-connection.js # Test koneksi
    ├── config.js         # Loader konfigurasi
    ├── abi.js            # Contract ABI
    └── utils/
        ├── logger.js     # Logger dengan warna
        ├── wallet.js     # Wallet manager
        ├── gas.js        # Gas estimator
        └── notifier.js   # Desktop notifications
```

## ⚠️ PERINGATAN PENTING

1. **JANGAN pernah share private key** ke siapapun
2. **File .env JANGAN di-commit** ke Git (sudah ada di .gitignore)
3. **Test di testnet dulu** sebelum mainnet (set `CHAIN_ID=11155111` untuk Sepolia)
4. **Risiko gas war** - Saat FCFS, gas bisa sangat mahal
5. **DYOR** - Pastikan project legitimate sebelum mint
6. **Bridge ETH ke Base** - Kamu butuh ETH di Base chain, bukan di Ethereum mainnet

## 🛡️ Keamanan

- Private key disimpan lokal di `.env` 
- Tidak ada data yang dikirim ke server luar
- Bot hanya berinteraksi langsung dengan blockchain via RPC

## ❓ Troubleshooting

| Error | Solusi |
|-------|--------|
| `RPC gagal` | Periksa RPC_URL, pastikan API key valid |
| `Insufficient funds` | Wallet tidak cukup ETH |
| `Transaction reverted` | Mint belum aktif / sudah sold out / melebihi limit |
| `Gas estimate gagal` | Mint function salah atau mint belum aktif |
| `Nonce too low` | Ada transaksi pending, tunggu atau speed up |

## 📝 Disclaimer

Bot ini dibuat untuk tujuan edukasi. Penggunaan bot untuk mint NFT mungkin melanggar Terms of Service dari beberapa platform. Gunakan dengan risiko sendiri.

---

Made with ☕ by BotMint FCFS
